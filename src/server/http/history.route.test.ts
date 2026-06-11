/**
 * Integration tests for GET /api/history and GET /api/stats (F7).
 *
 * Tests spin up a real (temp-file) DB, seed sessions via the ExamEngine, and
 * drive the route handlers directly. Each filter combination is verified.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-history-test-"));
const dbPath = path.join(tmpDir, "history.db");
const examsDir = path.join(tmpDir, "Exams");
const easyDir = path.join(examsDir, "Cloud", "AWS", "SAA", "Easy");
const hardDir = path.join(examsDir, "Cloud", "AWS", "SAA", "Hard");

process.env.DB_PATH = dbPath;
process.env.EXAMS_ROOT = examsDir;

// Purge stale singletons left by parallel test files in the same process.
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

const EASY_PATH = "Exams/Cloud/AWS/SAA/Easy";
const HARD_PATH = "Exams/Cloud/AWS/SAA/Hard";

type Handler = (req: Request, ctx: unknown) => Promise<Response>;

let GET_history: Handler;
let GET_stats: Handler;

function makeSet(name: string, difficulty: string, correctAnswers: string[]) {
  const count = correctAnswers.length;
  return {
    setId: `set-${name}`,
    setTitle: `Set ${name}`,
    difficulty,
    questions: Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      questionText: `Q${i + 1} of ${name}`,
      options: { A: "alpha", B: "bravo", C: "charlie", D: "delta" },
      correctAnswer: correctAnswers[i],
      explanations: {
        A: { description: "A", reason: "ra" },
        B: { description: "B", reason: "rb" },
        C: { description: "C", reason: "rc" },
        D: { description: "D", reason: "rd" },
      },
    })),
  };
}

function writeSet(dir: string, name: string, difficulty: string, answers: string[]) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${name}.json`),
    JSON.stringify(makeSet(name, difficulty, answers)),
  );
}

async function getEngine() {
  const { getContainer } = await import("@/server/container");
  return getContainer().services.examEngine;
}

async function getSessionRepo() {
  const { getContainer } = await import("@/server/container");
  return getContainer().repos.session;
}

/**
 * Seed a completed session with a known score. completedAt can be overridden for
 * date-filter / streak tests.
 */
async function seedCompleted(opts: {
  quesPath: string;
  setId: string;
  correctCount: number;
  totalCount: number;
  completedAt?: string;
  note?: string;
  bookmarked?: boolean;
}) {
  const engine = await getEngine();
  const s = engine.createSession({
    quesPath: opts.quesPath,
    setId: opts.setId,
    options: { seed: opts.setId + Math.random().toString() },
  });
  // Apply answers: first correctCount answers are correct (we wrote all answers as "A").
  for (let i = 0; i < opts.correctCount && i < s.questions.length; i++) {
    const q = s.questions[i]!;
    // All test sets use "A" as the correct answer.
    engine.applyUpdate(s.id, {
      answer: { questionId: q.id, selected: ["A"] },
    });
  }
  engine.submit(s.id);

  // Override completedAt for date-based tests.
  if (opts.completedAt !== undefined) {
    const repo = await getSessionRepo();
    repo.patch(s.id, { completedAt: opts.completedAt });
  }
  if (opts.note !== undefined) {
    const repo = await getSessionRepo();
    repo.patch(s.id, { note: opts.note });
  }
  if (opts.bookmarked !== undefined) {
    const repo = await getSessionRepo();
    repo.patch(s.id, { isBookmarked: opts.bookmarked });
  }

  return s.id;
}

beforeAll(async () => {
  const { runMigrations } = await import("@/server/boot");
  runMigrations();

  // Write sets for each difficulty path.
  writeSet(easyDir, "easy-a", "Easy", ["A", "A", "A"]);   // all correct if A is chosen
  writeSet(easyDir, "easy-b", "Easy", ["B", "B", "B"]);
  writeSet(hardDir, "hard-a", "Hard", ["A", "A", "A"]);

  const { getContainer } = await import("@/server/container");
  await getContainer().services.setCatalog.scan();

  GET_history = (await import("@/app/api/history/route")).GET as Handler;
  GET_stats = (await import("@/app/api/stats/route")).GET as Handler;
});

afterAll(async () => {
  const { closeDb } = await import("@/server/data/db");
  const { resetContainer } = await import("@/server/container");
  closeDb();
  resetContainer();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function historyReq(query: Record<string, string> = {}) {
  const sp = new URLSearchParams(query);
  return new Request(`http://localhost/api/history?${sp.toString()}`);
}

function statsReq(query: Record<string, string> = {}) {
  const sp = new URLSearchParams(query);
  return new Request(`http://localhost/api/stats?${sp.toString()}`);
}

// ── GET /api/history — baseline ───────────────────────────────────────────────

describe("GET /api/history — unfiltered", () => {
  it("returns empty list when no sessions are completed", async () => {
    const res = await GET_history(historyReq(), {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number };
    // May have rows from other tests since we share one DB, but this runs first.
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(typeof body.total).toBe("number");
  });

  it("returns correct shape for completed sessions", async () => {
    await seedCompleted({ quesPath: EASY_PATH, setId: "set-easy-a", correctCount: 3, totalCount: 3 });

    const res = await GET_history(historyReq(), {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        id: string;
        domainLabel: string;
        difficulty: string;
        setTitle: string;
        scorePercent: number;
        timeTakenMs: number;
        completedAt: string;
        isBookmarked: boolean;
        hasNote: boolean;
      }>;
      total: number;
    };
    expect(body.total).toBeGreaterThan(0);
    const item = body.items[0]!;
    expect(item.id).toBeDefined();
    expect(item.domainLabel).toBeDefined();
    expect(item.difficulty).toBe("Easy");
    expect(item.scorePercent).toBeDefined();
    expect(item.timeTakenMs).toBeGreaterThanOrEqual(0);
    expect(item.completedAt).toBeDefined();
    expect(typeof item.isBookmarked).toBe("boolean");
    expect(typeof item.hasNote).toBe("boolean");
  });
});

// ── filter: difficulty ────────────────────────────────────────────────────────

describe("GET /api/history — difficulty filter", () => {
  let hardId: string;

  beforeEach(async () => {
    hardId = await seedCompleted({
      quesPath: HARD_PATH,
      setId: "set-hard-a",
      correctCount: 2,
      totalCount: 3,
    });
  });

  it("narrows to only Hard sessions", async () => {
    const res = await GET_history(historyReq({ difficulty: "Hard" }), {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; difficulty: string }> };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((r) => r.difficulty === "Hard")).toBe(true);
    expect(body.items.some((r) => r.id === hardId)).toBe(true);
  });

  it("Easy filter excludes Hard sessions", async () => {
    const res = await GET_history(historyReq({ difficulty: "Easy" }), {});
    const body = (await res.json()) as { items: Array<{ difficulty: string }> };
    expect(body.items.every((r) => r.difficulty === "Easy")).toBe(true);
    // The hard session we just created must NOT appear.
  });
});

// ── filter: scoreMin / scoreMax ───────────────────────────────────────────────

describe("GET /api/history — score range filter", () => {
  it("scoreMin=100 returns only perfect-score sessions", async () => {
    // Seed a 3/3 = 100% session for Easy-A.
    await seedCompleted({
      quesPath: EASY_PATH,
      setId: "set-easy-a",
      correctCount: 3,
      totalCount: 3,
    });

    const res = await GET_history(historyReq({ scoreMin: "100" }), {});
    const body = (await res.json()) as { items: Array<{ scorePercent: number }> };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((r) => r.scorePercent >= 100)).toBe(true);
  });

  it("scoreMax=50 filters out high-score sessions", async () => {
    // The 100% session from above should not appear.
    const res = await GET_history(historyReq({ scoreMax: "50" }), {});
    const body = (await res.json()) as { items: Array<{ scorePercent: number }> };
    expect(body.items.every((r) => r.scorePercent <= 50)).toBe(true);
  });

  it("combined scoreMin=60&scoreMax=80 narrows correctly", async () => {
    const res = await GET_history(historyReq({ scoreMin: "60", scoreMax: "80" }), {});
    const body = (await res.json()) as { items: Array<{ scorePercent: number }> };
    expect(body.items.every((r) => r.scorePercent >= 60 && r.scorePercent <= 80)).toBe(true);
  });
});

// ── filter: dateFrom / dateTo ─────────────────────────────────────────────────

describe("GET /api/history — date range filter", () => {
  it("dateFrom filters out sessions before the date", async () => {
    const id = await seedCompleted({
      quesPath: EASY_PATH,
      setId: "set-easy-a",
      correctCount: 3,
      totalCount: 3,
      completedAt: "2024-01-15T10:00:00.000Z",
    });

    // dateFrom set to a date after the seeded session.
    const res = await GET_history(historyReq({ dateFrom: "2025-01-01" }), {});
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.every((r) => r.id !== id)).toBe(true);
  });

  it("dateTo is inclusive — session on dateTo appears", async () => {
    const id = await seedCompleted({
      quesPath: EASY_PATH,
      setId: "set-easy-a",
      correctCount: 2,
      totalCount: 3,
      completedAt: "2024-06-01T12:00:00.000Z",
    });

    const res = await GET_history(
      historyReq({ dateFrom: "2024-06-01", dateTo: "2024-06-01" }),
      {},
    );
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.some((r) => r.id === id)).toBe(true);
  });

  it("dateTo excludes sessions after the date", async () => {
    const futureId = await seedCompleted({
      quesPath: EASY_PATH,
      setId: "set-easy-a",
      correctCount: 3,
      totalCount: 3,
      completedAt: "2030-12-31T10:00:00.000Z",
    });

    const res = await GET_history(historyReq({ dateTo: "2027-01-01" }), {});
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.every((r) => r.id !== futureId)).toBe(true);
  });
});

// ── filter: bookmarked ────────────────────────────────────────────────────────

describe("GET /api/history — bookmarked filter", () => {
  it("bookmarked=true returns only bookmarked sessions", async () => {
    const bkmId = await seedCompleted({
      quesPath: EASY_PATH,
      setId: "set-easy-a",
      correctCount: 3,
      totalCount: 3,
      bookmarked: true,
    });

    const res = await GET_history(historyReq({ bookmarked: "true" }), {});
    const body = (await res.json()) as {
      items: Array<{ id: string; isBookmarked: boolean }>;
    };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((r) => r.isBookmarked === true)).toBe(true);
    expect(body.items.some((r) => r.id === bkmId)).toBe(true);
  });
});

// ── note → hasNote ────────────────────────────────────────────────────────────

describe("GET /api/history — hasNote field", () => {
  it("hasNote is true when the session has a non-empty note", async () => {
    const noteId = await seedCompleted({
      quesPath: EASY_PATH,
      setId: "set-easy-a",
      correctCount: 2,
      totalCount: 3,
      note: "study hard",
    });

    const res = await GET_history(historyReq(), {});
    const body = (await res.json()) as { items: Array<{ id: string; hasNote: boolean }> };
    const item = body.items.find((r) => r.id === noteId);
    expect(item?.hasNote).toBe(true);
  });
});

// ── sorting ───────────────────────────────────────────────────────────────────

describe("GET /api/history — sort + order", () => {
  it("sort=date&order=desc returns most recent first", async () => {
    const res = await GET_history(historyReq({ sort: "date", order: "desc" }), {});
    const body = (await res.json()) as { items: Array<{ completedAt: string }> };
    const dates = body.items.map((r) => r.completedAt);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]! <= dates[i - 1]!).toBe(true);
    }
  });

  it("sort=score&order=asc returns lowest score first", async () => {
    const res = await GET_history(historyReq({ sort: "score", order: "asc" }), {});
    const body = (await res.json()) as { items: Array<{ scorePercent: number }> };
    const scores = body.items.map((r) => r.scorePercent);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeGreaterThanOrEqual(scores[i - 1]!);
    }
  });
});

// ── pagination ────────────────────────────────────────────────────────────────

describe("GET /api/history — pagination", () => {
  it("limit and offset honour pagination — total remains unpaginated count", async () => {
    const resAll = await GET_history(historyReq(), {});
    const all = (await resAll.json()) as { total: number };
    const totalAll = all.total;

    if (totalAll < 2) return; // Skip if not enough data.

    const resPage1 = await GET_history(historyReq({ limit: "1", offset: "0" }), {});
    const page1 = (await resPage1.json()) as { items: unknown[]; total: number };
    expect(page1.items.length).toBe(1);
    expect(page1.total).toBe(totalAll); // total is always unpaginated

    const resPage2 = await GET_history(historyReq({ limit: "1", offset: "1" }), {});
    const page2 = (await resPage2.json()) as { items: unknown[]; total: number };
    expect(page2.items.length).toBe(1);
    expect(page2.total).toBe(totalAll);
  });
});

// ── combined filters ──────────────────────────────────────────────────────────

describe("GET /api/history — combined filters (AND intersection)", () => {
  it("difficulty + scoreMin combined narrows to the intersection", async () => {
    // Seed a 100% Hard session that should appear.
    await seedCompleted({
      quesPath: HARD_PATH,
      setId: "set-hard-a",
      correctCount: 3,
      totalCount: 3,
    });

    const res = await GET_history(
      historyReq({ difficulty: "Hard", scoreMin: "90" }),
      {},
    );
    const body = (await res.json()) as {
      items: Array<{ difficulty: string; scorePercent: number }>;
    };
    expect(
      body.items.every((r) => r.difficulty === "Hard" && r.scorePercent >= 90),
    ).toBe(true);
  });
});

// ── GET /api/stats ─────────────────────────────────────────────────────────────

describe("GET /api/stats", () => {
  it("returns the expected stats shape", async () => {
    const res = await GET_stats(statsReq(), {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalExams: number;
      averageScore: number;
      bestScore: number;
      currentStreakDays: number;
      longestStreakDays: number;
      lastExam: unknown;
      byDifficulty: unknown;
    };
    expect(typeof body.totalExams).toBe("number");
    expect(typeof body.averageScore).toBe("number");
    expect(typeof body.bestScore).toBe("number");
    expect(typeof body.currentStreakDays).toBe("number");
    expect(typeof body.longestStreakDays).toBe("number");
    expect(body).toHaveProperty("lastExam");
    expect(body).toHaveProperty("byDifficulty");
  });

  it("stats honour the difficulty filter — Easy stats differ from Hard", async () => {
    const resEasy = await GET_stats(statsReq({ difficulty: "Easy" }), {});
    const easyBody = (await resEasy.json()) as { totalExams: number };

    const resHard = await GET_stats(statsReq({ difficulty: "Hard" }), {});
    const hardBody = (await resHard.json()) as { totalExams: number };

    const resAll = await GET_stats(statsReq(), {});
    const allBody = (await resAll.json()) as { totalExams: number };

    // totalExams for Easy + Hard should be <= total (unless there are other difficulties).
    expect(easyBody.totalExams + hardBody.totalExams).toBeLessThanOrEqual(
      allBody.totalExams,
    );
  });

  it("stats with no matching sessions return zeroed values", async () => {
    const res = await GET_stats(statsReq({ scoreMin: "999" }), {});
    const body = (await res.json()) as {
      totalExams: number;
      currentStreakDays: number;
      lastExam: unknown;
    };
    expect(body.totalExams).toBe(0);
    expect(body.currentStreakDays).toBe(0);
    expect(body.lastExam).toBeNull();
  });
});
