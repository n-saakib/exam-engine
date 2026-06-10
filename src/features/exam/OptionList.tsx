"use client";

import { useRef } from "react";

import { cn } from "@/lib/cn";
import type { LiveQuestion } from "@/domain/types";
import type { AnswerState } from "@/store/examStore";

/**
 * Single-choice options as a real radio group (F4-T16, 04 §9). Respects
 * `optionOrder`, is arrow-key navigable, and after reveal/lock shows per-option
 * correctness styling via the `correct`/`incorrect` tokens. Colour is paired
 * with text ("Correct"/"Your answer") so it isn't the only signal.
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
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (locked) return;
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (idx + 1) % keys.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft")
      next = (idx - 1 + keys.length) % keys.length;
    if (next >= 0) {
      e.preventDefault();
      const key = keys[next];
      refs.current[key]?.focus();
      onSelect(key);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Answer options"
      className="flex flex-col gap-2"
      data-testid="option-list"
    >
      {keys.map((key, idx) => {
        const selected = answer.selected.includes(key);
        const isCorrect = revealed && correct.has(key);
        const isWrongPick = revealed && selected && !correct.has(key);

        return (
          <button
            key={key}
            ref={(el) => {
              refs.current[key] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={locked}
            tabIndex={selected || (idx === 0 && answer.selected.length === 0) ? 0 : -1}
            onClick={() => onSelect(key)}
            onKeyDown={(e) => onKeyDown(e, idx)}
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
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                selected ? "border-brand bg-brand text-brand-fg" : "border-muted text-muted",
                isCorrect && "border-correct bg-correct text-white",
                isWrongPick && "border-incorrect bg-incorrect text-white",
              )}
            >
              {key}
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
