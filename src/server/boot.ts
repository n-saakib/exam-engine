import "server-only";

import { getDb } from "@/server/data/db";
import { migrate, getSchemaVersion } from "@/server/data/migrate";
import { getContainer } from "@/server/container";

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
 * Scan the Exams root and refresh the catalogue. Runs after migrations so the
 * `set_catalog` table exists. Idempotent (upserts) and resilient — one bad file
 * never aborts the scan. Called by `instrumentation.register()` on server start.
 */
export function bootScan(): void {
  try {
    const container = getContainer();
    // Fire-and-forget: scan returns a promise but boot doesn't await it.
    // The catalogue is populated asynchronously on first request if needed.
    container.services.setCatalog.scan().catch((err: unknown) => {
      console.error("[bootScan] catalogue scan failed:", err);
    });
  } catch (err) {
    // Never crash the server on a scan failure — diagnostics will surface it.
    console.error("[bootScan] failed to initiate catalogue scan:", err);
  }
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
