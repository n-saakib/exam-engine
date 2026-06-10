import "server-only";

import type { Database } from "better-sqlite3";

/** A row in `exam_sessions` exactly as stored (snapshot stays JSON TEXT). */
export interface SessionRow {
  id: string;
  status: "in_progress" | "completed" | "discarded";
  ques_path: string;
  domain_label: string;
  set_id: string;
  set_title: string;
  difficulty: string;
  question_snapshot: string; // JSON
  total_questions: number;
  timer_enabled: number; // 0 | 1
  timer_limit_ms: number | null;
  time_elapsed_ms: number;
  current_index: number;
  shuffle_seed: string | null;
  mode: "full" | "retake_all" | "retake_incorrect";
  origin_session_id: string | null;
  score_percent: number | null;
  correct_count: number | null;
  incorrect_count: number | null;
  revealed_count: number | null;
  unanswered_count: number | null;
  is_bookmarked: number;
  note: string | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
}

/** Everything needed to insert a fresh in-progress session. */
export interface InsertSessionParams {
  id: string;
  quesPath: string;
  domainLabel: string;
  setId: string;
  setTitle: string;
  difficulty: string;
  questionSnapshot: string; // already JSON-stringified
  totalQuestions: number;
  timerEnabled: boolean;
  timerLimitMs: number | null;
  shuffleSeed: string | null;
  mode: "full" | "retake_all" | "retake_incorrect";
  originSessionId: string | null;
  createdAt: string;
}

/** Patchable session-level fields (autosave + lifecycle). Only set keys apply. */
export interface SessionPatch {
  currentIndex?: number;
  timeElapsedMs?: number;
  status?: "in_progress" | "completed" | "discarded";
  scorePercent?: number;
  correctCount?: number;
  incorrectCount?: number;
  revealedCount?: number;
  unansweredCount?: number;
  isBookmarked?: boolean;
  note?: string | null;
  completedAt?: string | null;
}

/**
 * All SQL on `exam_sessions`. No orchestration — insert/get/list/patch only.
 * Multi-statement work (e.g. seeding blank answers alongside the insert) is the
 * ExamEngine's concern and is wrapped in a `db.transaction` there.
 */
export function createSessionRepo(db: Database) {
  const insert = db.prepare(`
    INSERT INTO exam_sessions
      (id, status, ques_path, domain_label, set_id, set_title, difficulty,
       question_snapshot, total_questions, timer_enabled, timer_limit_ms,
       time_elapsed_ms, current_index, shuffle_seed, mode, origin_session_id,
       is_bookmarked, created_at, started_at, updated_at)
    VALUES
      (@id, 'in_progress', @ques_path, @domain_label, @set_id, @set_title, @difficulty,
       @question_snapshot, @total_questions, @timer_enabled, @timer_limit_ms,
       0, 0, @shuffle_seed, @mode, @origin_session_id,
       0, @created_at, @created_at, @created_at)
  `);

  const selectById = db.prepare<[string]>(
    "SELECT * FROM exam_sessions WHERE id = ?",
  );

  const deleteById = db.prepare<[string]>(
    "DELETE FROM exam_sessions WHERE id = ?",
  );

  // Column map for the dynamic patch builder (camelCase patch key → DB column).
  const PATCH_COLUMNS: Record<keyof SessionPatch, string> = {
    currentIndex: "current_index",
    timeElapsedMs: "time_elapsed_ms",
    status: "status",
    scorePercent: "score_percent",
    correctCount: "correct_count",
    incorrectCount: "incorrect_count",
    revealedCount: "revealed_count",
    unansweredCount: "unanswered_count",
    isBookmarked: "is_bookmarked",
    note: "note",
    completedAt: "completed_at",
  };

  return {
    /** Insert a fresh in-progress session. */
    insert(params: InsertSessionParams): void {
      insert.run({
        id: params.id,
        ques_path: params.quesPath,
        domain_label: params.domainLabel,
        set_id: params.setId,
        set_title: params.setTitle,
        difficulty: params.difficulty,
        question_snapshot: params.questionSnapshot,
        total_questions: params.totalQuestions,
        timer_enabled: params.timerEnabled ? 1 : 0,
        timer_limit_ms: params.timerLimitMs,
        shuffle_seed: params.shuffleSeed,
        mode: params.mode,
        origin_session_id: params.originSessionId,
        created_at: params.createdAt,
      });
    },

    /** Fetch a session by id, or undefined if not found. */
    getById(id: string): SessionRow | undefined {
      return selectById.get(id) as SessionRow | undefined;
    },

    /**
     * Apply a partial patch and bump `updated_at`. Builds the SET clause from the
     * provided keys only (a no-op patch still bumps `updated_at`, keeping the
     * session-list "pausedAt" fresh on an autosave). Booleans map to 0/1.
     */
    patch(id: string, patch: SessionPatch): void {
      const sets: string[] = [];
      const values: Record<string, unknown> = { id };

      for (const [key, column] of Object.entries(PATCH_COLUMNS) as Array<
        [keyof SessionPatch, string]
      >) {
        const value = patch[key];
        if (value === undefined) continue;
        sets.push(`${column} = @${key}`);
        values[key] = typeof value === "boolean" ? (value ? 1 : 0) : value;
      }

      values.updated_at = new Date().toISOString();
      const setClause = [...sets, "updated_at = @updated_at"].join(", ");

      db.prepare(`UPDATE exam_sessions SET ${setClause} WHERE id = @id`).run(
        values,
      );
    },

    /** Delete a session (answers cascade via ON DELETE CASCADE). */
    deleteById(id: string): number {
      return deleteById.run(id).changes;
    },

    /** Expose the raw connection for transactional composition in the engine. */
    db,
  };
}

export type SessionRepo = ReturnType<typeof createSessionRepo>;
