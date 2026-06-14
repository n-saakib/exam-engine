"use client";

import { forwardRef } from "react";

import { Card } from "@/components/Card";
import type { ExamStore } from "@/store/examStore";
import { OptionList } from "./OptionList";
import { RevealedDetail } from "./RevealedDetail";
import { ConfidenceRating } from "./ConfidenceRating";

/**
 * The current question (F4-T16). Subscribes to the current question + its
 * answer state only. Focus is moved here on navigation (the screen focuses the
 * heading ref). Post-reveal it shows correctness styling + <RevealedDetail>.
 */
export const QuestionPanel = forwardRef<
  HTMLHeadingElement,
  { store: ExamStore; progressiveReveal: boolean }
>(function QuestionPanel({ store, progressiveReveal }, headingRef) {
  const currentIndex = store((s) => s.currentIndex);
  const question = store((s) => s.questions[s.currentIndex]);
  const answer = store((s) => {
    const q = s.questions[s.currentIndex];
    return q ? s.answers[q.id] : undefined;
  });
  const select = store((s) => s.select);
  const setConfidence = store((s) => s.setConfidence);

  if (!question || !answer) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h2
          ref={headingRef}
          id={`question-${question.id}`}
          tabIndex={-1}
          className="text-lg font-semibold leading-snug focus:outline-none"
          data-testid="question-text"
        >
          <span className="mr-2 text-muted">Q{currentIndex + 1}.</span>
          {question.questionText}
        </h2>
      </div>

      <OptionList
        question={question}
        answer={answer}
        onSelect={(option) => select(question.id, option)}
      />

      {answer.revealed ? (
        <RevealedDetail question={question} progressive={progressiveReveal} />
      ) : null}

      <div className="border-t border-border pt-3">
        <ConfidenceRating
          value={answer.confidence}
          onChange={(c) => setConfidence(question.id, c)}
        />
      </div>
    </Card>
  );
});
