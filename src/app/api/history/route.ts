import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { runMigrations } from "@/server/boot";
import { getContainer } from "@/server/container";
import { HistoryFiltersSchema } from "@/domain/types";
import type { HistoryList, HistoryRow } from "@/domain/types";
import type { CompletedFilters } from "@/server/data/repos/sessionRepo";

// DB-backed route → Node.js runtime; force-dynamic so reads are never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/history — filtered, sorted, paginated list of completed sessions (F7).
 *
 * Query params: domain, quesPath, difficulty, scoreMin, scoreMax, dateFrom, dateTo,
 *   bookmarked, sort (date|score|difficulty), order (asc|desc), limit, offset.
 * Returns { items: HistoryRow[], total }.
 *
 * The query is parsed + transformed by HistoryFiltersSchema; we cast the result
 * to CompletedFilters to bridge the zod output type to the repo's typed interface.
 */
export const GET = defineHandler({
  query: HistoryFiltersSchema,
  handler: async ({ query }) => {
    runMigrations();
    const { session: sessionRepo } = getContainer().repos;

    // Cast: zod transform guarantees the correct shape at runtime; the cast is
    // safe because HistoryFiltersSchema.transform() produces exactly CompletedFilters.
    const filters = query as unknown as CompletedFilters;

    const rows = sessionRepo.listCompleted(filters);
    const total = sessionRepo.countCompleted(filters);

    const items: HistoryRow[] = rows.map((r) => ({
      id: r.id,
      domainLabel: r.domain_label,
      difficulty: r.difficulty as HistoryRow["difficulty"],
      setTitle: r.set_title,
      scorePercent: r.score_percent,
      timeTakenMs: r.time_elapsed_ms,
      completedAt: r.completed_at,
      isBookmarked: r.is_bookmarked === 1,
      hasNote: r.note !== null && r.note.length > 0,
    }));

    const body: HistoryList = { items, total };
    return json(body);
  },
});
