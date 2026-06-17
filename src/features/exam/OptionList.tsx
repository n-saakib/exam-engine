"use client";

import { cn } from "@/lib/cn";
import type { LiveQuestion } from "@/domain/types";
import type { AnswerState } from "@/store/examStore";

/**
 * Multi-select options as a real checkbox group (ADR-13). Every question is
 * rendered as checkboxes regardless of `questionType` — the user is never told
 * whether a question is single or multi, which trains choice elimination
 * (pedagogical: ticking all candidates, then de-selecting the wrong ones).
 *
 * Display order is FIXED to A, B, C, D (ADR-15): the chip letter on screen is a
 * label, and the underlying option key (the one stored in `selected` and used
 * for grading) is looked up from `question.optionOrder`. When the snapshot has
 * no `optionOrder` (or the index is missing) the display letter falls back to
 * being its own underlying key — i.e. the un-shuffled natural order.
 *
 * Every option is a tab stop (WAI-ARIA APG pattern for `group > checkbox[]`);
 * Space/Enter toggles the focused option; arrow keys do not move focus inside
 * the group. After reveal/lock shows per-option correctness styling. Colour is
 * paired with text ("Correct"/"Your answer") so it isn't the only signal.
 */

/** Letters used as display labels, in canonical order. */
const DISPLAY_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** Display letters that exist on this question (truncated to options.length). */
function displayLetters(question: LiveQuestion): string[] {
  const total = Object.keys(question.options).length;
  return DISPLAY_LETTERS.slice(0, total);
}

/**
 * The underlying option key for a given display letter. When shuffle is on,
 * `optionOrder` is the shuffled list of underlying keys — the display letter
 * at position `i` maps to `optionOrder[i]`. When shuffle is off (or the index
 * is out of range), the display letter IS the underlying key.
 */
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

function correctSet(question: LiveQuestion): Set<string> {
  const ca = question.correctAnswer;
  if (ca === undefined) return new Set();
  return new Set(Array.isArray(ca) ? ca : [ca]);
}

export function OptionList({
  question,
  answer,
  onSelect,
}: {
  question: LiveQuestion;
  answer: AnswerState;
  onSelect: (option: string) => void;
}) {
  const letters = displayLetters(question);
  const locked = answer.revealed;
  const revealed = answer.revealed && question.correctAnswer !== undefined;
  const correct = correctSet(question);

  // Native button + role="checkbox" handles Space/Enter toggle and Tab focus.
  // Arrow keys intentionally do not move focus inside the group (WAI-ARIA APG
  // pattern for `group > checkbox[]`: each checkbox is a tab stop, Tab moves
  // between groups).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (locked && (e.key === " " || e.key === "Enter")) e.preventDefault();
  };

  return (
    <div
      role="group"
      aria-labelledby={`question-${question.id}`}
      className="flex flex-col gap-2"
      data-testid="option-list"
    >
      {letters.map((displayLetter, i) => {
        const key = underlyingKey(question, displayLetter, i);
        const selected = answer.selected.includes(key);
        const isCorrect = revealed && correct.has(key);
        const isWrongPick = revealed && selected && !correct.has(key);

        return (
          <button
            key={displayLetter}
            type="button"
            role="checkbox"
            aria-checked={selected}
            disabled={locked}
            tabIndex={0}
            onClick={() => onSelect(key)}
            onKeyDown={onKeyDown}
            data-option={key}
            data-label={displayLetter}
            data-selected={selected ? "true" : undefined}
            data-correct={isCorrect ? "true" : undefined}
            data-incorrect={isWrongPick ? "true" : undefined}
            className={cn(
              "flex w-full items-start gap-3 rounded-card border p-3 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
              !revealed && selected && "border-brand bg-brand/10",
              !revealed && !selected && "border-border bg-surface hover:bg-bg",
              isCorrect && "border-correct bg-correct/10",
              isWrongPick && "border-incorrect bg-incorrect/10",
              revealed && !isCorrect && !isWrongPick && "border-border bg-surface opacity-80",
              locked && "cursor-default",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-semibold",
                selected ? "border-brand bg-brand text-brand-fg" : "border-muted text-muted",
                isCorrect && "border-correct bg-correct text-white",
                isWrongPick && "border-incorrect bg-incorrect text-white",
              )}
            >
              {selected ? "✓" : displayLetter}
            </span>
            <span className="flex-1 text-sm">
              <span>{question.options[key]}</span>
              {revealed && (isCorrect || isWrongPick || selected) ? (
                <span
                  className={cn(
                    "ml-2 text-xs font-semibold",
                    isCorrect && "text-correct",
                    isWrongPick && "text-incorrect",
                  )}
                >
                  {isCorrect ? "· Correct" : isWrongPick ? "· Your answer" : selected ? "· Your answer" : ""}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
