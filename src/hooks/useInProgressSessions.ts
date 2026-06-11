"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { SessionList, SessionListRow } from "@/domain/types";

/**
 * Fetches all in-progress sessions, sorted newest-first by `pausedAt` on the
 * client (the API returns by `updated_at` desc, which equals `pausedAt`).
 *
 * Query key: `['sessions', 'in_progress']` — invalidated on discard (F6-T7)
 * and on session creation / submission (F4) so the list and badge stay in sync.
 */
export function useInProgressSessions(): {
  items: SessionListRow[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
} {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.sessions("in_progress"),
    queryFn: () =>
      apiClient.get<SessionList>("/sessions", {
        query: { status: "in_progress" },
      }),
    staleTime: 30_000,
  });

  // Sort by pausedAt descending (newest activity first) — server already returns
  // ordered by updated_at DESC, but we sort client-side for resilience.
  const items = [...(data?.items ?? [])].sort(
    (a, b) => new Date(b.pausedAt).getTime() - new Date(a.pausedAt).getTime(),
  );

  return {
    items,
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
  };
}
