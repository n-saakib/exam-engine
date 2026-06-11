"use client";

import { use } from "react";
import { ResultsScreen } from "@/features/results/ResultsScreen";

/**
 * /history/:id — history detail screen (F7 reuse of ResultsScreen).
 * Uses the same ResultsScreen component with mode="from-history" so the
 * back affordance goes to /history instead of home.
 */
export default function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ResultsScreen sessionId={id} mode="from-history" />;
}
