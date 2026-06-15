import { afterEach, describe, expect, it } from "vitest";

import { makeTestDb, type TestDb } from "@/server/test/makeTestDb";
import { createSessionRepo, type InsertSessionParams } from "@/server/data/repos/sessionRepo";
import { createAnswerRepo } from "@/server/data/repos/answerRepo";
import { createExportService } from "@/server/services/exportService";

/**
 * Tests for `createExportService` — covers the output formats, the scopes, and
 * a few resilience cases (malformed `selected_options`, CSV formula-injection
 * escaping).
 */

function baseInsert(
  id: string,
  opts: {
    domainLabel?: string;
    setTitle?: string;
    note?: string | null;
    scorePercent?: number | null;
  } = {},
): InsertSessionParams {
  return {
    id,
    quesPath: "Exams/Cloud/AWS/SAA/Easy",
    domainLabel: opts.domainLabel ?? "Cloud / AWS / SAA / Easy",
    setId: `set-${id}`,
    setTitle: opts.setTitle ?? `Set ${id}`,
    difficulty: "Easy",
    questionSnapshot: JSON.stringify([
      {
        id: 1,
        order: 1,
        questionType: "single",
        questionText: "Pick A.",
        options: { A: "alpha", B: "bravo", C: "charlie", D: "delta" },
        correctAnswer: ["A"],
      },
    ]),
    totalQuestions: 1,
    timerEnabled: false,
    timerLimitMs: null,
    shuffleSeed: "seed",
    mode: "full",
    originSessionId: null,
    createdAt: "2026-06-10T00:00:00.000Z",
  };
}

function seedCompleted(
  t: TestDb,
  id: string,
  selected: string,
  opts: { revealed?: boolean; flagged?: boolean; note?: string | null } = {},
): void {
  const sessions = createSessionRepo(t.db);
  const answers = createAnswerRepo(t.db);
  sessions.insert(baseInsert(id));
  // Mark as completed with a score.
  sessions.patch(id, {
    status: "completed",
    scorePercent: 100,
    correctCount: 1,
    incorrectCount: 0,
    revealedCount: 0,
    unansweredCount: 0,
    completedAt: "2026-06-10T00:00:00.000Z",
  });
  if (opts.note !== undefined) sessions.patch(id, { note: opts.note });
  answers.insertBlanks(id, [1]);
  if (selected) {
    answers.upsert(id, 1, {
      selected: [selected],
      flagged: !!opts.flagged,
      revealed: !!opts.revealed,
    });
  } else if (opts.revealed || opts.flagged) {
    answers.upsert(id, 1, {
      flagged: !!opts.flagged,
      revealed: !!opts.revealed,
    });
  }
}

describe("exportService — JSON", () => {
  let t: TestDb;
  afterEach(() => t?.cleanup());

  it("build({format:'json',scope:'all'}) with malformed `selected_options` returns yourAnswer=[] and does not throw", () => {
    t = makeTestDb();
    // Hand-craft a session with a malformed `selected_options` JSON value
    // (the column is TEXT — there is no schema-level constraint that
    // guarantees it is a JSON array). Insert the answer row first so the
    // export's `answerMap.get(q.id)` returns a row, then poison the JSON.
    const sessions = createSessionRepo(t.db);
    const answers = createAnswerRepo(t.db);
    sessions.insert(baseInsert("s-bad"));
    sessions.patch("s-bad", {
      status: "completed",
      scorePercent: 0,
      correctCount: 0,
      incorrectCount: 1,
      revealedCount: 0,
      unansweredCount: 0,
      completedAt: "2026-06-10T00:00:00.000Z",
    });
    answers.insertBlanks("s-bad", [1]);
    t.db
      .prepare(
        `UPDATE session_answers SET selected_options = ? WHERE session_id = ? AND question_id = 1`,
      )
      .run("not json", "s-bad");

    const exportService = createExportService(t.db);
    // The contract: the export must not throw on a malformed per-answer JSON
    // blob — it must produce a row with `yourAnswer: []` and a stable
    // `outcome` value.
    let payload: {
      sessions: Array<{
        id: string;
        questions?: Array<{ yourAnswer: string[]; outcome: string }>;
      }>;
    } | null = null;
    expect(() => {
      const res = exportService.build("json", "all");
      payload = JSON.parse(res.body) as typeof payload;
    }).not.toThrow();
    expect(payload).not.toBeNull();
    expect(payload!.sessions.length).toBe(1);
    expect(payload!.sessions[0]!.questions!.length).toBe(1);
    expect(payload!.sessions[0]!.questions![0]!.yourAnswer).toEqual([]);
  });

  it("scope:'all' includes `settings` in the JSON payload", () => {
    t = makeTestDb();
    seedCompleted(t, "s1", "A");

    const exportService = createExportService(t.db);
    const payload = JSON.parse(exportService.build("json", "all").body) as {
      settings?: Record<string, unknown>;
      sessions: Array<unknown>;
    };
    expect(payload.settings).toBeDefined();
    expect(payload.settings).toMatchObject({ theme: "system" });
  });

  it("scope:'history' excludes `settings` from the JSON payload", () => {
    t = makeTestDb();
    seedCompleted(t, "s1", "A");

    const exportService = createExportService(t.db);
    const payload = JSON.parse(exportService.build("json", "history").body) as {
      settings?: Record<string, unknown>;
      sessions: Array<unknown>;
    };
    expect(payload.settings).toBeUndefined();
    expect(payload.sessions.length).toBe(1);
  });

  it("JSON output round-trips answers (selected, revealed, flagged)", () => {
    t = makeTestDb();
    seedCompleted(t, "sel", "A");
    seedCompleted(t, "rev", "B", { revealed: true });
    seedCompleted(t, "flag", "C", { flagged: true });

    const exportService = createExportService(t.db);
    const payload = JSON.parse(exportService.build("json", "all").body) as {
      sessions: Array<{
        id: string;
        questions: Array<{ yourAnswer: string[]; outcome: string; flagged: boolean }>;
      }>;
    };
    const byId = new Map(payload.sessions.map((s) => [s.id, s]));
    expect(byId.get("sel")?.questions[0]?.yourAnswer).toEqual(["A"]);
    expect(byId.get("sel")?.questions[0]?.outcome).toBe("correct");
    expect(byId.get("sel")?.questions[0]?.flagged).toBe(false);

    expect(byId.get("rev")?.questions[0]?.yourAnswer).toEqual(["B"]);
    expect(byId.get("rev")?.questions[0]?.outcome).toBe("revealed");

    expect(byId.get("flag")?.questions[0]?.yourAnswer).toEqual(["C"]);
    expect(byId.get("flag")?.questions[0]?.outcome).toBe("incorrect");
    expect(byId.get("flag")?.questions[0]?.flagged).toBe(true);
  });
});

describe("exportService — CSV", () => {
  let t: TestDb;
  afterEach(() => t?.cleanup());

  it("escapes leading `=`, `+`, `-`, `@` (formula injection) in CSV cells", () => {
    t = makeTestDb();
    // A note that starts with `=` would, in Excel/Sheets, be interpreted as
    // a formula. The export must prefix dangerous leading characters with a
    // single quote so the cell renders as text.
    seedCompleted(t, "csv1", "A", { note: "=cmd|'/c calc'!A1" });
    seedCompleted(t, "csv2", "B", { note: "+danger" });
    seedCompleted(t, "csv3", "C", { note: "-also-danger" });
    seedCompleted(t, "csv4", "D", { note: "@sum(1)" });

    const exportService = createExportService(t.db);
    const csv = exportService.build("csv", "all").body;

    expect(csv).toContain("'=cmd|'/c calc'!A1");
    expect(csv).toContain("'+danger");
    expect(csv).toContain("'-also-danger");
    expect(csv).toContain("'@sum(1)");
  });

  it("CSV with no completed sessions returns header-only output", () => {
    t = makeTestDb();
    const exportService = createExportService(t.db);
    const csv = exportService.build("csv", "all").body;
    const lines = csv.split(/\r?\n/);
    // Exactly one line: the header.
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/^id,domainLabel,setTitle,/);
  });
});
