import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "@/server/data/migrate";
import type { Migration } from "@/server/data/migrations";

/**
 * Atomicity tests for the migration runner.
 *
 * The migration runner wraps each migration in a `db.transaction(...)` so the
 * DDL and the `schema_migrations` row commit together. A failure inside the
 * transaction must leave the schema unchanged and no `schema_migrations` row
 * for the failed version.
 *
 * NOTE: `migrate()` accepts an optional `migrations` argument (its second
 * parameter). The contract pinned by this file:
 *
 *   1. A multi-statement migration where statement 2 throws leaves NO version
 *      row inserted and the schema is unchanged.
 *   2. After a partial-failure scenario, `schema_migrations` is consistent
 *      (versions 1 and 3 present, version 2 absent).
 *   3. Calling `migrate(db, migrations)` twice in a row is a no-op on the
 *      second call (no version rows duplicated).
 *
 * If the function signature is ever changed in a way that does not support
 * injecting migrations, this file degrades into a characterization test
 * describing the current behaviour and is left in place until the C5 fix
 * lands.
 */

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  return db;
}

describe("migrate() — atomicity", () => {
  it("a multi-statement migration where statement 2 throws leaves no version row and no schema change", () => {
    const db = freshDb();
    const migrations: Migration[] = [
      {
        version: 1,
        name: "boom_midway",
        // Two statements: the first creates a table, the second references a
        // non-existent column to force a SQLite error. SQLite's `db.exec`
        // aborts on the first error inside a transaction, so the entire DDL
        // string (and the version row written after it) must roll back
        // atomically.
        sql: `CREATE TABLE beta (id INTEGER PRIMARY KEY);\nSELECT this_does_not_exist FROM beta;`,
      },
    ];

    expect(() => migrate(db, migrations)).toThrow();

    // No version row for the failed migration.
    const versions = db
      .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")
      .all() as Array<{ version: number }>;
    expect(versions).toEqual([]);

    // No `beta` table (the DDL of the failing migration must NOT have
    // committed — the runner wraps the DDL + the version row in a single
    // transaction; a throw rolls the whole thing back).
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('alpha','beta','schema_migrations') ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    // `schema_migrations` is allowed to exist (the runner creates it
    // outside the per-migration transaction); but `beta` must not.
    expect(tables.map((r) => r.name)).toEqual(["schema_migrations"]);
  });

  it("a partial-failure scenario: schema_migrations is consistent (v1 and v3 present, v2 absent)", () => {
    const db = freshDb();
    const migrations: Migration[] = [
      {
        version: 1,
        name: "init",
        sql: `CREATE TABLE alpha (id INTEGER PRIMARY KEY);`,
      },
      {
        version: 2,
        name: "boom",
        sql: `CREATE TABLE beta (id INTEGER PRIMARY KEY);\nSELECT no_such_column FROM beta;`,
      },
      {
        version: 3,
        name: "later",
        sql: `CREATE TABLE gamma (id INTEGER PRIMARY KEY);`,
      },
    ];

    expect(() => migrate(db, migrations)).toThrow();

    // Version 1 must be present (it ran successfully), version 2 must NOT be
    // present (it failed), and version 3 must NOT be present (the runner
    // aborts on the first failure and never reaches 3).
    const versions = db
      .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")
      .all() as Array<{ version: number }>;
    expect(versions.map((v) => v.version)).toEqual([1]);

    // The DDL of v1 must be applied; v2 and v3 must not.
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('alpha','beta','gamma') ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((r) => r.name)).toEqual(["alpha"]);
  });

  it("calling migrate() twice in a row is a no-op on the second call (no version rows duplicated)", () => {
    const db = freshDb();
    const migrations: Migration[] = [
      {
        version: 1,
        name: "v1",
        sql: `CREATE TABLE t1 (id INTEGER PRIMARY KEY);`,
      },
      {
        version: 2,
        name: "v2",
        sql: `CREATE TABLE t2 (id INTEGER PRIMARY KEY);`,
      },
    ];

    const r1 = migrate(db, migrations);
    expect(r1.applied).toEqual([1, 2]);
    expect(r1.currentVersion).toBe(2);

    const r2 = migrate(db, migrations);
    expect(r2.applied).toEqual([]);
    expect(r2.currentVersion).toBe(2);

    // Exactly one row per version, never two.
    const counts = db
      .prepare("SELECT version, COUNT(*) AS c FROM schema_migrations GROUP BY version ORDER BY version")
      .all() as Array<{ version: number; c: number }>;
    expect(counts).toEqual([
      { version: 1, c: 1 },
      { version: 2, c: 1 },
    ]);
  });
});
