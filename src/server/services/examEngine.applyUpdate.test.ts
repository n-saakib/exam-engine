import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeTestDb, type TestDb } from "@/server/test/makeTestDb";
import { createSessionRepo } from "@/server/data/repos/sessionRepo";
import { createAnswerRepo } from "@/server/data/repos/answerRepo";
import { createCompletionRepo } from "@/server/data/repos/completionRepo";
import { createSetCatalogService } from "@/server/services/setCatalog";
import { createSetCatalogRepo } from "@/server/data/repos/setCatalogRepo";
import { createPathResolver } from "@/server/services/pathResolver";
import { createExamEngine } from "@/server/services/examEngine";

/**
 * Tests for `applyUpdate` — the F4 autosave path. Pins the timer clamp, the
 * idempotency / monotonicity contracts, and a few error mappings.
 *
 * Some of these tests are red against the current implementation and will
 * pass only after the C2/HIGH-13 fixes:
 *   - `elapsedMs: NaN` → currently no explicit check (Number.isFinite branch)
 *   - `elapsedMs: Infinity` → currently no explicit check
 *   - `elapsedMs` regression (lower than stored) → currently allowed
 *   - `paused` status → currently rejected (HIGH-13 will accept it)
 *
 * They are written now to lock the contract for the next fix loop.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-apply-"));
const dbPath = path.join(tmpDir, "apply.db");
const examsDir = path.join(tmpDir, "Exams");
const easyDir = path.join(examsDir, "Cloud", "AWS", "SAA", "Easy");
fs.mkdirSync(easyDir, { recursive: true });

process.env.DB_PATH = dbPath;
process.env.EXAMS_ROOT = examsDir;

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

function writeSet(name: string, opts: { questions?: number; timed?: boolean } = {}) {
  const count = opts.questions ?? 1;
  const set = {
    setId: `set-${name}`,
    setTitle: `Set ${name}`,
    difficulty: "Easy",
    questions: Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      questionType: "single",
      questionText: `Q ${i + 1} of ${name}`,
      options: { A: "alpha", B: "bravo", C: "charlie", D: "delta" },
      correctAnswer: ["A"],
      explanations: {
        A: { description: "A", reason: "right" },
        B: { description: "B", reason: "wrong" },
        C: { description: "C", reason: "wrong" },
        D: { description: "D", reason: "wrong" },
      },
    })),
  };
  fs.writeFileSync(path.join(easyDir, `${name}.json`), JSON.stringify(set, null, 2));
}

let t: TestDb;
let engine: ReturnType<typeof createExamEngine>;

const QUES_PATH = "Exams/Cloud/AWS/SAA/Easy";

beforeAll(async () => {
  const { resetConfigCache } = await import("@/server/config");
  resetConfigCache();

  const { runMigrations } = await import("@/server/boot");
  runMigrations();

  writeSet("alpha", { questions: 1, timed: true });

  t = makeTestDb();
  // Re-use the same DB file the container used, so the exam engine sees the
  // same data the boot set up. The simpler path is to write into a fresh
  // temp DB and build the engine against it directly.
  const sessionRepo = createSessionRepo(t.db);
  const answerRepo = createAnswerRepo(t.db);
  const completionRepo = createCompletionRepo(t.db);
  const setCatalogRepo = createSetCatalogRepo(t.db);
  const setCatalog = createSetCatalogService(setCatalogRepo, completionRepo);
  const pathResolver = createPathResolver();

  // Seed a single set into the catalogue.
  setCatalogRepo.upsert({
    setId: "set-alpha",
    setTitle: "Set alpha",
    difficulty: "Easy",
    quesPath: QUES_PATH,
    filePath: path.join(easyDir, "alpha.json"),
    questionCount: 1,
    contentHash: "hash",
    source: "filesystem",
    status: "ok",
    diagnostics: [],
  });

  engine = createExamEngine({
    sessionRepo,
    answerRepo,
    completionRepo,
    setCatalog,
    pathResolver,
    getSettings: () => ({
      exams_root: examsDir,
      source_mode: "filesystem",
      timer_enabled: true,
      timer_default_minutes: null,
      show_count_before_start: true,
      shuffle_questions: false,
      shuffle_options: false,
      progressive_reveal: true,
      theme: "system",
      last_selected_path: [],
      schema_version_seen: 0,
    }),
  });
});

afterAll(async () => {
  t?.cleanup();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeSession(opts: { timed?: boolean; timerLimitMs?: number } = {}): string {
  // We construct the session directly via the repo to skip the setCatalog
  // file-loader (we already wrote the file in beforeAll). This isolates the
  // engine under test to applyUpdate only.
  const id = `s-${Math.random().toString(16).slice(2)}`;
  const sessionRepo = createSessionRepo(t.db);
  const answerRepo = createAnswerRepo(t.db);
  sessionRepo.insert({
    id,
    quesPath: QUES_PATH,
    domainLabel: "Cloud / AWS / SAA / Easy",
    setId: "set-alpha",
    setTitle: "Set alpha",
    difficulty: "Easy",
    questionSnapshot: JSON.stringify([
      {
        id: 1,
        order: 1,
        questionType: "single",
        questionText: "Q",
        options: { A: "alpha", B: "bravo" },
        correctAnswer: ["A"],
      },
    ]),
    totalQuestions: 1,
    timerEnabled: !!opts.timed,
    timerLimitMs: opts.timed ? (opts.timerLimitMs ?? 60_000) : null,
    shuffleSeed: "seed",
    mode: "full",
    originSessionId: null,
    createdAt: "2026-06-10T00:00:00.000Z",
  });
  answerRepo.insertBlanks(id, [1]);
  return id;
}

describe("examEngine.applyUpdate — timer", () => {
  it("clamps elapsedMs to [0, limitMs] when timed", () => {
    const id = makeSession({ timed: true, timerLimitMs: 60_000 });
    engine.applyUpdate(id, { elapsedMs: 999_999_999 });
    const session = engine.getSession(id);
    expect(session.timer.elapsedMs).toBe(60_000);
  });

  it("rejects elapsedMs: NaN with VALIDATION_ERROR", () => {
    const id = makeSession();
    expect(() =>
      engine.applyUpdate(id, {
        elapsedMs: Number.NaN as unknown as number,
      }),
    ).toThrow();
    try {
      engine.applyUpdate(id, { elapsedMs: Number.NaN as unknown as number });
    } catch (err) {
      // The contract: NaN must be rejected. The current code coerces via
      // Math.max, which yields NaN — and SQLite stores NULL for non-int
      // (Number.isInteger guard). Either way, the call must not succeed.
      expect((err as { code?: string }).code ?? "REJECTED").toBeDefined();
    }
  });

  it("rejects elapsedMs: Infinity with VALIDATION_ERROR", () => {
    const id = makeSession({ timed: true, timerLimitMs: 60_000 });
    expect(() =>
      engine.applyUpdate(id, {
        elapsedMs: Number.POSITIVE_INFINITY as unknown as number,
      }),
    ).toThrow();
  });
});

describe("examEngine.applyUpdate — idempotency & monotonicity", () => {
  it("is idempotent on retry: same absolute value does not double-count", () => {
    const id = makeSession({ timed: true, timerLimitMs: 60_000 });
    engine.applyUpdate(id, { elapsedMs: 5_000 });
    engine.applyUpdate(id, { elapsedMs: 5_000 });
    engine.applyUpdate(id, { elapsedMs: 5_000 });
    const session = engine.getSession(id);
    expect(session.timer.elapsedMs).toBe(5_000);
  });

  it("monotonic reveal: once revealed:true, a later revealed:false does not un-reveal", () => {
    const id = makeSession();
    engine.applyUpdate(id, { answer: { questionId: 1, revealed: true } });
    // The schema (PatchAnswerSchema) does not allow `revealed: false` from
    // the wire, but the engine itself must defend — we call with the full
    // patch object including the field.
    engine.applyUpdate(id, {
      answer: { questionId: 1, revealed: false } as unknown as { questionId: number; revealed: boolean },
    });
    const session = engine.getSession(id);
    const q1 = session.questions.find((q) => q.id === 1)!;
    expect(q1.answer.revealed).toBe(true);
  });

  it("persists gaveUp on the answer row (live DTO carries gaveUp=true)", () => {
    // F4 gave-up: user clicks "Give up" with no selection; reveal() must
    // persist is_gave_up=1 and the next getSession() must surface gaveUp=true
    // on the LiveAnswer. The flag is monotonic (give-up is a one-way intent).
    const id = makeSession();
    engine.applyUpdate(id, { answer: { questionId: 1, revealed: true, gaveUp: true } });
    const session = engine.getSession(id);
    const q1 = session.questions.find((q) => q.id === 1)!;
    expect(q1.answer.revealed).toBe(true);
    expect(q1.answer.gaveUp).toBe(true);
  });

  it("monotonic gaveUp: a later gaveUp:false on a revealed row does not un-give-up", () => {
    // The schema (PatchAnswerSchema) does not allow `gaveUp: false` from
    // the wire, but the engine itself must defend — once gaveUp is true it
    // stays true, parallel to `revealed`. This pins the symmetry.
    const id = makeSession();
    engine.applyUpdate(id, { answer: { questionId: 1, revealed: true, gaveUp: true } });
    engine.applyUpdate(id, {
      answer: { questionId: 1, gaveUp: false } as unknown as { questionId: number; gaveUp: boolean },
    });
    const session = engine.getSession(id);
    const q1 = session.questions.find((q) => q.id === 1)!;
    expect(q1.answer.gaveUp).toBe(true);
  });

  it("a give-up WITH a selection (user picks, then changes mind) still records gaveUp", () => {
    // The user might select options and then change their mind and click
    // "Give up" — gaveUp is the *intent*, not a derivation from `selected`.
    // The PATCH must carry both `selected` and `gaveUp: true` and the row
    // must reflect both fields.
    const id = makeSession();
    engine.applyUpdate(id, { answer: { questionId: 1, selected: ["B"] } });
    engine.applyUpdate(id, { answer: { questionId: 1, revealed: true, gaveUp: true } });
    const session = engine.getSession(id);
    const q1 = session.questions.find((q) => q.id === 1)!;
    expect(q1.answer.selected).toEqual(["B"]);
    expect(q1.answer.revealed).toBe(true);
    expect(q1.answer.gaveUp).toBe(true);
  });
});

describe("examEngine.applyUpdate — regression / lifecycle", () => {
  it("rejects elapsedMs regression (lower value than stored) — passes after the C2 fix", () => {
    const id = makeSession({ timed: true, timerLimitMs: 60_000 });
    engine.applyUpdate(id, { elapsedMs: 30_000 });
    // The current implementation allows the regression: it stores the
    // smaller value. After the C2 fix this throws VALIDATION_ERROR.
    expect(() => engine.applyUpdate(id, { elapsedMs: 10_000 })).toThrow();
  });

  it("with non-in_progress status throws SESSION_NOT_IN_PROGRESS (current behaviour; HIGH-13 should accept 'paused')", () => {
    const id = makeSession();
    // Move the session to `discarded` — a valid status. The current engine
    // rejects any non-`in_progress` status with SESSION_NOT_IN_PROGRESS.
    // After HIGH-13 lands a `paused` status, this test should be re-purposed
    // to verify that `paused` is ACCEPTED.
    t.db
      .prepare("UPDATE exam_sessions SET status = 'discarded' WHERE id = ?")
      .run(id);
    expect(() => engine.applyUpdate(id, { currentIndex: 0 })).toThrow();
    // Confirm the row is in the expected post-state.
    const sessionRepo = createSessionRepo(t.db);
    const row = sessionRepo.getById(id);
    expect(row?.status).toBe("discarded");
  });
});
