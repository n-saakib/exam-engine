"use client";

import { useReducer, useCallback } from "react";

import { Spinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { useHistory, useStats, type HistoryFilterState } from "@/hooks/useHistory";

import { AggregateStatsBar } from "./AggregateStatsBar";
import { HistoryFilterBar } from "./HistoryFilterBar";
import { HistoryTable } from "./HistoryTable";

// ── Filter reducer ─────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: HistoryFilterState = {
  sort: "date",
  order: "desc",
  limit: 20,
  offset: 0,
};

type FilterAction = { type: "PATCH"; patch: Partial<HistoryFilterState> };

function filterReducer(
  state: HistoryFilterState,
  action: FilterAction,
): HistoryFilterState {
  switch (action.type) {
    case "PATCH":
      return { ...state, ...action.patch };
    default:
      return state;
  }
}

// ── HistoryScreen ──────────────────────────────────────────────────────────────

/**
 * HistoryScreen — the /history page (F7-T7, 04 §4.5).
 *
 * Filter identity is kept stable via useReducer so React Query caches correctly
 * (04 §7). The filter object passed to useHistory and useStats is the reducer
 * state — same reference on every render unless a filter action fires.
 */
export function HistoryScreen() {
  const [filters, dispatch] = useReducer(filterReducer, DEFAULT_FILTERS);

  const handleFilterChange = useCallback((patch: Partial<HistoryFilterState>) => {
    dispatch({ type: "PATCH", patch });
  }, []);

  const { data: historyData, isLoading: historyLoading, isError: historyError } =
    useHistory(filters);
  const { data: statsData, isLoading: statsLoading } = useStats(filters);

  const items = historyData?.items ?? [];
  const total = historyData?.total ?? 0;
  const currentOffset = filters.offset ?? 0;
  const limit = filters.limit ?? 20;

  const hasMore = currentOffset + items.length < total;
  const hasPrev = currentOffset > 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-fg">Exam History</h1>
        <p className="mt-1 text-sm text-muted">Your completed exams with filtering and stats.</p>
      </header>

      {/* Aggregate stats */}
      <section aria-label="Aggregate stats">
        <AggregateStatsBar stats={statsData} isLoading={statsLoading} />
      </section>

      {/* Filter bar */}
      <section aria-label="Filter controls">
        <HistoryFilterBar filters={filters} onFilterChange={handleFilterChange} />
      </section>

      {/* Results */}
      <section aria-label="History list">
        {historyLoading ? (
          <div
            className="flex items-center justify-center p-12"
            aria-label="Loading history"
          >
            <Spinner />
          </div>
        ) : historyError ? (
          <EmptyState
            title="Could not load history"
            description="Please try refreshing the page."
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="No exams found"
            description={
              currentOffset === 0
                ? "Complete some exams to see them here. Filters may also be narrowing the results."
                : "No more results."
            }
          />
        ) : (
          <>
            {/* Results info */}
            <p className="mb-3 text-sm text-muted">
              Showing {currentOffset + 1}–{currentOffset + items.length} of {total} exams
            </p>

            <HistoryTable items={items} />

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasPrev}
                onClick={() =>
                  handleFilterChange({ offset: Math.max(0, currentOffset - limit) })
                }
                aria-label="Previous page"
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasMore}
                onClick={() => handleFilterChange({ offset: currentOffset + limit })}
                aria-label="Load more results"
              >
                Load more
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
