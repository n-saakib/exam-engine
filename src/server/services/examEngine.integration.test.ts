/**
 * Cross-module integration tests for the ExamEngine.
 *
 * Wires the real `createExamEngine` against:
 *   - a temp SQLite DB created by `makeTestDb()` (migrated, FK-cascades ON)
 *   - a temp `EXAMS_ROOT` directory containing a known JSON set
 *   - the real set-catalog service (scan → catalog) and path resolver
 *   - the real session/answer/completion repos
 *
 * No HTTP layer is involved — these tests drive the engine's public API
 * directly, asserting the end-to-end behaviour the routes depend on:
 *   - snapshot integrity across the full lifecycle
 *   - pause/resume state preservation
 *   - retake-incorrect subset selection + SETS_EXHAUSTED edge case
 *   - discard cascading to session_answers
 *   - 409 on submitting a completed session twice
 *
 * The settings layer is a simple in-memory `getSettings()` closure that
 * returns the default SETTINGS_DEFAULTS (no need to write to the DB for these
 * engine-focused tests).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { makeTestDb, type TestDb } from "@/server/test/makeTestDb";
import { createSessionRepo } from "@/server/data/repos/sessionRepo";
import { createAnswerRepo } from "@/server/data/repos/answerRepo";
import { createCompletionRepo } from "@/server/data/repos/completionRepo";
import { createSetCatalogRepo } from "@/server/data/repos/setCatalogRepo";
import { createSetCatalogService } from "@/server/services/setCatalog";
import { createPathResolver } from "@/server/services/pathResolver";
import { createExamEngine } from "@/server/services/examEngine";
import { SETTINGS_DEFAULTS } from "@/server/data/repos/settingsRepo";
import { AppError } from "@/server/http/errors";
import { resetConfigCache } from "@/server/config";

// ── per-test setup helpers ──────────────────────────────────────────────────

interface Harness {
  testDb: TestDb;
  engine: ReturnType<typeof createExamEngine>;
  /** Absolute path to a set file inside the temp EXAMS_ROOT. */
  setFile: string;
  /** The quesPath used by the engine (relative-from-cwd, e.g. "Exams/.../Easy"). */
  quesPath: string;
  /** The setId written into the JSON. */
  setId: string;
  /** All temp dirs/files created for the test (cleaned up in `cleanup()`). */
  cleanup: () => void;
}

/** Build a small valid JSON question set with cycling correct answers. */
function makeSetJson(name: string, opts: { questions: number; type?: string }) {
  const count = opts.questions;
  const isMulti = opts.type === "multi";
  // Cycling correct answers: A, B, C, D, A, B, …
  const cycle = [["A"], ["B"], ["C"], ["D"]] as const;
  const questions = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    ...(opts.type ? { questionType: opts.type } : {}),
    questionText: `Q${i + 1} of ${name}`,
    options: { A: "alpha", B: "bravo", C: "charlie", D: "delta" },
    correctAnswer: isMulti ? ["A", "B"] : cycle[i % 4]!,
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

async function buildHarness(setName: string, opts: { questions: number; type?: string }): Promise<Harness> {
  // 1. Temp EXAMS_ROOT (so we don't pollute the real repo corpus).
  const examsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-engine-int-"));
  const easyDir = path.join(examsRoot, "Cloud", "AWS", "SAA", "Easy");
  fs.mkdirSync(easyDir, { recursive: true });
  const setFile = path.join(easyDir, `${setName}.json`);
  const setId = `set-${setName}`;
  fs.writeFileSync(setFile, JSON.stringify(makeSetJson(setName, opts), null, 2));

  // 2. The engine derives quesPath from path.relative(process.cwd(), dir). To
  //    get a stable value we make sure process.cwd() matches the harness
  //    expectations; the real cwd of the vitest worker is the repo root, and we
  //    put the file under a sub-path "Exams/..." (relative-from-cwd style) so
  //    the path resolver and set catalog will agree on a quesPath.
  const quesPath = path.relative(process.cwd(), easyDir);

  // 3. Temp SQLite DB (migrated, FK cascades ON — see makeTestDb docs).
  const testDb = makeTestDb();
  const db = testDb.db;

  // 4. Wire the real engine against the temp DB.
  const sessionRepo = createSessionRepo(db);
  const answerRepo = createAnswerRepo(db);
  const completionRepo = createCompletionRepo(db);
  const setCatalogRepo = createSetCatalogRepo(db);
  const setCatalog = createSetCatalogService(setCatalogRepo, completionRepo);
  const pathResolver = createPathResolver();
  // Force the catalog to scan our temp EXAMS_ROOT.
  // (We set the env var so `config.examsRoot` resolves correctly during scan.
  //  `config` is memoised on first access; resetConfigCache ensures the new
  //  env var wins.)
  const prevExamsRoot = process.env.EXAMS_ROOT;
  process.env.EXAMS_ROOT = examsRoot;
  resetConfigCache();
  try {
    await setCatalog.scan();
  } finally {
    if (prevExamsRoot === undefined) {
      delete process.env.EXAMS_ROOT;
    } else {
      process.env.EXAMS_ROOT = prevExamsRoot;
    }
    resetConfigCache();
  }

  const engine = createExamEngine({
    sessionRepo,
    answerRepo,
    completionRepo,
    setCatalog,
    pathResolver,
    // Use a stable settings view (no DB roundtrip needed for these engine tests).
    getSettings: () => SETTINGS_DEFAULTS,
  });

  return {
    testDb,
    engine,
    setFile,
    quesPath,
    setId,
    cleanup: () => {
      testDb.cleanup();
      fs.rmSync(examsRoot, { recursive: true, force: true });
    },
  };
}

// ── cases ────────────────────────────────────────────────────────────────────

describe("ExamEngine — full lifecycle", () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  it("create → applyUpdate(answer) → applyUpdate(elapsed) → submit → getResults", async () => {
    h = await buildHarness("lifecycle", { questions: 4 });

    // create
    const live = h.engine.createSession({
      quesPath: h.quesPath,
      setId: h.setId,
      options: { seed: "lifecycle" },
    });
    expect(live.status).toBe("in_progress");
    expect(live.totalQuestions).toBe(4);
    // Answers hidden on the live DTO.
    for (const q of live.questions) {
      expect(q.correctAnswer).toBeUndefined();
      expect(q.explanations).toBeUndefined();
      expect(q.Tips).toBeUndefined();
    }

    // applyUpdate: answer q1 correctly (A is the correct answer for q1).
    h.engine.applyUpdate(live.id, {
      answer: { questionId: 1, selected: ["A"] },
    });

    // applyUpdate: tick the timer + move to question index 2.
    h.engine.applyUpdate(live.id, { currentIndex: 2, elapsedMs: 12_345 });

    // Re-fetch via getSession — answers remain hidden on non-revealed questions.
    const mid = h.engine.getSession(live.id);
    expect(mid.currentIndex).toBe(2);
    expect(mid.timer.elapsedMs).toBe(12_345);
    // q1 was answered, but NOT revealed → still no correctAnswer.
    const q1 = mid.questions.find((q) => q.id === 1)!;
    expect(q1.answer.selected).toEqual(["A"]);
    expect(q1.correctAnswer).toBeUndefined();

    // submit
    const results = h.engine.submit(live.id);
    expect(results.status).toBe("completed");
    expect(results.summary.total).toBe(4);
    // q1=A correct, q2/q3/q4 unanswered → 1/4 = 25%.
    expect(results.summary.correct).toBe(1);
    expect(results.summary.unanswered).toBe(3);
    expect(results.summary.scorePercent).toBe(25);

    // Answers are SHOWN on the results DTO.
    expect(results.questions.every((q) => q.correctAnswer !== undefined)).toBe(true);

    // getResults returns the same shape after submission.
    const fetched = h.engine.getResults(live.id);
    expect(fetched.id).toBe(live.id);
    expect(fetched.summary.scorePercent).toBe(25);
  });

  it("pause/resume preserves currentIndex and elapsedMs", async () => {
    h = await buildHarness("pause", { questions: 3 });

    const live = h.engine.createSession({
      quesPath: h.quesPath,
      setId: h.setId,
      options: { seed: "pause" },
    });

    // First save: jump to q3 with some elapsed time.
    h.engine.applyUpdate(live.id, { currentIndex: 2, elapsedMs: 5_000 });
    // Second save (the "resume" after pause): progress further.
    h.engine.applyUpdate(live.id, { currentIndex: 2, elapsedMs: 7_500 });

    const reloaded = h.engine.getSession(live.id);
    expect(reloaded.currentIndex).toBe(2);
    expect(reloaded.timer.elapsedMs).toBe(7_500);
    // Status remains in_progress — not auto-submitted.
    expect(reloaded.status).toBe("in_progress");
  });
});

describe("ExamEngine — retake", () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  it("retake-incorrect returns the wrong + revealed questions only", async () => {
    // Build a 5-question set where the correctAnswer pattern is fully explicit
    // (we hand-write the JSON so we can guarantee q1 is correct, q2 is wrong,
    // q3 is revealed, q4 is wrong, q5 is unanswered).
    const examsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-engine-int-"));
    const easyDir = path.join(examsRoot, "Cloud", "AWS", "SAA", "Easy");
    fs.mkdirSync(easyDir, { recursive: true });
    const setFile = path.join(easyDir, "retake.json");
    const questions = [
      { id: 1, questionText: "Q1", options: { A: "a", B: "b", C: "c", D: "d" }, correctAnswer: ["A"] },
      { id: 2, questionText: "Q2", options: { A: "a", B: "b", C: "c", D: "d" }, correctAnswer: ["A"] },
      { id: 3, questionText: "Q3", options: { A: "a", B: "b", C: "c", D: "d" }, correctAnswer: ["A"] },
      { id: 4, questionText: "Q4", options: { A: "a", B: "b", C: "c", D: "d" }, correctAnswer: ["A"] },
      { id: 5, questionText: "Q5", options: { A: "a", B: "b", C: "c", D: "d" }, correctAnswer: ["A"] },
    ];
    fs.writeFileSync(
      setFile,
      JSON.stringify({
        setId: "set-retake",
        setTitle: "Retake Set",
        difficulty: "Easy",
        questions,
      }),
    );
    const testDb = makeTestDb();
    const db = testDb.db;
    const sessionRepo = createSessionRepo(db);
    const answerRepo = createAnswerRepo(db);
    const completionRepo = createCompletionRepo(db);
    const setCatalogRepo = createSetCatalogRepo(db);
    const setCatalog = createSetCatalogService(setCatalogRepo, completionRepo);
    const pathResolver = createPathResolver();
    const prev = process.env.EXAMS_ROOT;
    process.env.EXAMS_ROOT = examsRoot;
    resetConfigCache();
    try {
      await setCatalog.scan();
    } finally {
      if (prev === undefined) delete process.env.EXAMS_ROOT;
      else process.env.EXAMS_ROOT = prev;
      resetConfigCache();
    }
    h = {
      testDb,
      engine: createExamEngine({
        sessionRepo,
        answerRepo,
        completionRepo,
        setCatalog,
        pathResolver,
        getSettings: () => SETTINGS_DEFAULTS,
      }),
      setFile,
      quesPath: path.relative(process.cwd(), easyDir),
      setId: "set-retake",
      cleanup: () => {
        testDb.cleanup();
        fs.rmSync(examsRoot, { recursive: true, force: true });
      },
    };

    // q1 correct (A==A), q2 wrong (B vs A), q3 revealed, q4 wrong (C vs A),
    // q5 unanswered.
    const origin = h.engine.createSession({
      quesPath: h.quesPath,
      setId: h.setId,
      options: { seed: "retake" },
    });
    h.engine.applyUpdate(origin.id, { answer: { questionId: 1, selected: ["A"] } });
    h.engine.applyUpdate(origin.id, { answer: { questionId: 2, selected: ["B"] } });
    h.engine.applyUpdate(origin.id, { answer: { questionId: 3, revealed: true } });
    h.engine.applyUpdate(origin.id, { answer: { questionId: 4, selected: ["C"] } });
    // q5 left unanswered.

    h.engine.submit(origin.id);

    const retake = h.engine.retake(origin.id, { scope: "incorrect" });
    // q1 correct, q5 unanswered → 5 - 2 = 3 qualifying. Of those, q2 (wrong) +
    // q3 (revealed) + q4 (wrong) = 3.
    expect(retake.totalQuestions).toBe(3);
    expect(retake.mode).toBe("retake_incorrect");
    const ids = retake.questions.map((q) => q.id).sort((a, b) => a - b);
    expect(ids).toEqual([2, 3, 4]);
  });

  it("retake-incorrect throws SETS_EXHAUSTED when every question was answered correctly", async () => {
    h = await buildHarness("all-correct", { questions: 3 });

    // All three correct: q1=A, q2=B, q3=C (matches cycling correct answers).
    const origin = h.engine.createSession({
      quesPath: h.quesPath,
      setId: h.setId,
      options: { seed: "all-correct" },
    });
    h.engine.applyUpdate(origin.id, { answer: { questionId: 1, selected: ["A"] } });
    h.engine.applyUpdate(origin.id, { answer: { questionId: 2, selected: ["B"] } });
    h.engine.applyUpdate(origin.id, { answer: { questionId: 3, selected: ["C"] } });
    h.engine.submit(origin.id);

    expect(() => h.engine.retake(origin.id, { scope: "incorrect" })).toThrowError(
      expect.objectContaining({ code: "SETS_EXHAUSTED" } satisfies Partial<AppError>),
    );
  });
});

describe("ExamEngine — snapshot integrity + discard + 409", () => {
  let h: Harness;
  afterEach(() => h?.cleanup());

  it("score comes from the snapshot, not from a mutated source file", async () => {
    h = await buildHarness("snap", { questions: 2 });

    const live = h.engine.createSession({
      quesPath: h.quesPath,
      setId: h.setId,
      options: { seed: "integrity" },
    });
    // Answer against the ORIGINAL correct answers: q1=A (correct), q2=A (wrong, B was correct).
    h.engine.applyUpdate(live.id, { answer: { questionId: 1, selected: ["A"] } });
    h.engine.applyUpdate(live.id, { answer: { questionId: 2, selected: ["A"] } });

    // Mutate the source file: flip q1's correctAnswer to D and q2's to A.
    const tampered = makeSetJson("snap", { questions: 2 });
    tampered.questions[0]!.correctAnswer = ["D"];
    tampered.questions[1]!.correctAnswer = ["A"]; // would make q2 'correct' under the new file
    fs.writeFileSync(h.setFile, JSON.stringify(tampered));

    // Submit — grading MUST use the snapshot (q1 A correct vs original A, q2 A vs original B → 1/2 = 50%).
    const results = h.engine.submit(live.id);
    expect(results.summary.correct).toBe(1);
    expect(results.summary.incorrect).toBe(1);
    expect(results.summary.total).toBe(2);
    expect(results.summary.scorePercent).toBe(50);
    // The results DTO also exposes the snapshot's correct answers.
    const q1 = results.questions.find((q) => q.id === 1)!;
    const q2 = results.questions.find((q) => q.id === 2)!;
    expect(q1.correctAnswer).toEqual(["A"]);
    expect(q2.correctAnswer).toEqual(["B"]);
  });

  it("discard cascades to session_answers and removes the session from the in-progress list", async () => {
    h = await buildHarness("discard", { questions: 3 });

    const live = h.engine.createSession({
      quesPath: h.quesPath,
      setId: h.setId,
      options: { seed: "discard" },
    });
    h.engine.applyUpdate(live.id, { answer: { questionId: 1, selected: ["A"] } });
    h.engine.applyUpdate(live.id, { answer: { questionId: 2, selected: ["B"] } });

    // Sanity: 3 blank-ish answer rows exist (one per question, with possibly a
    // selection on q1 and q2). They were seeded by the engine at create time.
    const before = h.testDb.db
      .prepare("SELECT COUNT(*) AS c FROM session_answers WHERE session_id = ?")
      .get(live.id) as { c: number };
    expect(before.c).toBe(3);

    h.engine.discard(live.id);

    // After discard: every answer row is gone (engine deletes them explicitly
    // so the discarded row is lean, not relying on FK cascade).
    const after = h.testDb.db
      .prepare("SELECT COUNT(*) AS c FROM session_answers WHERE session_id = ?")
      .get(live.id) as { c: number };
    expect(after.c).toBe(0);

    // The session itself stays in the DB (soft-discard preserves history) but
    // its status is 'discarded' — so a "list in_progress" filter excludes it.
    const inProgress = h.testDb.db
      .prepare(
        "SELECT id FROM exam_sessions WHERE id = ? AND status = 'in_progress'",
      )
      .get(live.id);
    expect(inProgress).toBeUndefined();
    const row = h.testDb.db
      .prepare("SELECT status FROM exam_sessions WHERE id = ?")
      .get(live.id) as { status: string };
    expect(row.status).toBe("discarded");
  });

  it("submit twice throws SESSION_ALREADY_COMPLETED on the second call", async () => {
    h = await buildHarness("twice", { questions: 2 });

    const live = h.engine.createSession({
      quesPath: h.quesPath,
      setId: h.setId,
      options: { seed: "twice" },
    });
    h.engine.applyUpdate(live.id, { answer: { questionId: 1, selected: ["A"] } });
    h.engine.submit(live.id);

    // Second submit MUST throw 409.
    expect(() => h.engine.submit(live.id)).toThrowError(
      expect.objectContaining({ code: "SESSION_ALREADY_COMPLETED" } satisfies Partial<AppError>),
    );
  });
});
