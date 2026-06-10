import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { config } from "@/server/config";

/**
 * One process-wide SQLite connection. Stored on `globalThis` so Next's dev HMR
 * (which re-evaluates modules on every edit) reuses the same handle instead of
 * leaking connections / re-opening the file. See `09-nextjs-refinement.md` §5.
 */
const globalForDb = globalThis as unknown as {
  __certprepDb?: Database.Database;
};

/**
 * Apply the per-connection pragmas. CRITICAL: `foreign_keys` is connection-scoped
 * in better-sqlite3 — if it is ever missed, every `ON DELETE CASCADE` silently
 * stops working (only ever observed on discard/delete). Always call this on a
 * freshly opened connection (production singleton AND test DBs). See §7.2.
 */
export function applyConnectionPragmas(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
}

function openDatabase(dbPath: string): Database.Database {
  // Ensure the parent directory (e.g. ./data) exists before opening.
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  applyConnectionPragmas(db);
  return db;
}

/**
 * Get the singleton database connection, opening (and pragma-configuring) it on
 * first use. A lazy guard like this means migrations are guaranteed to have run
 * before the first real query even if `instrumentation.register()` was bypassed
 * (boot is idempotent) — important for tests and edge cases.
 */
export function getDb(): Database.Database {
  if (!globalForDb.__certprepDb) {
    globalForDb.__certprepDb = openDatabase(config.dbPath);
  }
  return globalForDb.__certprepDb;
}

/**
 * Close and forget the singleton connection. Primarily for test teardown; in the
 * long-running server we keep the handle open for the process lifetime.
 */
export function closeDb(): void {
  if (globalForDb.__certprepDb) {
    globalForDb.__certprepDb.close();
    globalForDb.__certprepDb = undefined;
  }
}
