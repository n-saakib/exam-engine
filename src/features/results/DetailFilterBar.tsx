"use client";

import { cn } from "@/lib/cn";

export type ReviewFilter = "all" | "incorrect" | "revealed" | "flagged";

interface DetailFilterBarProps {
  activeFilter: ReviewFilter;
  onFilterChange: (filter: ReviewFilter) => void;
  counts: {
    all: number;
    incorrect: number;
    revealed: number;
    flagged: number;
  };
}

const FILTERS: Array<{ key: ReviewFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "incorrect", label: "Incorrect" },
  { key: "revealed", label: "Revealed" },
  { key: "flagged", label: "Flagged" },
];

/**
 * Client-side filter bar for the detailed question review list.
 * Tabs switch between All / Incorrect only / Revealed only / Flagged.
 */
export function DetailFilterBar({
  activeFilter,
  onFilterChange,
  counts,
}: DetailFilterBarProps) {
  return (
    <nav
      role="tablist"
      aria-label="Filter questions by outcome"
      className="flex gap-1 overflow-x-auto"
    >
      {FILTERS.map(({ key, label }) => {
        const count = counts[key];
        const isActive = activeFilter === key;

        return (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onFilterChange(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-card px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
              isActive
                ? "bg-brand text-brand-fg"
                : "bg-surface text-fg border border-border hover:bg-bg",
            )}
          >
            {label}
            <span
              className={cn(
                "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold min-w-[1.25rem]",
                isActive ? "bg-brand-fg/20 text-brand-fg" : "bg-bg text-muted",
              )}
              aria-label={`${count} questions`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
