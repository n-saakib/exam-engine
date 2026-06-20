"use client";

import { cn } from "@/lib/cn";
import type { ExamStore } from "@/store/examStore";
import { answerStatus, type NavStatus } from "./selectors";

/**
 * Numbered question navigator (F4-T17). Colour-coded by state AND carrying a
 * non-colour indicator + descriptive `aria-label` so colour is never the only
 * signal (08 §6). Jump to any question via `goTo`.
 *
 * The 7-state palette reflects the new `answerStatus` model:
 *   current | gave_up | answered_correct | answered_incorrect
 *   answered_pending | flagged | unanswered
 */

const STATUS_CLASSES: Record<NavStatus, string> = {
  current: "border-current bg-current/15 text-fg ring-2 ring-current",
  // gave_up shares the warning amber so the colour tokens don't change;
  // the ⏏ glyph keeps it visually distinct from a regular commit.
  gave_up: "border-revealed bg-revealed/15 text-fg",
  answered_correct: "border-correct bg-correct/15 text-fg",
  answered_incorrect: "border-incorrect bg-incorrect/15 text-fg",
  answered_pending: "border-correct/40 bg-correct/5 text-muted",
  flagged: "border-flagged bg-flagged/15 text-fg",
  unanswered: "border-border bg-surface text-muted",
};

/** Non-colour glyph appended after the number (accessibility redundancy). */
const STATUS_GLYPH: Record<NavStatus, string> = {
  current: "",
  gave_up: "⏏",
  answered_correct: "✓",
  answered_incorrect: "✗",
  answered_pending: "?",
  flagged: "⚑",
  unanswered: "",
};

const STATUS_WORD: Record<NavStatus, string> = {
  current: "current",
  gave_up: "gave up",
  answered_correct: "answered (correct)",
  answered_incorrect: "answered (incorrect)",
  answered_pending: "answered (pending)",
  flagged: "flagged",
  unanswered: "unanswered",
};

/** Order in which the legend rows are rendered. */
const LEGEND_ORDER: NavStatus[] = [
  "current",
  "answered_correct",
  "answered_incorrect",
  "answered_pending",
  "gave_up",
  "flagged",
  "unanswered",
];

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
          // A question can be both flagged AND in any answered/committed state
          // — surface both in the label even though the swatch colour
          // reflects the primary status.
          const status = answerStatus(a, isCurrent, q);
          const flagged = !!a?.flagged;
          const parts = [`Question ${i + 1}`];
          if (isCurrent) parts.push("current");
          else parts.push(STATUS_WORD[status]);
          // Flag overlay: only append "flagged" if the primary status isn't
          // already "flagged" (otherwise we'd say "flagged" twice).
          if (flagged && !isCurrent && status !== "flagged") parts.push("flagged");
          const label = parts.join(", ");
          // Flag always wins the glyph, preserving the prior behaviour where
          // the ⚑ is the strongest visual signal of a user's review intent.
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
        {LEGEND_ORDER.map((s) => (
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
        ))}
      </ul>
    </nav>
  );
}
