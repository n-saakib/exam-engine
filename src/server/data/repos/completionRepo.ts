import "server-only";

import type { Database } from "better-sqlite3";

/** A row in `set_completion`. */
export interface CompletionRow {
  id: number;
  ques_path: string;
  set_id: string;
  completed_session_id: string | null;
  completed_at: string;
}

/**
 * All SQL on `set_completion`. No orchestration logic — just insert/query/delete.
 */
export function createCompletionRepo(db: Database) {
  const insert = db.prepare<[string, string, string | null, string]>(`
    INSERT INTO set_completion (ques_path, set_id, completed_session_id, completed_at)
    VALUES (?, ?, ?, ?)
  `);

  const selectSetIdsByPath = db.prepare<[string]>(
    "SELECT set_id FROM set_completion WHERE ques_path = ?",
  );

  const selectByPath = db.prepare<[string]>(
    "SELECT * FROM set_completion WHERE ques_path = ? ORDER BY completed_at DESC",
  );

  const deleteByPath = db.prepare<[string]>(
    "DELETE FROM set_completion WHERE ques_path = ?",
  );

  const deleteAll = db.prepare("DELETE FROM set_completion");

  const selectLatestByPathAndSet = db.prepare<[string, string]>(`
    SELECT completed_at FROM set_completion
    WHERE ques_path = ? AND set_id = ?
    ORDER BY completed_at DESC
    LIMIT 1
  `);

  return {
    /**
     * Record that a set was completed for a given path. `sessionId` may be null
     * for back-compat (e.g. seeded test data); in practice F4 always provides it.
     */
    record(quesPath: string, setId: string, sessionId: string | null): void {
      insert.run(quesPath, setId, sessionId, new Date().toISOString());
    },

    /**
     * Return the distinct set_ids that have been completed for a given path.
     * Used by repeat-avoidance logic.
     */
    listCompletedSetIds(quesPath: string): string[] {
      const rows = selectSetIdsByPath.all(quesPath) as Array<{ set_id: string }>;
      // De-duplicate: multiple sessions completing the same set should count once.
      return [...new Set(rows.map((r) => r.set_id))];
    },

    /** Return full completion rows for a path (most recent first). */
    listByPath(quesPath: string): CompletionRow[] {
      return selectByPath.all(quesPath) as CompletionRow[];
    },

    /**
     * Return the most recent `completed_at` for a specific (path, set_id) pair,
     * or null if never completed.
     */
    latestCompletedAt(quesPath: string, setId: string): string | null {
      const row = selectLatestByPathAndSet.get(quesPath, setId) as
        | { completed_at: string }
        | undefined;
      return row?.completed_at ?? null;
    },

    /**
     * Delete all completion records for a given path. Used by "Reset progress
     * for this path" (history/sessions are untouched).
     */
    deleteByPath(quesPath: string): number {
      const result = deleteByPath.run(quesPath);
      return result.changes;
    },

    /** Delete ALL completion records across all paths. */
    deleteAll(): number {
      const result = deleteAll.run();
      return result.changes;
    },
  };
}

export type CompletionRepo = ReturnType<typeof createCompletionRepo>;
