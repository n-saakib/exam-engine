import { afterEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/server/test/makeTestDb";
import { migrate, getSchemaVersion } from "@/server/data/migrate";
import { MIGRATIONS } from "@/server/data/migrations";

describe("migration runner", () => {
  let t: TestDb;
  afterEach(() => t?.cleanup());

  it("applies all registered migrations (0001-0007); a second run is a no-op (one row per version)", () => {
    t = makeTestDb(); // makeTestDb already ran migrate once

    // schema_migrations exists and has one row per registered version.
    const rows = t.db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all() as Array<{ version: number }>;
    expect(rows).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
    ]);
    expect(getSchemaVersion(t.db)).toBe(7);

    // Re-running applies nothing new and does not duplicate the version row.
    const result = migrate(t.db);
    expect(result.applied).toEqual([]);
    expect(result.currentVersion).toBe(7);

    const after = t.db
      .prepare("SELECT COUNT(*) AS c FROM schema_migrations")
      .get() as { c: number };
    expect(after.c).toBe(7);
  });

  /**
   * Regression for the live "submit returns 500 INTERNAL" bug.
   *
   * Some production databases were created against an earlier in-flight 0001
   * that did not declare `gave_up_count` on `exam_sessions`. Migration 0003
   * only added `is_gave_up` to `session_answers`, so the column was never
   * backfilled. Submitting a session then raised `no such column:
   * gave_up_count` and the route surfaced a generic 500.
   *
   * 0004_add_gave_up_count must close that gap: when migrate runs against a
   * DB whose `exam_sessions` lacks the column, the new column is added and
   * any subsequent UPDATE that writes `gave_up_count` succeeds.
   */
  it("0004_add_gave_up_count backfills a DB whose exam_sessions lacks gave_up_count (submit regression)", () => {
    // We bypass `makeTestDb()` because that already applies all migrations.
    // Instead we wipe the schema and re-migrate against the registry minus
    // 0004, then DROP the `gave_up_count` column to recreate the production
    // shape, then re-run migrate() and assert 0004 is applied and the UPDATE
    // succeeds.
    t = makeTestDb();
    // Wipe everything so the runner treats this as a fresh DB.
    t.db.exec(`
      DELETE FROM schema_migrations;
      DROP TABLE IF EXISTS session_answers;
      DROP TABLE IF EXISTS set_completion;
      DROP TABLE IF EXISTS set_catalog;
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS exam_sessions;
    `);

    // Apply the registry minus 0004 to mirror an older production DB whose
    // `exam_sessions` does NOT declare `gave_up_count`.
    const before0004 = MIGRATIONS.filter((m) => m.version < 4);
    const before = migrate(t.db, before0004);
    expect(before.applied).toEqual([1, 2, 3]);

    // Sanity: 0001 declares the column in the current source, so a fresh
    // build of the schema has it. To reproduce the production regression we
    // have to strip it back out (rebuild the table without the column).
    t.db.exec(`DROP TABLE exam_sessions`);
    t.db.exec(`
      CREATE TABLE exam_sessions (
        id                TEXT PRIMARY KEY,
        status            TEXT NOT NULL DEFAULT 'in_progress',
        ques_path         TEXT NOT NULL,
        domain_label      TEXT NOT NULL,
        set_id            TEXT NOT NULL,
        set_title         TEXT NOT NULL,
        difficulty        TEXT NOT NULL,
        question_snapshot TEXT NOT NULL,
        total_questions   INTEGER NOT NULL,
        timer_enabled     INTEGER NOT NULL DEFAULT 0,
        timer_limit_ms    INTEGER,
        time_elapsed_ms   INTEGER NOT NULL DEFAULT 0,
        current_index     INTEGER NOT NULL DEFAULT 0,
        shuffle_seed      TEXT,
        mode              TEXT NOT NULL DEFAULT 'full',
        origin_session_id TEXT,
        score_percent     REAL,
        correct_count     INTEGER,
        incorrect_count   INTEGER,
        revealed_count    INTEGER,
        unanswered_count  INTEGER,
        is_bookmarked     INTEGER NOT NULL DEFAULT 0,
        note              TEXT,
        created_at        TEXT NOT NULL,
        started_at        TEXT,
        updated_at        TEXT NOT NULL,
        completed_at      TEXT,
        CHECK (timer_enabled = 0 OR timer_limit_ms IS NOT NULL)
      )
    `);

    // UPDATE with gave_up_count must fail BEFORE the migration.
    expect(() =>
      t.db
        .prepare(
          "UPDATE exam_sessions SET gave_up_count = 1, updated_at = 'now' WHERE id = 'x'",
        )
        .run(),
    ).toThrow(/no such column: gave_up_count/);

    // Run the full registry. 0004 adds gave_up_count, 0005 drops the legacy
    // revealed_count and unanswered_count columns that this fixture still
    // carries from the old 0001 schema, 0006 renames session_answers.is_revealed
    // to is_committed, and 0007 removes the progressive_reveal setting.
    const result = migrate(t.db);
    expect(result.applied).toEqual([4, 5, 6, 7]);

    // Now the UPDATE must succeed.
    expect(() =>
      t.db
        .prepare(
          "UPDATE exam_sessions SET gave_up_count = 1, updated_at = 'now' WHERE id = 'x'",
        )
        .run(),
    ).not.toThrow();

    const cols = t.db
      .prepare("PRAGMA table_info('exam_sessions')")
      .all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain("gave_up_count");
    // 0005 dropped the legacy aggregates.
    expect(cols.map((c) => c.name)).not.toContain("revealed_count");
    expect(cols.map((c) => c.name)).not.toContain("unanswered_count");

    // 0006 renamed the per-question live-exam flag.
    const answerCols = t.db
      .prepare("PRAGMA table_info('session_answers')")
      .all() as Array<{ name: string }>;
    expect(answerCols.map((c) => c.name)).toContain("is_committed");
    expect(answerCols.map((c) => c.name)).not.toContain("is_revealed");

    // 0007 dropped the progressive_reveal setting.
    const settings = t.db
      .prepare("SELECT key FROM settings WHERE key = 'progressive_reveal'")
      .all() as Array<{ key: string }>;
    expect(settings).toEqual([]);
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
