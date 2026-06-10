"use client";

import { cn } from "@/lib/cn";
import type { ExamStore } from "@/store/examStore";
import { answerStatus, type NavStatus } from "./selectors";

/**
 * Numbered question navigator (F4-T17). Colour-coded by state AND carrying a
 * non-colour indicator + descriptive `aria-label` so colour is never the only
 * signal (08 §6). Jump to any question via `goTo`.
 */

const STATUS_CLASSES: Record<NavStatus, string> = {
  current: "border-current bg-current/15 text-fg ring-2 ring-current",
  revealed: "border-revealed bg-revealed/15 text-fg",
  flagged: "border-flagged bg-flagged/15 text-fg",
  answered: "border-correct bg-correct/15 text-fg",
  unanswered: "border-border bg-surface text-muted",
};

/** Non-colour glyph appended after the number (accessibility redundancy). */
const STATUS_GLYPH: Record<NavStatus, string> = {
  current: "",
  revealed: "👁",
  flagged: "⚑",
  answered: "✓",
  unanswered: "",
};

const STATUS_WORD: Record<NavStatus, string> = {
  current: "current",
  revealed: "revealed",
  flagged: "flagged",
  answered: "answered",
  unanswered: "unanswered",
};

export function QuestionNavigator({ store }: { store: ExamStore }) {
  const questions = store((s) => s.questions);
  const currentIndex = store((s) => s.currentIndex);
  const answers = store((s) => s.answers);
  const goTo = store((s) => s.goTo);

  return (
    <nav aria-label="Question navigator">
      <ul className="flex flex-wrap gap-1.5" data-testid="question-navigator">
        {questions.map((q, i) => {
          const isCurrent = i === currentIndex;
          const a = answers[q.id];
          // A question can be both flagged and answered — surface both in the
          // label even though the swatch colour reflects the primary status.
          const status = answerStatus(a, isCurrent);
          const flagged = !!a?.flagged && !isCurrent;
          const answered = !!a && (a.selected.length > 0 || a.revealed);
          const parts = [`Question ${i + 1}`];
          if (isCurrent) parts.push("current");
          if (a?.revealed) parts.push("revealed");
          if (flagged) parts.push("flagged");
          if (answered && !a?.revealed) parts.push("answered");
          if (!answered && !flagged && !a?.revealed && !isCurrent)
            parts.push("unanswered");
          const label = parts.join(", ");
          const glyph = flagged ? "⚑" : STATUS_GLYPH[status];

          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={isCurrent ? "true" : undefined}
                aria-label={label}
                data-status={status}
                data-flagged={flagged ? "true" : undefined}
                className={cn(
                  "relative flex h-9 min-w-9 items-center justify-center gap-0.5 rounded-card border px-1.5 text-sm font-medium",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
                  STATUS_CLASSES[status],
                )}
              >
                <span>{i + 1}</span>
                {glyph ? (
                  <span aria-hidden="true" className="text-[0.65rem] leading-none">
                    {glyph}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(["current", "answered", "flagged", "revealed", "unanswered"] as NavStatus[]).map(
          (s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "inline-block h-3 w-3 rounded-sm border",
                  STATUS_CLASSES[s],
                )}
              />
              <span>{STATUS_WORD[s]}</span>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
