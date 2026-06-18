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
 * - The full pending batch runs inside ONE transaction; either every migration
 *   AND its version marker commit, or none do. This is the standard SQLite
 *   pattern for DDL batches — better-sqlite3's `db.transaction()` exposes a
 *   `BEGIN ... COMMIT/ROLLBACK` wrapper. Re-running is a no-op once everything
 *   is applied.
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

  // Run the entire pending batch inside ONE transaction: a DDL failure in any
  // migration rolls back all earlier siblings and leaves no version marker, so
  // re-running is safe and `schema_migrations` is always consistent with the
  // DDL that actually executed.
  if (pending.length > 0) {
    const runBatch = db.transaction(() => {
      for (const m of pending) {
        // Idempotent backfills: a forward-only column backfill (e.g. 0004
        // adding a column that an older 0001 didn't declare) must be safe to
        // re-run against a DB that was created from the modern 0001 (which
        // already has the column). SQLite has no `ADD COLUMN IF NOT EXISTS`,
        // so we catch the "duplicate column name" error here and treat it as
        // "already applied" — the version marker is still written so the
        // migration won't run again.
        try {
          db.exec(m.sql);
        } catch (e) {
          if (isDuplicateColumnError(e)) {
            // Continue: the column was added by an earlier DDL statement
            // (typically the modern version of a sibling migration), so the
            // post-condition this migration was meant to achieve is already
            // satisfied.
          } else {
            throw e;
          }
        }
        insertVersion.run(m.version, new Date().toISOString());
      }
    });
    runBatch();
    for (const m of pending) applied.push(m.version);
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

/**
 * Best-effort detection of "duplicate column name" errors from
 * `ALTER TABLE … ADD COLUMN`. better-sqlite3 surfaces the SQLite error code
 * (e.g. `SQLITE_ERROR`) and message ("duplicate column name: …"). We don't
 * rely on a specific error class — the message check is stable across SQLite
 * versions and bundler chunk boundaries.
 */
function isDuplicateColumnError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const e = err as { message?: unknown; code?: unknown };
  if (typeof e.message !== "string") return false;
  return /duplicate column name/i.test(e.message);
}
