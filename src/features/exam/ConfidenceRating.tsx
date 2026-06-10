"use client";

import { cn } from "@/lib/cn";
import type { Confidence } from "@/domain/types";

/**
 * Confidence rating (F4-T25): easy / medium / hard, writing `confidence` via
 * the store. A small radio-style group; cheap to include now.
 */
const LEVELS: { value: Confidence; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export function ConfidenceRating({
  value,
  onChange,
}: {
  value: Confidence | null;
  onChange: (c: Confidence) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Confidence"
      className="flex items-center gap-2"
    >
      <span className="text-xs text-muted">Confidence:</span>
      {LEVELS.map((lvl) => {
        const active = value === lvl.value;
        return (
          <button
            key={lvl.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(lvl.value)}
            className={cn(
              "rounded-card border px-2.5 py-1 text-xs font-medium",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
              active
                ? "border-brand bg-brand/10 text-fg"
                : "border-border bg-surface text-muted hover:bg-bg",
            )}
          >
            {lvl.label}
          </button>
        );
      })}
    </div>
  );
}
