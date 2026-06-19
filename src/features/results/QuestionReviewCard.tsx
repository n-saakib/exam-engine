"use client";

import { useState } from "react";
import type { ResultsQuestion, Outcome } from "@/domain/types";
import { cn } from "@/lib/cn";

// ── Outcome styling ───────────────────────────────────────────────────────────

const OUTCOME_STYLES: Record<Outcome, { border: string; badge: string; label: string }> = {
  correct: {
    border: "border-correct/40",
    badge: "bg-correct/10 text-correct",
    label: "Correct",
  },
  incorrect: {
    border: "border-incorrect/40",
    badge: "bg-incorrect/10 text-incorrect",
    label: "Incorrect",
  },
  gave_up: {
    border: "border-warning/40",
    badge: "bg-warning/10 text-warning",
    label: "Gave up",
  },
};

// ── Display letter ↔ underlying key mapping (ADR-15) ─────────────────────────

/** Display letters used as chip labels, in canonical order. */
const DISPLAY_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** Display letters that exist on this question, in display order. */
function displayLetters(question: ResultsQuestion): string[] {
  const total = Object.keys(question.options).length;
  return DISPLAY_LETTERS.slice(0, total);
}

/**
 * Reverse-map an underlying option key to the display letter the user saw
 * during the exam. With `optionOrder = [B, C, A, D]`, the underlying "B"
 * was shown at chip A, so this returns "A" for input "B". When the
 * snapshot has no `optionOrder` (or the key is missing from it) we fall
 * back to natural alphabetical mapping via the sorted option map.
 */
function displayLetterFor(
  question: ResultsQuestion,
  underlyingKey: string,
): string {
  const order = question.optionOrder;
  if (order) {
    const idx = order.indexOf(underlyingKey);
    if (idx >= 0 && idx < DISPLAY_LETTERS.length) {
      return DISPLAY_LETTERS[idx]!;
    }
  }
  // Fallback: natural alphabetical order (sorted option keys).
  const sorted = Object.keys(question.options).sort();
  const idx = sorted.indexOf(underlyingKey);
  if (idx >= 0 && idx < DISPLAY_LETTERS.length) {
    return DISPLAY_LETTERS[idx]!;
  }
  return underlyingKey;
}

// ── QuestionReviewCard ────────────────────────────────────────────────────────

interface QuestionReviewCardProps {
  question: ResultsQuestion;
}

/**
 * Per-question review card: your answer vs correct answer, all per-option
 * explanations, Tips, and outcome styling.
 *
 * ADR-15: the review surface mirrors the live exam view. Options render in
 * the same shuffled order the user saw during the exam, with chip labels
 * A, B, C, D and the underlying-key→display-letter reverse map applied to
 * `correctAnswer` and `yourAnswer`. This way "Correct answer: A" matches
 * the option the user actually clicked.
 */
export function QuestionReviewCard({ question }: QuestionReviewCardProps) {
  const [showExplanations, setShowExplanations] = useState(false);
  const { outcome } = question;
  const style = OUTCOME_STYLES[outcome];

  // Reverse-map underlying keys → display letters (A, B, C, D) so the
  // "Correct answer" / "Your answer" summary shows the same letter the user
  // saw on the chip they clicked. Display letters are sorted alphabetically
  // so multi-answer lists read naturally ("A, B, C" rather than the order
  // they appeared in the underlying optionOrder array).
  const correctAnswerDisplay = Array.isArray(question.correctAnswer)
    ? question.correctAnswer
        .map((k) => displayLetterFor(question, k))
        .sort()
        .join(", ")
    : displayLetterFor(question, question.correctAnswer);
  const yourAnswerDisplay =
    question.yourAnswer.length > 0
      ? question.yourAnswer
          .map((k) => displayLetterFor(question, k))
          .sort()
          .join(", ")
      : "—";

  // Build the option list in display order (A, B, C, D), with the underlying
  // key for each display position derived from `optionOrder` (same as
  // OptionList.tsx on the live exam). This guarantees the option the user
  // saw at chip A during the exam is the same option rendered at chip A
  // here.
  const rows = displayLetters(question).map((displayLetter, i) => {
    const order = question.optionOrder;
    const underlying =
      order && i < order.length && order[i] && order[i]! in question.options
        ? order[i]!
        : displayLetter;
    return { displayLetter, underlying };
  });

  return (
    <article
      className={cn(
        "rounded-card border bg-surface p-4 flex flex-col gap-3",
        style.border,
      )}
      aria-label={`Question ${question.order}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">Q{question.order}</span>
          {question.flagged && (
            <span
              aria-label="Flagged"
              className="inline-block h-2 w-2 rounded-full bg-flagged"
            />
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
            style.badge,
          )}
        >
          {style.label}
        </span>
      </div>

      {/* Question text */}
      <p className="text-sm text-fg leading-relaxed">{question.questionText}</p>

      {/* Options */}
      <ul className="flex flex-col gap-1.5" aria-label="Answer options">
        {rows.map(({ displayLetter, underlying }) => {
          const isCorrect = Array.isArray(question.correctAnswer)
            ? question.correctAnswer.includes(underlying)
            : question.correctAnswer === underlying;
          const wasSelected = question.yourAnswer.includes(underlying);

          let optionStyle = "border-border text-muted";
          let indicator = null;

          if (isCorrect && wasSelected) {
            optionStyle = "border-correct/50 bg-correct/5 text-fg";
            indicator = <span className="text-correct text-xs font-bold ml-auto" aria-label="Correct answer, selected">✓</span>;
          } else if (isCorrect) {
            optionStyle = "border-correct/50 bg-correct/5 text-fg";
            indicator = <span className="text-correct text-xs font-bold ml-auto" aria-label="Correct answer">✓</span>;
          } else if (wasSelected) {
            optionStyle = "border-incorrect/50 bg-incorrect/5 text-fg";
            indicator = <span className="text-incorrect text-xs font-bold ml-auto" aria-label="Your incorrect selection">✗</span>;
          }

          return (
            <li
              key={displayLetter}
              className={cn(
                "flex items-center gap-2 rounded border px-3 py-2 text-sm",
                optionStyle,
              )}
            >
              <span className="font-mono font-semibold shrink-0">{displayLetter}.</span>
              <span className="flex-1">{question.options[underlying]}</span>
              {indicator}
            </li>
          );
        })}
      </ul>

      {/* Your answer / correct answer summary */}
      <div className="flex flex-wrap gap-4 text-xs text-muted border-t border-border pt-2">
        <span>
          Your answer:{" "}
          <strong className={outcome === "correct" ? "text-correct" : "text-incorrect"}>
            {yourAnswerDisplay}
          </strong>
        </span>
        <span>
          Correct answer:{" "}
          <strong className="text-correct">{correctAnswerDisplay}</strong>
        </span>
      </div>

      {/* Explanations + Tips (collapsed by default) */}
      {Object.keys(question.explanations).length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowExplanations((v) => !v)}
            className="text-xs text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
            aria-expanded={showExplanations}
            aria-controls={`explanations-${question.id}-${question.order}`}
          >
            {showExplanations ? "Hide explanations" : "Show explanations"}
          </button>

          {showExplanations && (
            <div
              id={`explanations-${question.id}-${question.order}`}
              className="mt-2 flex flex-col gap-2"
            >
              {rows.map(({ displayLetter, underlying }) => {
                const exp = question.explanations[underlying];
                if (!exp) return null;
                const isCorrectOpt = Array.isArray(question.correctAnswer)
                  ? question.correctAnswer.includes(underlying)
                  : question.correctAnswer === underlying;

                return (
                  <div key={displayLetter} className="text-xs rounded bg-bg border border-border p-2">
                    <p className="font-semibold text-fg mb-0.5">
                      {displayLetter}.{" "}
                      <span className={isCorrectOpt ? "text-correct" : "text-muted"}>
                        {exp.description}
                      </span>
                    </p>
                    <p className="text-muted leading-relaxed">{exp.reason}</p>
                  </div>
                );
              })}

              {question.Tips && (
                <div className="mt-1 rounded bg-brand/5 border border-brand/20 p-2 text-xs">
                  <p className="font-semibold text-brand mb-0.5">Tip</p>
                  <p className="text-fg">{question.Tips}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
