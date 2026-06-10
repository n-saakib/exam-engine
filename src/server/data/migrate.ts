import "server-only";

import type { Database } from "better-sqlite3";

import { MIGRATIONS, type Migration } from "@/server/data/migrations";

/**
 * Forward-only, transactional, idempotent SQL migration runner.
 *
 * - Migrations come from the embedded registry (`migrations/index.ts`) — no
 *   filesystem reads at runtime, so the bundle is self-contained and the build
 *   tracer stays quiet. The `.sql` files remain the authored source of truth and
 *   a drift test keeps them in lockstep with the embedded SQL.
 * - A `schema_migrations(version, applied_at)` table tracks what has run.
 * - Each unapplied migration runs inside its OWN transaction; the version row is
 *   written ONLY on commit, so a failed migration leaves no partial version
 *   marker. Re-running is a no-op once everything is applied.
 */

function ensureMigrationsTable(db: Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    INTEGER PRIMARY KEY,
       applied_at TEXT NOT NULL
     );`,
  );
}

function appliedVersions(db: Database): Set<number> {
  const rows = db
    .prepare("SELECT version FROM schema_migrations")
    .all() as Array<{ version: number }>;
  return new Set(rows.map((r) => r.version));
}

export interface MigrateResult {
  /** Versions applied during THIS call (empty when already up to date). */
  readonly applied: number[];
  /** The highest applied version after this call (the schema version). */
  readonly currentVersion: number;
}

/**
 * Apply all unapplied migrations to `db`. Idempotent: a second call with nothing
 * new returns `{ applied: [] }` and leaves exactly one row per applied version.
 *
 * @param migrations Override the migration set (tests); defaults to the registry.
 */
export function migrate(
  db: Database,
  migrations: readonly Migration[] = MIGRATIONS,
): MigrateResult {
  ensureMigrationsTable(db);

  const done = appliedVersions(db);
  const pending = [...migrations]
    .sort((a, b) => a.version - b.version)
    .filter((m) => !done.has(m.version));

  const applied: number[] = [];
  const insertVersion = db.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
  );

  for (const m of pending) {
    // One transaction per migration: the DDL and the version row commit together.
    const runOne = db.transaction(() => {
      db.exec(m.sql);
      insertVersion.run(m.version, new Date().toISOString());
    });
    runOne();
    applied.push(m.version);
  }

  const currentVersion = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations")
    .get() as { v: number };

  return { applied, currentVersion: currentVersion.v };
}

/** Read the current schema version (0 if no migrations have been applied). */
export function getSchemaVersion(db: Database): number {
  ensureMigrationsTable(db);
  const row = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations")
    .get() as { v: number };
  return row.v;
}
