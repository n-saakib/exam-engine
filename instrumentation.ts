/**
 * Next.js instrumentation hook — runs once on server boot (enabled by default in
 * Next 15+/16; no config flag needed). Guarded to the Node.js runtime so it never
 * tries to load the native better-sqlite3 addon in the Edge runtime.
 *
 * Sequence: integrity_check → migrations → catalogue scan (all idempotent).
 * A lazy `getDb()` guard also ensures migrations have run before the first query,
 * so code paths that bypass `register()` (e.g. tests) stay safe.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { integrityCheck, runMigrations, bootScan } = await import("./src/server/boot");
    integrityCheck();
    runMigrations();
    bootScan();
  }
}
