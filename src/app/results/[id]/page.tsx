"use client";

import { use } from "react";
import { ResultsScreen } from "@/features/results/ResultsScreen";

/**
 * /results/:id — post-exam results screen (F5-T5).
 * Client component: all data fetching happens in ResultsScreen via React Query.
 */
export default function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ResultsScreen sessionId={id} mode="post-exam" />;
}
