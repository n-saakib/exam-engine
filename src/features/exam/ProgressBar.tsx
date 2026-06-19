"use client";

import type { ExamStore } from "@/store/examStore";
import { countAnswered, countFlagged } from "./selectors";

/**
 * Exam progress (F4-T18): question index, % answered, flagged count. Subscribes
 * narrowly to `answers`/`currentIndex` (NOT the timer), so the 1 Hz tick never
 * re-renders it (08 §6).
 */
export function ProgressBar({ store }: { store: ExamStore }) {
  const total = store((s) => s.questions.length);
  const currentIndex = store((s) => s.currentIndex);
  const answers = store((s) => s.answers);

  const answered = countAnswered(answers);
  const flagged = countFlagged(answers);
  const percent = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
        <span className="whitespace-nowrap tabular-nums">
          Question {Math.min(currentIndex + 1, total)} of {total}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap">
          <span className="tabular-nums">{percent}% answered</span>
          <span className="text-flagged">⚑ {flagged} flagged</span>
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${answered} of ${total} questions answered`}
      >
        <div
          className="h-full rounded-full bg-brand transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
