"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { Settings, SettingsPatch } from "@/domain/types";

/**
 * Read the full settings object from /api/settings (React Query `['settings']`).
 * The query is kept fresh with the default staleTime; it rehydrates theme and
 * last_selected_path on load (F1-T6).
 */
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: () => apiClient.get<Settings>("/settings"),
  });
}

/**
 * Mutation: PATCH /api/settings with only the provided keys (optimistic update).
 * Rolls back to the previous value on error and invalidates the cache so a fresh
 * fetch reflects the authoritative server state.
 *
 * Usage:
 *   const { mutate } = useUpdateSettings();
 *   mutate({ theme: 'dark' });
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: SettingsPatch) =>
      apiClient.patch<Settings>("/settings", { json: patch }),

    // Optimistic update: immediately merge the patch into the cached settings.
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.settings() });
      const previous = queryClient.getQueryData<Settings>(queryKeys.settings());
      if (previous) {
        queryClient.setQueryData<Settings>(queryKeys.settings(), {
          ...previous,
          ...patch,
        });
      }
      return { previous };
    },

    // Roll back on error.
    onError: (_err, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.settings(), context.previous);
      }
    },

    // Always re-sync from server after settle (success or error).
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings() });
    },
  });
}
