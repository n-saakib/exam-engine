import "server-only";

import type { Database } from "better-sqlite3";

/** Filter parameters for listCompleted / countCompleted (mirrors HistoryFilters). */
export interface CompletedFilters {
  domain?: string;
  quesPath?: string;
  difficulty?: string;
  scoreMin?: number;
  scoreMax?: number;
  dateFrom?: string;
  dateTo?: string;
  bookmarked?: boolean;
  sort?: "date" | "score" | "difficulty";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** A completed-session row shaped for the history list. */
export interface CompletedRow {
  id: string;
  domain_label: string;
  difficulty: string;
  set_title: string;
  score_percent: number;
  time_elapsed_ms: number;
  completed_at: string;
  is_bookmarked: number;
  note: string | null;
}

/** A completed-session row shaped for stats aggregation. */
export interface StatsRow {
  id: string;
  score_percent: number;
  completed_at: string;
  difficulty: string;
}

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
  gave_up_count: number | null;
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
  gaveUpCount?: number;
  isBookmarked?: boolean;
  note?: string | null;
  completedAt?: string | null;
}

/** Map `sort` filter value to the actual SQL column. */
function sortToColumn(sort: string): string {
  switch (sort) {
    case "score":
      return "score_percent";
    case "difficulty":
      return "difficulty";
    case "date":
    default:
      return "completed_at";
  }
}

/** Map `order` filter value to the actual SQL keyword. */
function orderToKeyword(order: string): "ASC" | "DESC" {
  return order === "asc" ? "ASC" : "DESC";
}

/**
 * Escape SQL LIKE wildcards (`%`, `_`) in a user-supplied substring so it is
 * matched literally, then wrap it in `%…%` for the `LIKE` pattern. The `\` is
 * the standard LIKE escape; we pair it with `LIKE ? ESCAPE '\'`.
 */
function escapeLike(input: string): string {
  // Escape backslash FIRST, then the wildcards, so a literal `\` in the input
  // doesn't get unescaped by a later wildcard substitution.
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Build the WHERE clause and positional params array for completed-session queries.
 * Always includes `status = 'completed'` and `completed_at IS NOT NULL`.
 */
function buildCompletedWhere(filters: CompletedFilters): {
  whereParts: string[];
  params: (string | number)[];
} {
  const whereParts: string[] = ["status = 'completed'", "completed_at IS NOT NULL"];
  const params: (string | number)[] = [];

  if (filters.domain) {
    whereParts.push("domain_label LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(filters.domain)}%`);
  }
  if (filters.quesPath) {
    whereParts.push("ques_path = ?");
    params.push(filters.quesPath);
  }
  if (filters.difficulty) {
    whereParts.push("difficulty = ?");
    params.push(filters.difficulty);
  }
  if (filters.scoreMin !== undefined) {
    whereParts.push("score_percent >= ?");
    params.push(filters.scoreMin);
  }
  if (filters.scoreMax !== undefined) {
    whereParts.push("score_percent <= ?");
    params.push(filters.scoreMax);
  }
  if (filters.dateFrom) {
    whereParts.push("completed_at >= ?");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    // dateTo is inclusive — add one day so "2026-06-11" includes that whole day.
    whereParts.push("completed_at < ?");
    const d = new Date(filters.dateTo);
    d.setUTCDate(d.getUTCDate() + 1);
    params.push(d.toISOString().slice(0, 10));
  }
  if (filters.bookmarked === true) {
    whereParts.push("is_bookmarked = 1");
  }

  return { whereParts, params };
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
    gaveUpCount: "gave_up_count",
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

    /**
     * Delete ALL sessions (and their answers via CASCADE). Used by full/factory
     * reset. Returns the number of sessions deleted.
     */
    deleteAll(): number {
      return db.prepare("DELETE FROM exam_sessions").run().changes;
    },

    /**
     * Fetch all completed sessions for export. Returns the full session row
     * including the question snapshot and answers for detailed JSON export.
     */
    listAllCompleted(): SessionRow[] {
      return db
        .prepare(
          "SELECT * FROM exam_sessions WHERE status = 'completed' ORDER BY completed_at ASC",
        )
        .all() as SessionRow[];
    },

    /** Expose the raw connection for transactional composition in the engine. */
    db,

    /**
     * List completed sessions for the history endpoint. Applies all filters,
     * sorting, and pagination. All SQL for this query lives here.
     */
    listCompleted(filters: CompletedFilters): CompletedRow[] {
      const { whereParts, params } = buildCompletedWhere(filters);
      const sortColumn = sortToColumn(filters.sort ?? "date");
      const order = orderToKeyword(filters.order ?? "desc");
      const limit = filters.limit ?? 50;
      const offset = filters.offset ?? 0;

      const where = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
      const sql = `
        SELECT
          id, domain_label, difficulty, set_title,
          score_percent, time_elapsed_ms, completed_at,
          is_bookmarked, note
        FROM exam_sessions
        ${where}
        ORDER BY ${sortColumn} ${order}, completed_at DESC
        LIMIT ? OFFSET ?
      `;
      return db.prepare(sql).all(...params, limit, offset) as CompletedRow[];
    },

    /**
     * Count completed sessions matching the given filters (for pagination total).
     * Uses the same WHERE as listCompleted.
     */
    countCompleted(filters: CompletedFilters): number {
      const { whereParts, params } = buildCompletedWhere(filters);
      const where = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
      const sql = `SELECT COUNT(*) AS total FROM exam_sessions ${where}`;
      const row = db.prepare(sql).get(...params) as { total: number };
      return row.total;
    },

    /**
     * Fetch all completed sessions (ids, scores, dates, difficulty) for stats
     * aggregation. Applies the same filters but no pagination.
     */
    listCompletedForStats(filters: CompletedFilters): StatsRow[] {
      const { whereParts, params } = buildCompletedWhere(filters);
      const where = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
      const sql = `
        SELECT id, score_percent, completed_at, difficulty
        FROM exam_sessions
        ${where}
        ORDER BY completed_at ASC
      `;
      return db.prepare(sql).all(...params) as StatsRow[];
    },
  };
}

export type SessionRepo = ReturnType<typeof createSessionRepo>;
