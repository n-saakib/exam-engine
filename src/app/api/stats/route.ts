import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { runMigrations } from "@/server/boot";
import { getContainer } from "@/server/container";
import { HistoryFiltersSchema } from "@/domain/types";
import type { CompletedFilters } from "@/server/data/repos/sessionRepo";

// DB-backed route → Node.js runtime; force-dynamic so reads are never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/stats — aggregate stats over a filtered set of completed sessions (F7).
 * Accepts the same query params as GET /api/history. Returns the StatsResponse shape.
 *
 * The query is parsed + transformed by HistoryFiltersSchema; we cast the result
 * to CompletedFilters to bridge the zod output type to the repo's typed interface.
 */
export const GET = defineHandler({
  query: HistoryFiltersSchema,
  handler: async ({ query }) => {
    runMigrations();
    const { stats: statsService } = getContainer().services;

    // Cast: zod transform guarantees the correct shape at runtime.
    const allFilters = query as unknown as CompletedFilters;

    // Stats aggregate the full filtered set (no pagination).
    const filters: CompletedFilters = {
      domain: allFilters.domain,
      quesPath: allFilters.quesPath,
      difficulty: allFilters.difficulty,
      scoreMin: allFilters.scoreMin,
      scoreMax: allFilters.scoreMax,
      dateFrom: allFilters.dateFrom,
      dateTo: allFilters.dateTo,
      bookmarked: allFilters.bookmarked,
    };

    const stats = statsService.aggregate(filters);
    return json(stats);
  },
});
