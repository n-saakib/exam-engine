"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { LiveSession } from "@/domain/types";

/**
 * Fetch the live session ONCE for the exam screen (04 §7, 09 §9). The store is
 * authoritative after hydration, so this query uses `staleTime: Infinity` +
 * `refetchOnWindowFocus: false` — a focus refetch must never stomp the Zustand
 * store mid-exam. On a fresh mount / refresh it rehydrates the exact saved
 * position, answers, flags, commits and elapsed time (resume path, F4-T28).
 */
export function useExamSession(id: string) {
  return useQuery({
    queryKey: queryKeys.session(id),
    queryFn: () => apiClient.get<LiveSession>(`/sessions/${id}`),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
