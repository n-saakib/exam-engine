"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { SessionList } from "@/domain/types";

/**
 * Returns the count of in-progress sessions, powering the Resume badge (F1-T7).
 * Polls /api/sessions?status=in_progress and reads `total` (which is lightweight
 * since the server counts without fetching full rows when limit=1).
 *
 * The query key `['inProgressCount']` is invalidated by F4/F6 mutations (start,
 * discard, submit) so the badge stays live.
 */
export function useInProgressCount(): number {
  const { data } = useQuery({
    queryKey: queryKeys.inProgressCount(),
    queryFn: () =>
      apiClient.get<SessionList>("/sessions", {
        query: { status: "in_progress", limit: 1, offset: 0 },
      }),
    staleTime: 60_000,
  });

  return data?.total ?? 0;
}
