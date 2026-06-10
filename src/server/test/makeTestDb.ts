import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { applyConnectionPragmas } from "@/server/data/db";
import { migrate } from "@/server/data/migrate";

/**
 * Build an isolated, migrated SQLite database for a test. Uses a temp FILE (not
 * `:memory:`) so WAL behaves like production and a single connection is shared.
 * CRITICAL: pragmas (incl. `foreign_keys = ON`) are applied here exactly as in
 * `getDb()`, so the FK-cascade test actually exercises the per-connection pragma
 * (09 §7.2).
 *
 * Call `cleanup()` in `afterEach`/`afterAll` to close the handle and delete the
 * temp files.
 */
export interface TestDb {
  /** The open, migrated connection. */
  db: Database.Database;
  /** Get the connection (parity with the production `getDb` shape). */
  getDb: () => Database.Database;
  /** Absolute path to the temp database file. */
  dbPath: string;
  /** Close the connection and remove the temp files. */
  cleanup: () => void;
}

export function makeTestDb(): TestDb {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-test-"));
  const dbPath = path.join(dir, "test.db");

  const db = new Database(dbPath);
  applyConnectionPragmas(db);
  migrate(db);

  const cleanup = () => {
    try {
      db.close();
    } catch {
      // already closed
    }
    fs.rmSync(dir, { recursive: true, force: true });
  };

  return { db, getDb: () => db, dbPath, cleanup };
}
