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
 * Display order is FIXED to A, B, C, D (ADR-15). Explanations are keyed by
 * the underlying option letter (which is what travels with the question and
 * is what `correctAnswer` references). The display letter on each row maps
 * to its underlying key via `question.optionOrder` — same as `OptionList.tsx`.
 * This keeps the visible letter on each explanation chip aligned with the
 * letter on the corresponding option button above, even when options are
 * shuffled.
 */
const DISPLAY_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function displayLetters(question: LiveQuestion): string[] {
  const total = Object.keys(question.options).length;
  return DISPLAY_LETTERS.slice(0, total);
}

function underlyingKey(
  question: LiveQuestion,
  displayLetter: string,
  displayIndex: number,
): string {
  const order = question.optionOrder;
  if (order && displayIndex < order.length) {
    const candidate = order[displayIndex];
    if (candidate && candidate in question.options) return candidate;
  }
  return displayLetter;
}

/**
 * Reverse-map an underlying option key to the display letter the user saw
 * during the exam. With `optionOrder = [B, C, A, D]`, the underlying "B"
 * was shown at chip A, so this returns "A" for input "B". When the
 * snapshot has no `optionOrder` (or the key is missing from it) we fall
 * back to natural alphabetical mapping via the sorted option map.
 */
function displayLetterFor(
  question: LiveQuestion,
  underlyingKey: string,
): string {
  const order = question.optionOrder;
  if (order) {
    const idx = order.indexOf(underlyingKey);
    if (idx >= 0 && idx < DISPLAY_LETTERS.length) {
      return DISPLAY_LETTERS[idx]!;
    }
  }
  const sorted = Object.keys(question.options).sort();
  const idx = sorted.indexOf(underlyingKey);
  if (idx >= 0 && idx < DISPLAY_LETTERS.length) {
    return DISPLAY_LETTERS[idx]!;
  }
  return underlyingKey;
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
  // ADR-15: reverse-map underlying keys to display letters (A, B, C, D) so
  // the "Correct answer" header matches the chip letter on the option
  // button above (and on each explanation row). Sorted alphabetically so
  // multi-answer lists read naturally ("A, B, C").
  const correctDisplay = correct
    .map((k) => displayLetterFor(question, k))
    .sort()
    .join(", ");
  const explanations = question.explanations ?? {};
  // Iterate display positions in FIXED A, B, C, D order (ADR-15), then drop
  // any display letter whose underlying key has no explanation. This keeps
  // the chip letter aligned with the option button above — even when the
  // options are shuffled.
  const rows = Object.keys(explanations).length
    ? displayLetters(question)
        .map((displayLetter, i) => ({
          displayLetter,
          key: underlyingKey(question, displayLetter, i),
        }))
        .filter((r) => r.key in explanations)
    : [];

  return (
    <section
      className="mt-4 rounded-card border border-revealed/40 bg-revealed/5 p-4"
      data-testid="revealed-detail"
      aria-label="Answer details"
    >
      <p className="text-sm font-semibold text-revealed">
        Correct answer: {correctDisplay}
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
          {rows.map(({ displayLetter, key }) => {
            const ex = explanations[key];
            const isCorrect = correct.includes(key);
            return (
              <div key={displayLetter} className="text-sm">
                <p className="font-medium">
                  <span
                    className={cn(
                      "mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
                      isCorrect
                        ? "bg-correct text-white"
                        : "bg-surface text-muted ring-1 ring-border",
                    )}
                  >
                    {displayLetter}
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
