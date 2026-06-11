"use client";

import type { HistoryRow as HistoryRowType } from "@/domain/types";
import { HistoryRow } from "./HistoryRow";

interface HistoryTableProps {
  items: HistoryRowType[];
}

/**
 * HistoryTable — renders the list of history rows with accessible column headers
 * (F7-T9). Each HistoryRow handles its own expand/collapse and inline actions.
 */
export function HistoryTable({ items }: HistoryTableProps) {
  return (
    <div className="overflow-hidden rounded-card border border-muted/20">
      {/* Column header */}
      <div
        className="flex items-center gap-2 border-b border-muted/20 bg-muted/5 px-4 py-2"
        role="row"
        aria-label="Column headers"
      >
        <span className="w-24 shrink-0 text-xs font-medium text-muted uppercase tracking-wide">
          Date
        </span>
        <span className="flex-1 text-xs font-medium text-muted uppercase tracking-wide">
          Domain
        </span>
        <span className="w-20 shrink-0 text-xs font-medium text-muted uppercase tracking-wide">
          Difficulty
        </span>
        <span className="w-16 shrink-0 text-right text-xs font-medium text-muted uppercase tracking-wide">
          Score
        </span>
        <span className="w-20 shrink-0 text-right text-xs font-medium text-muted uppercase tracking-wide">
          Time
        </span>
        {/* Bookmark + expand */}
        <span className="w-14 shrink-0" aria-hidden="true" />
      </div>

      {/* Rows */}
      <ul aria-label="Exam history rows">
        {items.map((row) => (
          <HistoryRow key={row.id} row={row} />
        ))}
      </ul>
    </div>
  );
}
