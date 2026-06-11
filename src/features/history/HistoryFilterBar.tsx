"use client";

import type { HistoryFilterState } from "@/hooks/useHistory";

interface HistoryFilterBarProps {
  filters: HistoryFilterState;
  onFilterChange: (patch: Partial<HistoryFilterState>) => void;
}

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Mock"] as const;
const SORT_OPTIONS = [
  { value: "date", label: "Date" },
  { value: "score", label: "Score" },
  { value: "difficulty", label: "Difficulty" },
] as const;

/**
 * HistoryFilterBar — renders filter controls that map 1:1 to GET /api/history
 * query params (F7-T8). Calling onFilterChange with a patch propagates to the
 * parent's useReducer, keeping filter identity stable for React Query.
 */
export function HistoryFilterBar({ filters, onFilterChange }: HistoryFilterBarProps) {
  return (
    <form
      role="search"
      aria-label="Filter exam history"
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      onSubmit={(e) => e.preventDefault()}
    >
      {/* Domain text search */}
      <div className="flex flex-col gap-1">
        <label htmlFor="history-domain" className="text-xs text-muted">
          Domain
        </label>
        <input
          id="history-domain"
          type="text"
          placeholder="e.g. AWS"
          value={filters.domain ?? ""}
          onChange={(e) =>
            onFilterChange({ domain: e.target.value || undefined, offset: 0 })
          }
          className="rounded border border-muted/30 bg-bg px-2 py-1 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Difficulty */}
      <div className="flex flex-col gap-1">
        <label htmlFor="history-difficulty" className="text-xs text-muted">
          Difficulty
        </label>
        <select
          id="history-difficulty"
          value={filters.difficulty ?? ""}
          onChange={(e) =>
            onFilterChange({
              difficulty: (e.target.value as HistoryFilterState["difficulty"]) || undefined,
              offset: 0,
            })
          }
          className="rounded border border-muted/30 bg-bg px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">All difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {/* Score range */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Score range</span>
        <div className="flex items-center gap-1">
          <input
            id="history-score-min"
            type="number"
            aria-label="Minimum score"
            placeholder="Min"
            min={0}
            max={100}
            value={filters.scoreMin ?? ""}
            onChange={(e) =>
              onFilterChange({
                scoreMin: e.target.value ? Number(e.target.value) : undefined,
                offset: 0,
              })
            }
            className="w-16 rounded border border-muted/30 bg-bg px-2 py-1 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <span className="text-xs text-muted">–</span>
          <input
            id="history-score-max"
            type="number"
            aria-label="Maximum score"
            placeholder="Max"
            min={0}
            max={100}
            value={filters.scoreMax ?? ""}
            onChange={(e) =>
              onFilterChange({
                scoreMax: e.target.value ? Number(e.target.value) : undefined,
                offset: 0,
              })
            }
            className="w-16 rounded border border-muted/30 bg-bg px-2 py-1 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      {/* Date range */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Date range</span>
        <div className="flex items-center gap-1">
          <input
            id="history-date-from"
            type="date"
            aria-label="From date"
            value={filters.dateFrom ?? ""}
            onChange={(e) =>
              onFilterChange({ dateFrom: e.target.value || undefined, offset: 0 })
            }
            className="rounded border border-muted/30 bg-bg px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <span className="text-xs text-muted">–</span>
          <input
            id="history-date-to"
            type="date"
            aria-label="To date"
            value={filters.dateTo ?? ""}
            onChange={(e) =>
              onFilterChange({ dateTo: e.target.value || undefined, offset: 0 })
            }
            className="rounded border border-muted/30 bg-bg px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      {/* Bookmarked toggle */}
      <div className="flex items-center gap-2">
        <input
          id="history-bookmarked"
          type="checkbox"
          checked={filters.bookmarked === true}
          onChange={(e) =>
            onFilterChange({ bookmarked: e.target.checked ? true : undefined, offset: 0 })
          }
          className="h-4 w-4 rounded border-muted/30 text-brand focus:ring-brand"
        />
        <label htmlFor="history-bookmarked" className="text-sm text-fg">
          Bookmarked only
        </label>
      </div>

      {/* Sort control */}
      <div className="flex flex-col gap-1">
        <label htmlFor="history-sort" className="text-xs text-muted">
          Sort by
        </label>
        <div className="flex items-center gap-1">
          <select
            id="history-sort"
            value={filters.sort ?? "date"}
            onChange={(e) =>
              onFilterChange({
                sort: e.target.value as HistoryFilterState["sort"],
                offset: 0,
              })
            }
            className="rounded border border-muted/30 bg-bg px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {SORT_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={`Order: ${filters.order === "asc" ? "ascending" : "descending"}`}
            onClick={() =>
              onFilterChange({
                order: filters.order === "asc" ? "desc" : "asc",
                offset: 0,
              })
            }
            className="rounded border border-muted/30 bg-bg px-2 py-1 text-sm text-fg hover:bg-muted/10 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {filters.order === "asc" ? "Asc" : "Desc"}
          </button>
        </div>
      </div>

      {/* Clear filters */}
      <button
        type="button"
        onClick={() =>
          onFilterChange({
            domain: undefined,
            quesPath: undefined,
            difficulty: undefined,
            scoreMin: undefined,
            scoreMax: undefined,
            dateFrom: undefined,
            dateTo: undefined,
            bookmarked: undefined,
            sort: "date",
            order: "desc",
            offset: 0,
          })
        }
        className="self-end rounded border border-muted/30 bg-bg px-3 py-1 text-sm text-muted hover:bg-muted/10 focus:outline-none focus:ring-2 focus:ring-brand"
      >
        Clear
      </button>
    </form>
  );
}
