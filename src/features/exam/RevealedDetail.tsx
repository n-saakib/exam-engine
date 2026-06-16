"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import type { LiveQuestion } from "@/domain/types";

/**
 * Post-reveal / post-lock detail (F4-T22/T23): the correct answer, every
 * option's explanation, and Tips. Progressive reveal (settings
 * `progressive_reveal`): show correctness first, explanations behind a
 * "Show explanations" expander. When off, explanations are shown inline.
 *
 * Explanations are keyed by the ORIGINAL option letter (A/B/C/D) and travel
 * unchanged through shuffling — the option's content moves but the
 * explanation is still keyed by its stable ID. To match the SHUFFLED
 * presentation order the user saw on the option list, we iterate via
 * `question.optionOrder` (with a fallback to natural order) — same as
 * `OptionList.tsx`. This keeps the visible letters on the explanation
 * chips aligned with the letters on the option buttons above.
 */
function orderedOptionKeys(question: LiveQuestion): string[] {
  if (question.optionOrder && question.optionOrder.length > 0) {
    return question.optionOrder.filter((k) => k in question.options);
  }
  return Object.keys(question.options);
}

export function RevealedDetail({
  question,
  progressive,
}: {
  question: LiveQuestion;
  progressive: boolean;
}) {
  const [open, setOpen] = useState(!progressive);

  if (question.correctAnswer === undefined) return null;
  const correct = Array.isArray(question.correctAnswer)
    ? question.correctAnswer
    : [question.correctAnswer];
  const explanations = question.explanations ?? {};
  // Iterate options in the SAME order as the option list above, then keep
  // only those that have an explanation. This guarantees the letter shown
  // next to each explanation matches the letter on the corresponding
  // option button — even after per-question option shuffling.
  const keys = Object.keys(explanations).length
    ? orderedOptionKeys(question).filter((k) => k in explanations)
    : [];

  return (
    <section
      className="mt-4 rounded-card border border-revealed/40 bg-revealed/5 p-4"
      data-testid="revealed-detail"
      aria-label="Answer details"
    >
      <p className="text-sm font-semibold text-revealed">
        Correct answer: {correct.join(", ")}
      </p>

      {progressive ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            "mt-2 text-sm font-medium text-brand underline-offset-2 hover:underline",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
          )}
        >
          {open ? "Hide explanations" : "Show explanations"}
        </button>
      ) : null}

      {open ? (
        <div className="mt-3 flex flex-col gap-3" data-testid="explanations">
          {keys.map((key) => {
            const ex = explanations[key];
            const isCorrect = correct.includes(key);
            return (
              <div key={key} className="text-sm">
                <p className="font-medium">
                  <span
                    className={cn(
                      "mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
                      isCorrect
                        ? "bg-correct text-white"
                        : "bg-surface text-muted ring-1 ring-border",
                    )}
                  >
                    {key}
                  </span>
                  {ex.description}
                </p>
                <p className="mt-1 text-muted">{ex.reason}</p>
              </div>
            );
          })}

          {question.Tips ? (
            <div className="mt-1 rounded-card bg-surface p-3 text-sm">
              <p className="font-semibold">Tips</p>
              <p className="mt-1 text-muted">{question.Tips}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
