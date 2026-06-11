"use client";

import type { StatsResponse } from "@/domain/types";

interface AggregateStatsBarProps {
  stats: StatsResponse | undefined;
  isLoading: boolean;
}

/**
 * AggregateStatsBar — shows total exams, average score, best score, and current
 * streak from the filtered stats response (F7-T10).
 */
export function AggregateStatsBar({ stats, isLoading }: AggregateStatsBarProps) {
  if (isLoading) {
    return (
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-label="Loading aggregate stats"
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-card bg-muted/20 p-4 h-16"
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  const items = [
    {
      label: "Total exams",
      value: stats ? stats.totalExams.toString() : "—",
    },
    {
      label: "Average score",
      value: stats ? `${stats.averageScore}%` : "—",
    },
    {
      label: "Best score",
      value: stats ? `${stats.bestScore}%` : "—",
    },
    {
      label: "Current streak",
      value: stats
        ? `${stats.currentStreakDays} day${stats.currentStreakDays !== 1 ? "s" : ""}`
        : "—",
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      aria-label="Aggregate exam stats"
    >
      {items.map(({ label, value }) => (
        <div key={label} className="rounded-card bg-muted/10 p-4">
          <p className="text-xs text-muted">{label}</p>
          <p className="mt-1 text-xl font-bold text-fg">{value}</p>
        </div>
      ))}
    </div>
  );
}
