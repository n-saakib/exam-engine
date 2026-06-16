"use client";

import type { Results } from "@/domain/types";
import { cn } from "@/lib/cn";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface BreakdownItemProps {
  label: string;
  value: number;
  colorClass: string;
}

function BreakdownItem({ label, value, colorClass }: BreakdownItemProps) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn("text-2xl font-bold", colorClass)}>{value}</span>
      <span className="text-xs text-muted uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ── ScoreSummaryCard ──────────────────────────────────────────────────────────

interface ScoreSummaryCardProps {
  results: Results;
}

/**
 * Shows the score percentage, four-way breakdown (correct/incorrect/revealed/
 * unanswered), time taken vs limit, and the domain/difficulty header.
 */
export function ScoreSummaryCard({ results }: ScoreSummaryCardProps) {
  const { summary, domainLabel, difficulty } = results;
  const { scorePercent, correct, incorrect, gaveUp, revealed, unanswered, timeTakenMs, timerLimitMs } = summary;

  // Colour-code the score.
  const scoreColor =
    scorePercent >= 80
      ? "text-correct"
      : scorePercent >= 50
        ? "text-warning"
        : "text-incorrect";

  return (
    <section
      className="rounded-card border border-border bg-surface p-5 flex flex-col gap-4"
      aria-label="Score summary"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-fg">{results.setTitle}</h2>
          <p className="text-sm text-muted">{domainLabel}</p>
        </div>
        <span className="rounded-full bg-bg border border-border px-3 py-1 text-xs font-medium text-muted">
          {difficulty}
        </span>
      </div>

      {/* Score percentage */}
      <div className="flex flex-col items-center gap-1 py-2">
        <span
          className={cn("text-6xl font-bold tabular-nums", scoreColor)}
          aria-label={`Score: ${scorePercent} percent`}
        >
          {scorePercent}%
        </span>
        <span className="text-sm text-muted">
          {correct} of {summary.total} correct
        </span>
      </div>

      {/* Five-way breakdown */}
      <div
        className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-border border border-border rounded-card"
        role="list"
        aria-label="Question breakdown"
      >
        <div role="listitem" className="p-3 flex flex-col items-center gap-0.5">
          <BreakdownItem label="Correct" value={correct} colorClass="text-correct" />
        </div>
        <div role="listitem" className="p-3 flex flex-col items-center gap-0.5">
          <BreakdownItem label="Incorrect" value={incorrect} colorClass="text-incorrect" />
        </div>
        <div role="listitem" className="p-3 flex flex-col items-center gap-0.5">
          <BreakdownItem label="Gave up" value={gaveUp} colorClass="text-warning" />
        </div>
        <div role="listitem" className="p-3 flex flex-col items-center gap-0.5">
          <BreakdownItem label="Revealed" value={revealed} colorClass="text-revealed" />
        </div>
        <div role="listitem" className="p-3 flex flex-col items-center gap-0.5">
          <BreakdownItem label="Skipped" value={unanswered} colorClass="text-muted" />
        </div>
      </div>

      {/* Time taken */}
      <div className="flex items-center justify-center gap-2 text-sm text-muted">
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span>
          Time taken: <strong className="text-fg">{formatMs(timeTakenMs)}</strong>
          {timerLimitMs != null && (
            <> of {formatMs(timerLimitMs)} limit</>
          )}
        </span>
      </div>
    </section>
  );
}
