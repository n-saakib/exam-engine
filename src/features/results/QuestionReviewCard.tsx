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
  revealed: {
    border: "border-revealed/40",
    badge: "bg-revealed/10 text-revealed",
    label: "Revealed",
  },
  unanswered: {
    border: "border-border",
    badge: "bg-surface text-muted",
    label: "Unanswered",
  },
};

// ── QuestionReviewCard ────────────────────────────────────────────────────────

interface QuestionReviewCardProps {
  question: ResultsQuestion;
}

/**
 * Per-question review card: your answer vs correct answer, all per-option
 * explanations, Tips, and outcome styling.
 */
export function QuestionReviewCard({ question }: QuestionReviewCardProps) {
  const [showExplanations, setShowExplanations] = useState(false);
  const { outcome } = question;
  const style = OUTCOME_STYLES[outcome];

  const correctAnswerStr = Array.isArray(question.correctAnswer)
    ? question.correctAnswer.join(", ")
    : question.correctAnswer;

  const yourAnswerStr =
    question.yourAnswer.length > 0 ? question.yourAnswer.join(", ") : "—";

  // Determine which options to display (respect optionOrder if present, else sorted).
  const optionKeys = Object.keys(question.options).sort();

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
        {optionKeys.map((key) => {
          const isCorrect = Array.isArray(question.correctAnswer)
            ? question.correctAnswer.includes(key)
            : question.correctAnswer === key;
          const wasSelected = question.yourAnswer.includes(key);

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
              key={key}
              className={cn(
                "flex items-center gap-2 rounded border px-3 py-2 text-sm",
                optionStyle,
              )}
            >
              <span className="font-mono font-semibold shrink-0">{key}.</span>
              <span className="flex-1">{question.options[key]}</span>
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
            {yourAnswerStr}
          </strong>
        </span>
        <span>
          Correct answer:{" "}
          <strong className="text-correct">{correctAnswerStr}</strong>
        </span>
        {question.confidence && (
          <span>
            Confidence: <strong className="text-fg capitalize">{question.confidence}</strong>
          </span>
        )}
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
              {optionKeys.map((key) => {
                const exp = question.explanations[key];
                if (!exp) return null;
                const isCorrectOpt = Array.isArray(question.correctAnswer)
                  ? question.correctAnswer.includes(key)
                  : question.correctAnswer === key;

                return (
                  <div key={key} className="text-xs rounded bg-bg border border-border p-2">
                    <p className="font-semibold text-fg mb-0.5">
                      {key}.{" "}
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
