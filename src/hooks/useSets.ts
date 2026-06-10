"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { CatalogSetItem, SetListResponse } from "@/server/services/setCatalog";

// Re-export the DTO types so consumers don't need to reach into server modules.
export type { CatalogSetItem, SetListResponse };

/**
 * Fetch all catalogued sets for a given `quesPath` leaf with completion + drift state.
 * Corresponds to `GET /api/sets?quesPath=`.
 *
 * @param quesPath  The leaf path from exam-paths.json (e.g. "Exams/Cloud/AWS/...").
 *                  Pass `undefined` to disable the query.
 */
export function useSets(quesPath: string | undefined) {
  return useQuery<SetListResponse>({
    queryKey: queryKeys.sets(quesPath ?? ""),
    queryFn: () =>
      apiClient.get<SetListResponse>("/sets", {
        query: { quesPath: quesPath! },
      }),
    enabled: !!quesPath,
  });
}
