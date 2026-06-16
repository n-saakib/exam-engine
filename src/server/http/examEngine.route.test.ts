import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Integration tests for the F4 exam-engine routes (create/get/patch/submit/delete)
 * driven through the real container against a temp DB + temp EXAMS_ROOT.
 *
 * Includes the REQUIRED snapshot-integrity regression test (09 §7.4): mutate AND
 * delete the source JSON after a session is created, then submit, and assert the
 * score + results detail come from the snapshot, not the live file.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-engine-test-"));
const dbPath = path.join(tmpDir, "engine.db");
const examsDir = path.join(tmpDir, "Exams");
const easyDir = path.join(examsDir, "Cloud", "AWS", "SAA", "Easy");

process.env.DB_PATH = dbPath;
process.env.EXAMS_ROOT = examsDir;

// Reset any singletons from earlier test files in this process.
{
  const g = globalThis as Record<string, unknown>;
  if (g.__certprepContainer) g.__certprepContainer = undefined;
  if (g.__certprepDb) {
    try {
      (g.__certprepDb as { close(): void }).close();
    } catch {
      /* already closed */
    }
    g.__certprepDb = undefined;
  }
}

const QUES_PATH = "Exams/Cloud/AWS/SAA/Easy";

function makeSet(name: string, opts: { questions?: number; type?: string } = {}) {
  const count = opts.questions ?? 3;
  const isMulti = opts.type === "multi";
  const questions = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    ...(opts.type ? { questionType: opts.type } : {}),
    questionText: `Question ${i + 1} of ${name}`,
    options: { A: "alpha", B: "bravo", C: "charlie", D: "delta" },
    // Correct answer cycles A,B,C,D so tests can construct known scores. For
    // multi, the answer is always ["A","B"]; for single, the answer is a
    // length-1 array (post-ADR-13 unified shape). `ordered` and `freetext`
    // are 422-rejected at create time, so they never reach the grader here.
    correctAnswer: isMulti ? ["A", "B"] : [["A"], ["B"], ["C"], ["D"]][i % 4],
    explanations: {
      A: { description: "A", reason: "ra" },
      B: { description: "B", reason: "rb" },
      C: { description: "C", reason: "rc" },
      D: { description: "D", reason: "rd" },
    },
    Tips: `tip for ${name} q${i + 1}`,
  }));
  return {
    setId: `set-${name}`,
    setTitle: `Set ${name}`,
    difficulty: "Easy",
    questions,
  };
}

function writeSet(name: string, opts?: { questions?: number; type?: string }) {
  fs.mkdirSync(easyDir, { recursive: true });
  const file = path.join(easyDir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(makeSet(name, opts), null, 2));
  return file;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const emptyCtx = { params: Promise.resolve({} as Record<string, never>) };

type Handler = (req: Request, ctx: unknown) => Promise<Response>;
type CreateInput = Parameters<
  import("@/server/services/examEngine").ExamEngine["createSession"]
>[0];

/** Always resolve the engine from the CURRENT container (never a stale binding). */
async function engine() {
  const { getContainer } = await import("@/server/container");
  return getContainer().services.examEngine;
}
async function createSession(input: CreateInput) {
  return (await engine()).createSession(input);
}

let POST_create: Handler;
let GET_one: Handler;
let PATCH_one: Handler;
let DELETE_one: Handler;
let POST_submit: Handler;
let scan: () => Promise<void>;

beforeAll(async () => {
  const { runMigrations } = await import("@/server/boot");
  runMigrations();

  writeSet("alpha");

  scan = async () => {
    const { getContainer } = await import("@/server/container");
    await getContainer().services.setCatalog.scan();
  };
  await scan();

  const createMod = await import("@/app/api/sessions/route");
  POST_create = createMod.POST as Handler;
  const idMod = await import("@/app/api/sessions/[id]/route");
  GET_one = idMod.GET as Handler;
  PATCH_one = idMod.PATCH as Handler;
  DELETE_one = idMod.DELETE as Handler;
  const submitMod = await import("@/app/api/sessions/[id]/submit/route");
  POST_submit = submitMod.POST as Handler;
});

afterAll(async () => {
  const { closeDb } = await import("@/server/data/db");
  const { resetContainer } = await import("@/server/container");
  closeDb();
  resetContainer();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createReq(body: unknown): Request {
  return new Request("http://localhost/api/sessions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/sessions — create", () => {
  it("creates an in_progress session and returns answers-hidden live DTO", async () => {
    const res = await POST_create(
      createReq({ quesPath: QUES_PATH, setId: "set-alpha", options: { seed: "s1" } }),
      emptyCtx,
    );
    expect(res.status).toBe(201);
    const dto = (await res.json()) as {
      id: string;
      status: string;
      totalQuestions: number;
      questions: Array<{ correctAnswer?: unknown; explanations?: unknown; Tips?: unknown; answer: unknown }>;
    };
    expect(dto.status).toBe("in_progress");
    expect(dto.totalQuestions).toBe(3);
    expect(dto.questions.length).toBe(3);
    for (const q of dto.questions) {
      expect(q.correctAnswer).toBeUndefined();
      expect(q.explanations).toBeUndefined();
      expect(q.Tips).toBeUndefined();
      expect(q.answer).toBeDefined();
    }
  });

  it("seeded shuffle is reproducible (same seed → same order)", async () => {
    const a = await createSession({
      quesPath: QUES_PATH,
      setId: "set-alpha",
      options: { seed: "fixed-seed", shuffleQuestions: true },
    });
    const b = await createSession({
      quesPath: QUES_PATH,
      setId: "set-alpha",
      options: { seed: "fixed-seed", shuffleQuestions: true },
    });
    expect(a.questions.map((q) => q.id)).toEqual(b.questions.map((q) => q.id));
  });

  it("creates a session for a multi set (multi is supported post ADR-13)", async () => {
    writeSet("multi", { type: "multi" });
    await scan();
    const res = await POST_create(
      createReq({ quesPath: QUES_PATH, setId: "set-multi" }),
      emptyCtx,
    );
    expect(res.status).toBe(201);
  });

  it("422 UNSUPPORTED_QUESTION_TYPE for an `ordered` set (still catalogue-only)", async () => {
    writeSet("ordered", { type: "ordered" });
    await scan();
    const res = await POST_create(
      createReq({ quesPath: QUES_PATH, setId: "set-ordered" }),
      emptyCtx,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNSUPPORTED_QUESTION_TYPE");
  });

  it("rejects a retake_* mode at this endpoint (400 VALIDATION_ERROR)", async () => {
    const res = await POST_create(
      createReq({ quesPath: QUES_PATH, setId: "set-alpha", mode: "retake_all" }),
      emptyCtx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /api/sessions/:id — autosave", () => {
  let sessionId: string;

  beforeEach(async () => {
    const s = await createSession({
      quesPath: QUES_PATH,
      setId: "set-alpha",
      options: { seed: "patch-seed" },
    });
    sessionId = s.id;
  });

  async function patch(body: unknown): Promise<Response> {
    return PATCH_one(
      new Request(`http://localhost/api/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      ctx(sessionId),
    );
  }

  it("is idempotent: repeated identical PATCH yields the same answer state", async () => {
    const body = { currentIndex: 1, answer: { questionId: 1, selected: ["B"], flagged: true } };
    const r1 = await patch(body);
    const r2 = await patch(body);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const d1 = await r1.json();
    const d2 = await r2.json();
    const q1a = (d1 as { questions: Array<{ id: number; answer: unknown }> }).questions.find((q) => q.id === 1)!;
    const q1b = (d2 as { questions: Array<{ id: number; answer: unknown }> }).questions.find((q) => q.id === 1)!;
    expect(q1a.answer).toEqual(q1b.answer);
  });

  it("clamps elapsedMs to the timer limit when timed", async () => {
    const res = await patch({ elapsedMs: 999_999_999 });
    const dto = (await res.json()) as { timer: { limitMs: number; elapsedMs: number; expired?: boolean } };
    expect(dto.timer.elapsedMs).toBe(dto.timer.limitMs);
    expect(dto.timer.expired).toBe(true);
  });

  it("reveal:true returns correct data for that question ONLY", async () => {
    const res = await patch({ answer: { questionId: 1, revealed: true } });
    const dto = (await res.json()) as {
      questions: Array<{ id: number; correctAnswer?: unknown; Tips?: unknown }>;
    };
    const q1 = dto.questions.find((q) => q.id === 1)!;
    const q2 = dto.questions.find((q) => q.id === 2)!;
    expect(q1.correctAnswer).toEqual(["A"]);
    expect(q1.Tips).toBeDefined();
    expect(q2.correctAnswer).toBeUndefined();
  });

  it("reveal is monotonic: a later patch cannot un-reveal", async () => {
    await patch({ answer: { questionId: 1, revealed: true } });
    // PatchAnswer can't send revealed:false anyway; but even via the engine the
    // existing reveal must stick. Re-patch other fields and confirm still revealed.
    const res = await patch({ answer: { questionId: 1, selected: ["C"] } });
    const dto = (await res.json()) as { questions: Array<{ id: number; answer: { revealed: boolean } }> };
    expect(dto.questions.find((q) => q.id === 1)!.answer.revealed).toBe(true);
  });

  it("PATCH with gaveUp:true persists is_gave_up=1 and surfaces gaveUp on the DTO", async () => {
    // F4 gave-up: the user clicks "Give up" with no selection; reveal() must
    // persist is_gave_up=1, and the next GET must surface gaveUp:true on the
    // LiveAnswer so the navigator's 7-state swatch collapses to "gave_up".
    const res = await patch({ answer: { questionId: 1, revealed: true, gaveUp: true } });
    const dto = (await res.json()) as {
      questions: Array<{ id: number; answer: { revealed: boolean; gaveUp: boolean } }>;
    };
    const q1 = dto.questions.find((q) => q.id === 1)!;
    expect(q1.answer.revealed).toBe(true);
    expect(q1.answer.gaveUp).toBe(true);
  });

  it("PATCH gaveUp:false on a revealed row does not un-give-up (monotonic)", async () => {
    // The wire-level schema doesn't allow gaveUp:false, but the engine itself
    // must defend — once gaveUp is true, it stays true (parallel to revealed).
    await patch({ answer: { questionId: 1, revealed: true, gaveUp: true } });
    // Re-patch with selected; the existing gaveUp must stick.
    const res = await patch({ answer: { questionId: 1, selected: ["C"] } });
    const dto = (await res.json()) as { questions: Array<{ id: number; answer: { gaveUp: boolean } }> };
    expect(dto.questions.find((q) => q.id === 1)!.answer.gaveUp).toBe(true);
  });

  it("404 for an unknown session", async () => {
    const res = await PATCH_one(
      new Request("http://localhost/api/sessions/does-not-exist", {
        method: "PATCH",
        body: JSON.stringify({ currentIndex: 1 }),
        headers: { "content-type": "application/json" },
      }),
      ctx("does-not-exist"),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "SESSION_NOT_FOUND",
    );
  });
});

describe("submit + 409 + resume", () => {
  it("scores equal ScoreCalculator, records set_completion, and second submit 409s", async () => {
    const s = await createSession({ quesPath: QUES_PATH, setId: "set-alpha", options: { seed: "submit" } });
    // Answer q1 correct (A), q2 wrong, leave q3 unanswered → 1/3 = 33%.
    const { getContainer } = await import("@/server/container");
    const engine = getContainer().services.examEngine;
    engine.applyUpdate(s.id, { answer: { questionId: 1, selected: ["A"] } });
    engine.applyUpdate(s.id, { answer: { questionId: 2, selected: ["A"] } });

    const res = await POST_submit(
      new Request(`http://localhost/api/sessions/${s.id}/submit`, {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
      ctx(s.id),
    );
    expect(res.status).toBe(200);
    const results = (await res.json()) as {
      status: string;
      summary: { scorePercent: number; correct: number; incorrect: number; unanswered: number; total: number };
      questions: Array<{ id: number; outcome: string; correctAnswer: unknown }>;
    };
    expect(results.status).toBe("completed");
    expect(results.summary).toMatchObject({ correct: 1, incorrect: 1, unanswered: 1, total: 3, scorePercent: 33 });
    // Answers shown in results.
    expect(results.questions.every((q) => q.correctAnswer !== undefined)).toBe(true);

    // set_completion recorded for this path+set.
    const completed = getContainer().repos.completion.listCompletedSetIds(QUES_PATH);
    expect(completed).toContain("set-alpha");

    // Second submit → 409.
    const res2 = await POST_submit(
      new Request(`http://localhost/api/sessions/${s.id}/submit`, {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
      ctx(s.id),
    );
    expect(res2.status).toBe(409);
    expect(((await res2.json()) as { error: { code: string } }).error.code).toBe(
      "SESSION_ALREADY_COMPLETED",
    );
  });

  it("PATCH on a completed session → 409 SESSION_NOT_IN_PROGRESS", async () => {
    const s = await createSession({ quesPath: QUES_PATH, setId: "set-alpha", options: { seed: "patch-after-submit" } });
    const { getContainer } = await import("@/server/container");
    getContainer().services.examEngine.submit(s.id);

    const res = await PATCH_one(
      new Request(`http://localhost/api/sessions/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ currentIndex: 2 }),
        headers: { "content-type": "application/json" },
      }),
      ctx(s.id),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "SESSION_NOT_IN_PROGRESS",
    );
  });

  it("resume: GET returns the exact saved index/elapsed/answers/flags/reveal", async () => {
    const s = await createSession({ quesPath: QUES_PATH, setId: "set-alpha", options: { seed: "resume" } });
    const { getContainer } = await import("@/server/container");
    const engine = getContainer().services.examEngine;
    engine.applyUpdate(s.id, {
      currentIndex: 2,
      elapsedMs: 12345,
      answer: { questionId: 1, selected: ["A"], flagged: true, timeSpentMs: 999 },
    });
    engine.applyUpdate(s.id, { answer: { questionId: 2, revealed: true } });

    const res = await GET_one(
      new Request(`http://localhost/api/sessions/${s.id}`),
      ctx(s.id),
    );
    const dto = (await res.json()) as {
      currentIndex: number;
      timer: { elapsedMs: number };
      questions: Array<{ id: number; answer: { selected: string[]; flagged: boolean; revealed: boolean; timeSpentMs: number } }>;
    };
    expect(dto.currentIndex).toBe(2);
    expect(dto.timer.elapsedMs).toBe(12345);
    const q1 = dto.questions.find((q) => q.id === 1)!;
    expect(q1.answer).toMatchObject({ selected: ["A"], flagged: true, timeSpentMs: 999 });
    expect(dto.questions.find((q) => q.id === 2)!.answer.revealed).toBe(true);
  });
});

describe("DELETE /api/sessions/:id — discard", () => {
  it("soft-discards an in-progress session (204): status flips to 'discarded', answers cascade", async () => {
    const s = await createSession({ quesPath: QUES_PATH, setId: "set-alpha", options: { seed: "del" } });
    const res = await DELETE_one(
      new Request(`http://localhost/api/sessions/${s.id}`, { method: "DELETE" }),
      ctx(s.id),
    );
    expect(res.status).toBe(204);
    const { getContainer } = await import("@/server/container");
    // Soft-discard: the row is preserved in the DB (status = 'discarded') so
    // the user can see it in history. Answers are cascade-deleted.
    const row = getContainer().repos.session.getById(s.id);
    expect(row).toBeDefined();
    expect(row?.status).toBe("discarded");
    expect(getContainer().repos.answer.getBySession(s.id).length).toBe(0);
  });

  it("soft-discard is idempotent (a second DELETE is a no-op)", async () => {
    const s = await createSession({ quesPath: QUES_PATH, setId: "set-alpha", options: { seed: "del3" } });
    const { getContainer } = await import("@/server/container");
    getContainer().services.examEngine.discard(s.id);
    // A second delete on an already-discarded session is still 204.
    const res = await DELETE_one(
      new Request(`http://localhost/api/sessions/${s.id}`, { method: "DELETE" }),
      ctx(s.id),
    );
    expect(res.status).toBe(204);
    const row = getContainer().repos.session.getById(s.id);
    expect(row?.status).toBe("discarded");
  });

  it("409 when discarding a completed session", async () => {
    const s = await createSession({ quesPath: QUES_PATH, setId: "set-alpha", options: { seed: "del2" } });
    const { getContainer } = await import("@/server/container");
    getContainer().services.examEngine.submit(s.id);
    const res = await DELETE_one(
      new Request(`http://localhost/api/sessions/${s.id}`, { method: "DELETE" }),
      ctx(s.id),
    );
    expect(res.status).toBe(409);
  });
});

describe("SETS_EXHAUSTED (auto-pick) and real aws_saa sets", () => {
  it("409 SETS_EXHAUSTED when every set for the path is completed", async () => {
    // Fresh isolated path with exactly one set; complete it, then auto-pick fails.
    const exDir = path.join(examsDir, "Cloud", "AWS", "SAA", "Exhaust");
    // The catalogue derives quesPath as the dir relative to process.cwd().
    const exPath = path.relative(process.cwd(), exDir);
    fs.mkdirSync(exDir, { recursive: true });
    fs.writeFileSync(
      path.join(exDir, "only.json"),
      JSON.stringify(makeSet("only", { questions: 1 })),
    );
    await scan();

    const { getContainer } = await import("@/server/container");
    const engine = getContainer().services.examEngine;

    // Auto-pick (no setId) picks the only set, then we submit to complete it.
    const s = engine.createSession({ quesPath: exPath });
    engine.submit(s.id);

    // Now auto-pick must throw SETS_EXHAUSTED via the route (409).
    const res = await POST_create(createReq({ quesPath: exPath }), emptyCtx);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "SETS_EXHAUSTED",
    );
  });

  it("can create + grade a real aws_saa Easy set (via scanning the repo Exams root)", async () => {
    // Point a SECOND container at the real repo Exams root to exercise real sets.
    const realExams = path.resolve(process.cwd(), "Exams");
    if (!fs.existsSync(realExams)) return; // skip if repo layout differs
    const realPath = "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy";

    const realDb = path.join(tmpDir, "real.db");
    const { resetConfigCache } = await import("@/server/config");
    const { closeDb } = await import("@/server/data/db");
    const { resetContainer, getContainer } = await import("@/server/container");

    closeDb();
    resetContainer();
    process.env.DB_PATH = realDb;
    process.env.EXAMS_ROOT = realExams;
    resetConfigCache();

    const { runMigrations } = await import("@/server/boot");
    runMigrations();
    await getContainer().services.setCatalog.scan();

    const engine = getContainer().services.examEngine;
    const s = engine.createSession({ quesPath: realPath, options: { seed: "real" } });
    expect(s.questions.length).toBeGreaterThan(0);
    // Answers hidden on a real set too.
    expect(s.questions.every((q) => q.correctAnswer === undefined)).toBe(true);
    const results = engine.submit(s.id);
    expect(results.summary.total).toBe(s.questions.length);
    expect(results.questions.every((q) => q.correctAnswer !== undefined)).toBe(true);

    // Restore the suite's temp env/container for any later assertions.
    closeDb();
    resetContainer();
    process.env.DB_PATH = dbPath;
    process.env.EXAMS_ROOT = examsDir;
    resetConfigCache();
    runMigrations();
  });
});

describe("SNAPSHOT INTEGRITY regression (09 §7.4) — REQUIRED", () => {
  it("score + results detail come from the snapshot after the source file is mutated AND deleted", async () => {
    const file = writeSet("snap", { questions: 2 });
    // set-snap: q1 correctAnswer A, q2 correctAnswer B.
    await scan();

    const { getContainer } = await import("@/server/container");
    const engine = getContainer().services.examEngine;
    const s = await createSession({ quesPath: QUES_PATH, setId: "set-snap", options: { seed: "integrity" } });

    // Answer q1=A (correct vs original), q2=A (incorrect vs original B).
    engine.applyUpdate(s.id, { answer: { questionId: 1, selected: ["A"] } });
    engine.applyUpdate(s.id, { answer: { questionId: 2, selected: ["A"] } });

    // ── Tamper: flip the correct answers in the file, then DELETE it entirely. ──
    const tampered = makeSet("snap", { questions: 2 });
    tampered.questions[0]!.correctAnswer = ["D"]; // was ["A"]
    tampered.questions[1]!.correctAnswer = ["A"]; // was ["B"] (would make q2 'correct')
    tampered.questions[0]!.questionText = "TAMPERED TEXT";
    fs.writeFileSync(file, JSON.stringify(tampered));
    fs.rmSync(file); // gone from disk entirely

    const res = await POST_submit(
      new Request(`http://localhost/api/sessions/${s.id}/submit`, {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
      ctx(s.id),
    );
    expect(res.status).toBe(200);
    const results = (await res.json()) as {
      summary: { correct: number; incorrect: number; total: number; scorePercent: number };
      questions: Array<{ id: number; correctAnswer: unknown; questionText: string; outcome: string }>;
    };

    // Grading used the SNAPSHOT (q1 A=correct, q2 A vs B=incorrect) → 1/2 = 50%.
    // If it had read the deleted/tampered file it would differ or fail entirely.
    expect(results.summary).toMatchObject({ correct: 1, incorrect: 1, total: 2, scorePercent: 50 });
    const q1 = results.questions.find((q) => q.id === 1)!;
    const q2 = results.questions.find((q) => q.id === 2)!;
    expect(q1.correctAnswer).toEqual(["A"]); // snapshot value, NOT tampered "D"
    expect(q1.questionText).not.toBe("TAMPERED TEXT");
    expect(q1.outcome).toBe("correct");
    expect(q2.correctAnswer).toEqual(["B"]); // snapshot value, NOT tampered "A"
    expect(q2.outcome).toBe("incorrect");
  });
});
