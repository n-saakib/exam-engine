"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { ScanSummary } from "@/server/services/setCatalog";

export type { ScanSummary };

interface ScanVariables {
  /** Optional leaf path to restrict the scan to one subtree. */
  quesPath?: string;
}

/**
 * Trigger a catalogue rescan via `POST /api/catalog/scan`.
 * Invalidates all `sets` and `diagnostics` queries on success.
 */
export function useScan() {
  const queryClient = useQueryClient();

  return useMutation<ScanSummary, Error, ScanVariables>({
    mutationFn: (vars: ScanVariables) =>
      apiClient.post<ScanSummary>("/catalog/scan", {
        json: vars.quesPath ? { quesPath: vars.quesPath } : {},
      }),
    onSuccess: () => {
      // Invalidate all set lists and diagnostics after a scan.
      void queryClient.invalidateQueries({ queryKey: ["sets"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.diagnostics() });
    },
  });
}
