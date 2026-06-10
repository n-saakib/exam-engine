import { afterEach, describe, expect, it } from "vitest";

import { makeTestDb, type TestDb } from "@/server/test/makeTestDb";
import {
  createSessionRepo,
  type InsertSessionParams,
} from "@/server/data/repos/sessionRepo";
import { createAnswerRepo } from "@/server/data/repos/answerRepo";

function baseInsert(id = "sess-1"): InsertSessionParams {
  return {
    id,
    quesPath: "Exams/X",
    domainLabel: "X / Y",
    setId: "set-1",
    setTitle: "Set One",
    difficulty: "Easy",
    questionSnapshot: JSON.stringify([{ id: 1, order: 1 }]),
    totalQuestions: 2,
    timerEnabled: true,
    timerLimitMs: 600000,
    shuffleSeed: "seed",
    mode: "full",
    originSessionId: null,
    createdAt: new Date().toISOString(),
  };
}

describe("sessionRepo", () => {
  let t: TestDb;
  afterEach(() => t?.cleanup());

  it("inserts and reads back a session", () => {
    t = makeTestDb();
    const repo = createSessionRepo(t.db);
    repo.insert(baseInsert());
    const row = repo.getById("sess-1");
    expect(row).toBeDefined();
    expect(row!.status).toBe("in_progress");
    expect(row!.timer_enabled).toBe(1);
    expect(row!.timer_limit_ms).toBe(600000);
    expect(row!.set_title).toBe("Set One");
    expect(row!.started_at).toBe(row!.created_at);
  });

  it("returns undefined for an unknown id", () => {
    t = makeTestDb();
    const repo = createSessionRepo(t.db);
    expect(repo.getById("nope")).toBeUndefined();
  });

  it("patches only the provided fields and bumps updated_at", async () => {
    t = makeTestDb();
    const repo = createSessionRepo(t.db);
    repo.insert(baseInsert());
    const before = repo.getById("sess-1")!;

    await new Promise((r) => setTimeout(r, 5));
    repo.patch("sess-1", { currentIndex: 3, timeElapsedMs: 1234 });

    const after = repo.getById("sess-1")!;
    expect(after.current_index).toBe(3);
    expect(after.time_elapsed_ms).toBe(1234);
    expect(after.status).toBe("in_progress"); // untouched
    expect(after.updated_at >= before.updated_at).toBe(true);
  });

  it("patches score/completion fields and booleans", () => {
    t = makeTestDb();
    const repo = createSessionRepo(t.db);
    repo.insert(baseInsert());
    repo.patch("sess-1", {
      status: "completed",
      scorePercent: 80,
      correctCount: 8,
      isBookmarked: true,
      completedAt: "2026-06-10T00:00:00.000Z",
    });
    const row = repo.getById("sess-1")!;
    expect(row.status).toBe("completed");
    expect(row.score_percent).toBe(80);
    expect(row.correct_count).toBe(8);
    expect(row.is_bookmarked).toBe(1);
    expect(row.completed_at).toBe("2026-06-10T00:00:00.000Z");
  });

  it("deleteById cascades to answers (per-connection FK pragma)", () => {
    t = makeTestDb();
    const repo = createSessionRepo(t.db);
    const answers = createAnswerRepo(t.db);
    repo.insert(baseInsert());
    answers.insertBlanks("sess-1", [1, 2]);
    expect(answers.getBySession("sess-1").length).toBe(2);

    const changes = repo.deleteById("sess-1");
    expect(changes).toBe(1);
    expect(answers.getBySession("sess-1").length).toBe(0);
  });
});

describe("answerRepo", () => {
  let t: TestDb;
  afterEach(() => t?.cleanup());

  function seed(): ReturnType<typeof createAnswerRepo> {
    const sessions = createSessionRepo(t.db);
    sessions.insert(baseInsert());
    return createAnswerRepo(t.db);
  }

  it("insertBlanks is idempotent (ON CONFLICT DO NOTHING)", () => {
    t = makeTestDb();
    const answers = seed();
    answers.insertBlanks("sess-1", [1, 2, 3]);
    answers.insertBlanks("sess-1", [1, 2, 3]); // again
    expect(answers.getBySession("sess-1").length).toBe(3);
  });

  it("upsert writes selection + stamps answered_at", () => {
    t = makeTestDb();
    const answers = seed();
    answers.insertBlanks("sess-1", [1]);
    answers.upsert("sess-1", 1, { selected: ["B"], flagged: true });
    const row = answers.getOne("sess-1", 1)!;
    expect(JSON.parse(row.selected_options)).toEqual(["B"]);
    expect(row.is_flagged).toBe(1);
    expect(row.answered_at).not.toBeNull();
  });

  it("upsert with empty patch is a no-op (creates blank row only)", () => {
    t = makeTestDb();
    const answers = seed();
    answers.upsert("sess-1", 5, {});
    const row = answers.getOne("sess-1", 5)!;
    expect(JSON.parse(row.selected_options)).toEqual([]);
    expect(row.is_flagged).toBe(0);
  });

  it("setCorrect writes the graded flag", () => {
    t = makeTestDb();
    const answers = seed();
    answers.insertBlanks("sess-1", [1, 2]);
    answers.setCorrect("sess-1", 1, true);
    answers.setCorrect("sess-1", 2, false);
    expect(answers.getOne("sess-1", 1)!.is_correct).toBe(1);
    expect(answers.getOne("sess-1", 2)!.is_correct).toBe(0);
  });
});
