/**
 * Integration tests for the F5 backend routes:
 *   GET  /api/sessions/:id/results
 *   PATCH /api/sessions/:id/review
 *   POST  /api/sessions/:id/retake
 *
 * REQUIRED: retake-incorrect subset test (F5 spec).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-results-test-"));
const dbPath = path.join(tmpDir, "results.db");
const examsDir = path.join(tmpDir, "Exams");
const easyDir = path.join(examsDir, "Cloud", "AWS", "SAA", "Easy");

process.env.DB_PATH = dbPath;
process.env.EXAMS_ROOT = examsDir;

// Reset stale singletons from sibling test files in this process.
{
  const g = globalThis as Record<string, unknown>;
  if (g.__certprepContainer) g.__certprepContainer = undefined;
  if (g.__certprepDb) {
    try { (g.__certprepDb as { close(): void }).close(); } catch { /* already closed */ }
    g.__certprepDb = undefined;
  }
}

const QUES_PATH = "Exams/Cloud/AWS/SAA/Easy";

/**
 * A 4-question set with known correct answers (A,B,C,D in order) so tests can
 * construct predictable outcomes.
 */
function makeSet(name: string, count = 4) {
  const answers = ["A", "B", "C", "D"];
  return {
    setId: `set-${name}`,
    setTitle: `Set ${name}`,
    difficulty: "Easy",
    questions: Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      questionText: `Q${i + 1} of ${name}`,
      options: { A: "alpha", B: "bravo", C: "charlie", D: "delta" },
      correctAnswer: answers[i % 4],
      explanations: {
        A: { description: "A", reason: "ra" },
        B: { description: "B", reason: "rb" },
        C: { description: "C", reason: "rc" },
        D: { description: "D", reason: "rd" },
      },
      Tips: `tip for Q${i + 1}`,
    })),
  };
}

function writeSet(name: string, count = 4) {
  fs.mkdirSync(easyDir, { recursive: true });
  const file = path.join(easyDir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(makeSet(name, count)));
  return file;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

type Handler = (req: Request, ctx: unknown) => Promise<Response>;

async function engine() {
  const { getContainer } = await import("@/server/container");
  return getContainer().services.examEngine;
}

let GET_results: Handler;
let PATCH_review: Handler;
let POST_retake: Handler;

let scan: () => Promise<void>;

beforeAll(async () => {
  const { runMigrations } = await import("@/server/boot");
  runMigrations();

  writeSet("main");

  scan = async () => {
    const { getContainer } = await import("@/server/container");
    await getContainer().services.setCatalog.scan();
  };
  await scan();

  GET_results = (await import("@/app/api/sessions/[id]/results/route")).GET as Handler;
  PATCH_review = (await import("@/app/api/sessions/[id]/review/route")).PATCH as Handler;
  POST_retake = (await import("@/app/api/sessions/[id]/retake/route")).POST as Handler;
});

afterAll(async () => {
  const { closeDb } = await import("@/server/data/db");
  const { resetContainer } = await import("@/server/container");
  closeDb();
  resetContainer();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// Helper: seed a completed session with controllable outcomes
//   q1 → correct (answer A, correctAnswer A)
//   q2 → incorrect (answer A, correctAnswer B)
//   q3 → revealed
//   q4 → unanswered (default)
// ────────────────────────────────────────────────────────────────────────────
async function seedCompletedSession(): Promise<string> {
  const e = await engine();
  const s = e.createSession({ quesPath: QUES_PATH, setId: "set-main", options: { seed: "test" } });
  e.applyUpdate(s.id, { answer: { questionId: 1, selected: ["A"] } }); // correct
  e.applyUpdate(s.id, { answer: { questionId: 2, selected: ["A"] } }); // incorrect (correct is B)
  e.applyUpdate(s.id, { answer: { questionId: 3, revealed: true } });   // revealed
  // q4 left unanswered
  e.submit(s.id);
  return s.id;
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/:id/results
// ────────────────────────────────────────────────────────────────────────────
describe("GET /api/sessions/:id/results", () => {
  let sessionId: string;

  beforeEach(async () => {
    sessionId = await seedCompletedSession();
  });

  it("returns the full results DTO with outcomes matching the seeded session", async () => {
    const res = await GET_results(
      new Request(`http://localhost/api/sessions/${sessionId}/results`),
      ctx(sessionId),
    );
    expect(res.status).toBe(200);
    const dto = await res.json() as {
      id: string;
      status: string;
      summary: {
        scorePercent: number;
        correct: number;
        incorrect: number;
        gaveUp: number;
        flagged: number;
        total: number;
        timeTakenMs: number;
        timerLimitMs: number | null;
      };
      questions: Array<{
        id: number;
        outcome: string;
        correctAnswer: unknown;
        yourAnswer: string[];
        explanations: unknown;
        Tips?: string;
      }>;
      isBookmarked: boolean;
      note: unknown;
    };

    expect(dto.id).toBe(sessionId);
    expect(dto.status).toBe("completed");
    expect(dto.summary).toMatchObject({
      correct: 1,
      // incorrect includes 1 wrong + 1 revealed + 1 unanswered = 3
      // (UI breakdown collapses "wrong picks / revealed / unanswered"
      // into a single "Incorrect" tally).
      incorrect: 3,
      gaveUp: 0,
      flagged: 0,
      total: 4,
      scorePercent: 25,
    });

    // All questions have correctAnswer exposed in results DTO.
    expect(dto.questions.every((q) => q.correctAnswer !== undefined)).toBe(true);
    // All questions have explanations.
    expect(dto.questions.every((q) => q.explanations !== undefined)).toBe(true);

    const q1 = dto.questions.find((q) => q.id === 1)!;
    const q2 = dto.questions.find((q) => q.id === 2)!;
    const q3 = dto.questions.find((q) => q.id === 3)!;
    const q4 = dto.questions.find((q) => q.id === 4)!;

    expect(q1.outcome).toBe("correct");
    expect(q2.outcome).toBe("incorrect");
    expect(q3.outcome).toBe("revealed");
    expect(q4.outcome).toBe("unanswered");

    expect(dto.isBookmarked).toBe(false);
    expect(dto.note).toBeNull();
  });

  it("404 SESSION_NOT_FOUND for unknown id", async () => {
    const res = await GET_results(
      new Request("http://localhost/api/sessions/no-such-session/results"),
      ctx("no-such-session"),
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/sessions/:id/review
// ────────────────────────────────────────────────────────────────────────────
describe("PATCH /api/sessions/:id/review", () => {
  let sessionId: string;

  beforeEach(async () => {
    sessionId = await seedCompletedSession();
  });

  function reviewReq(id: string, body: unknown): Request {
    return new Request(`http://localhost/api/sessions/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("toggles isBookmarked and returns updated review fields", async () => {
    const res = await PATCH_review(reviewReq(sessionId, { isBookmarked: true }), ctx(sessionId));
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; isBookmarked: boolean; note: unknown };
    expect(body.id).toBe(sessionId);
    expect(body.isBookmarked).toBe(true);
    expect(body.note).toBeNull();
  });

  it("persists a note and returns it", async () => {
    const res = await PATCH_review(reviewReq(sessionId, { note: "study this topic" }), ctx(sessionId));
    expect(res.status).toBe(200);
    const body = await res.json() as { note: string };
    expect(body.note).toBe("study this topic");
  });

  it("sets both isBookmarked and note together", async () => {
    const res = await PATCH_review(
      reviewReq(sessionId, { isBookmarked: true, note: "important" }),
      ctx(sessionId),
    );
    const body = await res.json() as { isBookmarked: boolean; note: string };
    expect(body.isBookmarked).toBe(true);
    expect(body.note).toBe("important");
  });

  it("clears note with null", async () => {
    await PATCH_review(reviewReq(sessionId, { note: "temp" }), ctx(sessionId));
    const res = await PATCH_review(reviewReq(sessionId, { note: null }), ctx(sessionId));
    const body = await res.json() as { note: unknown };
    expect(body.note).toBeNull();
  });

  it("404 for unknown session", async () => {
    const res = await PATCH_review(reviewReq("nope", { isBookmarked: true }), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("works on an in-progress session (note-jotting allowed)", async () => {
    const e = await engine();
    const s = e.createSession({ quesPath: QUES_PATH, setId: "set-main", options: { seed: "inprog" } });
    const res = await PATCH_review(reviewReq(s.id, { note: "mid-exam note" }), ctx(s.id));
    expect(res.status).toBe(200);
    const body = await res.json() as { note: string };
    expect(body.note).toBe("mid-exam note");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/sessions/:id/retake
// REQUIRED: retake-incorrect subset test (F5 spec)
// ────────────────────────────────────────────────────────────────────────────
describe("POST /api/sessions/:id/retake", () => {
  let originId: string;

  beforeEach(async () => {
    // Seed: q1 correct, q2 incorrect, q3 revealed, q4 unanswered.
    originId = await seedCompletedSession();
  });

  function retakeReq(id: string, body: unknown): Request {
    return new Request(`http://localhost/api/sessions/${id}/retake`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("retake all — creates a full new session with all 4 questions", async () => {
    const res = await POST_retake(retakeReq(originId, { scope: "all" }), ctx(originId));
    expect(res.status).toBe(201);
    const dto = await res.json() as {
      id: string;
      status: string;
      totalQuestions: number;
      questions: Array<{ id: number; correctAnswer?: unknown }>;
      mode: string;
    };
    expect(dto.status).toBe("in_progress");
    expect(dto.totalQuestions).toBe(4);
    expect(dto.mode).toBe("retake_all");
    // Correct answers must be hidden in the live DTO.
    expect(dto.questions.every((q) => q.correctAnswer === undefined)).toBe(true);
  });

  /**
   * REQUIRED: retake-incorrect snapshot builder test (F5 spec).
   * Origin: q1=correct, q2=incorrect, q3=revealed, q4=unanswered.
   * retake "incorrect" should include ONLY q2 (incorrect) + q3 (revealed) = 2 questions.
   */
  it("[REQUIRED] retake incorrect — snapshot contains exactly the incorrect+revealed questions", async () => {
    const res = await POST_retake(retakeReq(originId, { scope: "incorrect" }), ctx(originId));
    expect(res.status).toBe(201);
    const dto = await res.json() as {
      id: string;
      totalQuestions: number;
      questions: Array<{ id: number }>;
      mode: string;
    };

    expect(dto.mode).toBe("retake_incorrect");
    expect(dto.totalQuestions).toBe(2);

    // Must contain exactly q2 and q3; NOT q1 (correct) or q4 (unanswered).
    const ids = dto.questions.map((q) => q.id).sort();
    expect(ids).toEqual([2, 3]);
  });

  it("[REQUIRED] retake incorrect — sets origin_session_id on the new session", async () => {
    const res = await POST_retake(retakeReq(originId, { scope: "incorrect" }), ctx(originId));
    const dto = await res.json() as { id: string };
    const { getContainer } = await import("@/server/container");
    const newRow = getContainer().repos.session.getById(dto.id)!;
    expect(newRow.origin_session_id).toBe(originId);
    expect(newRow.mode).toBe("retake_incorrect");
  });

  it("[REQUIRED] retake incorrect with NO qualifying questions → 409 SETS_EXHAUSTED", async () => {
    // Create a session where every question is correct — no incorrect/revealed.
    const e = await engine();
    const s = e.createSession({ quesPath: QUES_PATH, setId: "set-main", options: { seed: "allcorrect" } });
    // q1 correct=A, q2 correct=B, q3 correct=C, q4 correct=D
    e.applyUpdate(s.id, { answer: { questionId: 1, selected: ["A"] } });
    e.applyUpdate(s.id, { answer: { questionId: 2, selected: ["B"] } });
    e.applyUpdate(s.id, { answer: { questionId: 3, selected: ["C"] } });
    e.applyUpdate(s.id, { answer: { questionId: 4, selected: ["D"] } });
    e.submit(s.id);

    const res = await POST_retake(retakeReq(s.id, { scope: "incorrect" }), ctx(s.id));
    expect(res.status).toBe(409);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("SETS_EXHAUSTED");
  });

  it("404 SESSION_NOT_FOUND for unknown origin", async () => {
    const res = await POST_retake(retakeReq("does-not-exist", { scope: "all" }), ctx("does-not-exist"));
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });

  it("retake all — new session starts fresh (blank answers, in_progress)", async () => {
    const res = await POST_retake(retakeReq(originId, { scope: "all" }), ctx(originId));
    const dto = await res.json() as { id: string };
    const { getContainer } = await import("@/server/container");
    const answers = getContainer().repos.answer.getBySession(dto.id);
    expect(answers.length).toBe(4);
    // All blank: no selection, not revealed, not flagged.
    expect(answers.every((a) => JSON.parse(a.selected_options).length === 0)).toBe(true);
    expect(answers.every((a) => a.is_revealed === 0)).toBe(true);
  });
});
