import { z } from "zod";

import { defineHandler } from "@/server/http/defineHandler";
import { json, created } from "@/server/http/respond";
import { getDb } from "@/server/data/db";
import { runMigrations } from "@/server/boot";
import { getContainer } from "@/server/container";
import { CreateSessionBodySchema } from "@/domain/types";
import type { SessionList, SessionListRow } from "@/domain/types";

// DB-backed route → Node.js runtime (never edge); dynamic so reads aren't cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Query-string schema for GET /api/sessions */
const SessionsQuerySchema = z.object({
  status: z.enum(["in_progress", "completed", "discarded"]).optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 50))
    .pipe(z.number().int().min(1).max(200).default(50)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 0))
    .pipe(z.number().int().min(0).default(0)),
});

/**
 * GET /api/sessions — list sessions, optionally filtered by status.
 * Returns { items: SessionListRow[], total }.
 * `percentAnswered` is computed from session_answers rows (09 §8).
 */
export const GET = defineHandler({
  query: SessionsQuerySchema,
  handler: async ({ query }) => {
    runMigrations();
    const db = getDb();

    const { status, limit, offset } = query;

    // Build the WHERE clause.
    const whereParts: string[] = [];
    const params: (string | number)[] = [];
    if (status) {
      whereParts.push("es.status = ?");
      params.push(status);
    }
    const where = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    // Count total (for pagination metadata).
    const countSql = `SELECT COUNT(*) AS total FROM exam_sessions es ${where}`;
    const countRow = db.prepare(countSql).get(...params) as { total: number };
    const total = countRow.total;

    // Fetch page.
    // percentAnswered = answered_count / total_questions * 100
    // answered_count = number of session_answers rows for this session that have
    //   at least one option selected (selected_options != '[]').
    const itemsSql = `
      SELECT
        es.id,
        es.status,
        es.domain_label   AS domainLabel,
        es.set_title      AS setTitle,
        es.difficulty,
        es.total_questions AS totalQuestions,
        es.time_elapsed_ms AS timeElapsedMs,
        es.updated_at      AS pausedAt,
        es.created_at      AS createdAt,
        COALESCE(ans.answered_count, 0) AS answeredCount
      FROM exam_sessions es
      LEFT JOIN (
        SELECT session_id, COUNT(*) AS answered_count
        FROM session_answers
        WHERE selected_options != '[]'
        GROUP BY session_id
      ) ans ON ans.session_id = es.id
      ${where}
      ORDER BY es.updated_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(itemsSql).all(...params, limit, offset) as Array<{
      id: string;
      status: string;
      domainLabel: string;
      setTitle: string;
      difficulty: string;
      totalQuestions: number;
      timeElapsedMs: number;
      pausedAt: string;
      createdAt: string;
      answeredCount: number;
    }>;

    const items: SessionListRow[] = rows.map((r) => ({
      id: r.id,
      status: r.status as SessionListRow["status"],
      domainLabel: r.domainLabel,
      setTitle: r.setTitle,
      difficulty: r.difficulty as SessionListRow["difficulty"],
      percentAnswered:
        r.totalQuestions > 0
          ? Math.round((r.answeredCount / r.totalQuestions) * 100)
          : 0,
      answeredCount: r.answeredCount,
      totalQuestions: r.totalQuestions,
      timeElapsedMs: r.timeElapsedMs,
      pausedAt: r.pausedAt,
      createdAt: r.createdAt,
    }));

    const body: SessionList = { items, total };
    return json(body);
  },
});

/**
 * POST /api/sessions — start a new exam (F4-T7). Creates a session (loads/picks a
 * set, shuffles, snapshots, persists blank answers) and returns the answers-hidden
 * live DTO (201).
 *
 * `mode` is restricted to `"full"` here (CreateSessionBodySchema); `retake_*`
 * sessions are created via POST /api/sessions/:id/retake (F5) — a `retake_*`
 * value is rejected as 400 VALIDATION_ERROR by the schema.
 *
 * Errors mapped by the engine/services: 404 PATH_NOT_FOUND / SET_NOT_FOUND,
 * 409 SETS_EXHAUSTED, 422 UNSUPPORTED_QUESTION_TYPE.
 */
export const POST = defineHandler({
  body: CreateSessionBodySchema,
  handler: async ({ body }) => {
    runMigrations();
    const session = getContainer().services.examEngine.createSession(body);
    return created(session);
  },
});
