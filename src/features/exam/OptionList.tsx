"use client";

import { cn } from "@/lib/cn";
import type { LiveQuestion } from "@/domain/types";
import type { AnswerState } from "@/store/examStore";

/**
 * Multi-select options as a real checkbox group (ADR-13). Every question is
 * rendered as checkboxes regardless of `questionType` — the user is never told
 * whether a question is single or multi, which trains choice elimination
 * (pedagogical: ticking all candidates, then de-selecting the wrong ones).
 * Respects `optionOrder`. Every option is a tab stop (WAI-ARIA APG pattern
 * for `group > checkbox[]`); Space/Enter toggles the focused option; arrow
 * keys do not move focus inside the group. After reveal/lock shows per-option
 * correctness styling. Colour is paired with text ("Correct"/"Your answer")
 * so it isn't the only signal.
 */

function orderedKeys(question: LiveQuestion): string[] {
  if (question.optionOrder && question.optionOrder.length > 0) {
    // Keep only keys that actually exist in options, preserving order.
    return question.optionOrder.filter((k) => k in question.options);
  }
  return Object.keys(question.options);
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
  const keys = orderedKeys(question);
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
      {keys.map((key) => {
        const selected = answer.selected.includes(key);
        const isCorrect = revealed && correct.has(key);
        const isWrongPick = revealed && selected && !correct.has(key);

        return (
          <button
            key={key}
            type="button"
            role="checkbox"
            aria-checked={selected}
            disabled={locked}
            tabIndex={0}
            onClick={() => onSelect(key)}
            onKeyDown={onKeyDown}
            data-option={key}
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
              {selected ? "✓" : key}
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
