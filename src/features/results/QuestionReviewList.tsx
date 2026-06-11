"use client";

import type { ResultsQuestion } from "@/domain/types";
import { QuestionReviewCard } from "./QuestionReviewCard";

interface QuestionReviewListProps {
  questions: ResultsQuestion[];
  /** Optional label for the current active filter (used in the empty state). */
  filterLabel?: string;
}

/**
 * Renders a vertical list of QuestionReviewCards, one per question.
 * The parent is responsible for filtering; this component only renders
 * what it receives.
 */
export function QuestionReviewList({ questions, filterLabel }: QuestionReviewListProps) {
  if (questions.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-muted">
        No questions match the &ldquo;{filterLabel ?? "current"}&rdquo; filter.
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-3" aria-label="Question review list">
      {questions.map((q) => (
        <li key={`${q.id}-${q.order}`}>
          <QuestionReviewCard question={q} />
        </li>
      ))}
    </ol>
  );
}
