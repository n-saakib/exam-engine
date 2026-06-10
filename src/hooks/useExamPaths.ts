"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { ExamPathsResponse } from "@/domain/types";

/**
 * Fetches the navigation tree + leaf summaries from `GET /api/exam-paths`.
 *
 * Query key: `['examPaths']` (from queryKeys.examPaths()).
 *
 * On success: `data.tree` is the raw tree node and `data.leaves` is the flat
 * list of leaves (each with quesPath, domainLabel, icon?, totalSets, etc.).
 *
 * On failure: `error` is an ApiError — the most important code is
 * `EXAM_PATHS_INVALID` (500), which the UI renders as an explicit error state
 * rather than a blank screen (F2 AC §10).
 */
export function useExamPaths() {
  return useQuery({
    queryKey: queryKeys.examPaths(),
    queryFn: () => apiClient.get<ExamPathsResponse>("/exam-paths"),
    // Re-fetch on window focus so additions to exam-paths.json are picked up
    // without a hard reload during development, but not spammed during exams.
    refetchOnWindowFocus: true,
  });
}
