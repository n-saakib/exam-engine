"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { apiClient } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { Results, LiveSession } from "@/domain/types";

// ────────────────────────────────────────────────────────────────────────────
// useResults — fetches the full graded results DTO for a session (F5-T10)
// ────────────────────────────────────────────────────────────────────────────

export function useResults(id: string) {
  return useQuery({
    queryKey: queryKeys.results(id),
    queryFn: () => apiClient.get<Results>(`/sessions/${id}/results`),
    staleTime: 60_000,
    retry: 1,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// useReview — optimistic bookmark + debounced note mutation (F5-T10)
// ────────────────────────────────────────────────────────────────────────────

interface ReviewPayload {
  isBookmarked?: boolean;
  note?: string | null;
}

interface ReviewResponse {
  id: string;
  isBookmarked: boolean;
  note: string | null;
}

export function useReview(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ReviewPayload) =>
      apiClient.patch<ReviewResponse>(`/sessions/${sessionId}/review`, {
        json: payload,
      }),

    // Optimistic update: immediately reflect bookmark/note changes in the cache.
    onMutate: async (payload: ReviewPayload) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.results(sessionId) });
      const snapshot = queryClient.getQueryData<Results>(queryKeys.results(sessionId));

      if (snapshot) {
        queryClient.setQueryData<Results>(queryKeys.results(sessionId), {
          ...snapshot,
          ...(payload.isBookmarked !== undefined
            ? { isBookmarked: payload.isBookmarked }
            : {}),
          ...(payload.note !== undefined ? { note: payload.note } : {}),
        });
      }

      return { snapshot };
    },

    // Roll back on error.
    onError: (_err, _payload, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(queryKeys.results(sessionId), context.snapshot);
      }
    },

    // Invalidate history + stats so the bookmarked/note state propagates.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.history() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats() });
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// useRetake — creates a retake session and navigates to it (F5-T10)
// ────────────────────────────────────────────────────────────────────────────

interface RetakePayload {
  scope: "all" | "incorrect";
  options?: {
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    timerEnabled?: boolean;
    timerMinutes?: number | null;
  };
}

export function useRetake(originSessionId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RetakePayload) =>
      apiClient.post<LiveSession>(`/sessions/${originSessionId}/retake`, {
        json: payload,
      }),

    onSuccess: (newSession) => {
      // Pre-populate the session cache so the exam screen has it on mount.
      queryClient.setQueryData(queryKeys.session(newSession.id), newSession);
      router.push(`/exam/${newSession.id}`);
    },
  });
}
