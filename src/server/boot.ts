import "server-only";

import { getDb } from "@/server/data/db";
import { migrate, getSchemaVersion } from "@/server/data/migrate";

/**
 * Boot routines, run once on server start by `instrumentation.register()`.
 * Every function here is idempotent and safe to call again (e.g. from a lazy
 * guard or a test), so order/duplication never corrupts state.
 */

/**
 * Run `PRAGMA integrity_check` and throw a friendly fatal error if the database
 * file is corrupt. SQLite returns the single row `ok` on a healthy database.
 */
export function integrityCheck(): void {
  const db = getDb();
  const rows = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
  const ok = rows.length === 1 && rows[0]?.integrity_check === "ok";
  if (!ok) {
    const detail = rows.map((r) => r.integrity_check).join("; ");
    throw new Error(
      `CertPrep: SQLite integrity check FAILED — the database file appears corrupt.\n` +
        `Details: ${detail}\n` +
        `Recovery: stop the app, back up and remove the database file ` +
        `(data/certprep.db plus its -wal/-shm sidecars), then restart to rebuild it. ` +
        `Your question JSON files and history export are unaffected.`,
    );
  }
}

/**
 * Apply all pending migrations. Forward-only, transactional, idempotent.
 * Returns the resulting schema version.
 */
export function runMigrations(): number {
  const db = getDb();
  const result = migrate(db);
  return result.currentVersion;
}

/**
 * Scan the Exams root and refresh the catalogue.
 *
 * STUB until F3: deliberately a no-op so boot is safe before the catalogue
 * service exists. F3 replaces this body with a real filesystem scan.
 */
export function bootScan(): void {
  // no-op (F3 fills this in)
}

/** Convenience: the full boot sequence in order (used by instrumentation). */
export function boot(): void {
  integrityCheck();
  runMigrations();
  bootScan();
}

/** The schema version currently applied to the live database. */
export function schemaVersion(): number {
  return getSchemaVersion(getDb());
}
