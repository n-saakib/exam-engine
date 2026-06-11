"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { HistoryList, StatsResponse } from "@/domain/types";

/**
 * Client-side filter object for history queries.
 * This is the camelCase representation of what the server query params accept.
 * IMPORTANT: callers must keep this object stable (same reference between renders)
 * using useReducer or useState — see 04 §7. A new object reference on every render
 * would bypass React Query's cache and refetch on every render.
 */
export interface HistoryFilterState {
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

/** Serialise the filter state to query params for the API client. */
function toQueryParams(
  filters: HistoryFilterState,
): Record<string, string | number | boolean | undefined | null> {
  return {
    domain: filters.domain,
    quesPath: filters.quesPath,
    difficulty: filters.difficulty,
    scoreMin: filters.scoreMin,
    scoreMax: filters.scoreMax,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    bookmarked: filters.bookmarked,
    sort: filters.sort,
    order: filters.order,
    limit: filters.limit,
    offset: filters.offset,
  };
}

/**
 * useHistory — fetches the paginated, filtered history list.
 * The `filters` object MUST have stable identity (use useReducer/useState in the
 * parent, not an inline literal) so React Query's key comparison works correctly.
 */
export function useHistory(filters: HistoryFilterState) {
  return useQuery({
    queryKey: queryKeys.history(filters as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<HistoryList>("/history", { query: toQueryParams(filters) }),
    staleTime: 30_000,
  });
}

/**
 * useStats — fetches aggregate stats for the current filter.
 * Same filter-stability requirement as useHistory.
 */
export function useStats(filters: HistoryFilterState) {
  return useQuery({
    queryKey: queryKeys.stats(filters as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<StatsResponse>("/stats", { query: toQueryParams(filters) }),
    staleTime: 30_000,
  });
}
