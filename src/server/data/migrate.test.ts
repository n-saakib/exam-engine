import { afterEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/server/test/makeTestDb";
import { migrate, getSchemaVersion } from "@/server/data/migrate";

describe("migration runner", () => {
  let t: TestDb;
  afterEach(() => t?.cleanup());

  it("applies 0001_init and 0002_drop_confidence; a second run is a no-op (one row per version)", () => {
    t = makeTestDb(); // makeTestDb already ran migrate once

    // schema_migrations exists and has one row per registered version.
    const rows = t.db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all() as Array<{ version: number }>;
    expect(rows).toEqual([{ version: 1 }, { version: 2 }]);
    expect(getSchemaVersion(t.db)).toBe(2);

    // Re-running applies nothing new and does not duplicate the version row.
    const result = migrate(t.db);
    expect(result.applied).toEqual([]);
    expect(result.currentVersion).toBe(2);

    const after = t.db
      .prepare("SELECT COUNT(*) AS c FROM schema_migrations")
      .get() as { c: number };
    expect(after.c).toBe(2);
  });

  it("creates all MVP tables with the enum CHECK constraints", () => {
    t = makeTestDb();
    const tables = t.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "settings",
        "set_catalog",
        "set_completion",
        "exam_sessions",
        "session_answers",
        "schema_migrations",
      ]),
    );

    // A bad enum value must be rejected by the CHECK constraint.
    expect(() =>
      t.db
        .prepare(
          `INSERT INTO exam_sessions
             (id, status, ques_path, domain_label, set_id, set_title, difficulty,
              question_snapshot, total_questions, created_at, updated_at)
           VALUES (?, 'in-progress', 'p', 'd', 's', 't', 'Easy', '[]', 1, 'now', 'now')`,
        )
        .run("typo-status"),
    ).toThrow();
  });

  it("enforces the timer_enabled ⇒ timer_limit_ms CHECK", () => {
    t = makeTestDb();
    expect(() =>
      t.db
        .prepare(
          `INSERT INTO exam_sessions
             (id, status, ques_path, domain_label, set_id, set_title, difficulty,
              question_snapshot, total_questions, timer_enabled, timer_limit_ms,
              created_at, updated_at)
           VALUES (?, 'in_progress', 'p', 'd', 's', 't', 'Easy', '[]', 1, 1, NULL, 'now', 'now')`,
        )
        .run("timed-no-limit"),
    ).toThrow();
  });
});
