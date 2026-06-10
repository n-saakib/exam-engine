import "server-only";

import type { Database } from "better-sqlite3";

/** A row in `session_answers` exactly as stored. */
export interface AnswerRow {
  id: number;
  session_id: string;
  question_id: number;
  selected_options: string; // JSON array
  is_flagged: number;
  is_revealed: number;
  is_correct: number | null;
  confidence: string | null;
  time_spent_ms: number;
  answered_at: string | null;
}

/** Fields an autosave PATCH may set on a single answer. Only set keys apply. */
export interface AnswerPatch {
  /** Selected option keys; replaces the stored array. */
  selected?: string[];
  flagged?: boolean;
  /** Monotonic: callers must not pass `false` to un-reveal (engine enforces). */
  revealed?: boolean;
  confidence?: "easy" | "medium" | "hard" | null;
  timeSpentMs?: number;
}

/**
 * All SQL on `session_answers`. The engine seeds one blank row per question at
 * create-time (inside the create transaction), then autosave upserts individual
 * answers; submit writes `is_correct` per row.
 */
export function createAnswerRepo(db: Database) {
  const insertBlank = db.prepare<[string, number]>(`
    INSERT INTO session_answers (session_id, question_id)
    VALUES (?, ?)
    ON CONFLICT (session_id, question_id) DO NOTHING
  `);

  const selectBySession = db.prepare<[string]>(
    "SELECT * FROM session_answers WHERE session_id = ? ORDER BY question_id ASC",
  );

  const selectOne = db.prepare<[string, number]>(
    "SELECT * FROM session_answers WHERE session_id = ? AND question_id = ?",
  );

  const setCorrect = db.prepare<[number, string, number]>(
    "UPDATE session_answers SET is_correct = ? WHERE session_id = ? AND question_id = ?",
  );

  return {
    /**
     * Seed blank answer rows for every question id. Wrapped in a transaction so
     * the whole seed is atomic. Idempotent (ON CONFLICT DO NOTHING).
     */
    insertBlanks(sessionId: string, questionIds: number[]): void {
      const run = db.transaction((ids: number[]) => {
        for (const qid of ids) insertBlank.run(sessionId, qid);
      });
      run(questionIds);
    },

    /** All answer rows for a session, ordered by question id. */
    getBySession(sessionId: string): AnswerRow[] {
      return selectBySession.all(sessionId) as AnswerRow[];
    },

    /** A single answer row, or undefined. */
    getOne(sessionId: string, questionId: number): AnswerRow | undefined {
      return selectOne.get(sessionId, questionId) as AnswerRow | undefined;
    },

    /**
     * Upsert a single answer (autosave). Builds the SET clause from provided keys
     * only; stamps `answered_at` whenever a selection is written. Creates the row
     * first if it somehow doesn't exist (defensive), then patches.
     */
    upsert(sessionId: string, questionId: number, patch: AnswerPatch): void {
      insertBlank.run(sessionId, questionId);

      const sets: string[] = [];
      const values: Record<string, unknown> = { sessionId, questionId };

      if (patch.selected !== undefined) {
        sets.push("selected_options = @selected");
        values.selected = JSON.stringify(patch.selected);
        sets.push("answered_at = @answeredAt");
        values.answeredAt = new Date().toISOString();
      }
      if (patch.flagged !== undefined) {
        sets.push("is_flagged = @flagged");
        values.flagged = patch.flagged ? 1 : 0;
      }
      if (patch.revealed !== undefined) {
        sets.push("is_revealed = @revealed");
        values.revealed = patch.revealed ? 1 : 0;
      }
      if (patch.confidence !== undefined) {
        sets.push("confidence = @confidence");
        values.confidence = patch.confidence;
      }
      if (patch.timeSpentMs !== undefined) {
        sets.push("time_spent_ms = @timeSpentMs");
        values.timeSpentMs = patch.timeSpentMs;
      }

      if (sets.length === 0) return; // nothing to write

      db.prepare(
        `UPDATE session_answers SET ${sets.join(", ")}
         WHERE session_id = @sessionId AND question_id = @questionId`,
      ).run(values);
    },

    /** Write the graded correctness flag for a single answer (submit). */
    setCorrect(sessionId: string, questionId: number, isCorrect: boolean): void {
      setCorrect.run(isCorrect ? 1 : 0, sessionId, questionId);
    },
  };
}

export type AnswerRepo = ReturnType<typeof createAnswerRepo>;
