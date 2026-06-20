"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Spinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { useResults } from "@/hooks/useResults";

import { ScoreSummaryCard } from "./ScoreSummaryCard";
import { ResultsActions } from "./ResultsActions";
import { DetailFilterBar, type ReviewFilter } from "./DetailFilterBar";
import { QuestionReviewList } from "./QuestionReviewList";
import type { ResultsQuestion } from "@/domain/types";

// ── Filter logic ──────────────────────────────────────────────────────────────

function applyFilter(questions: ResultsQuestion[], filter: ReviewFilter): ResultsQuestion[] {
  switch (filter) {
    case "correct":
      return questions.filter((q) => q.outcome === "correct");
    case "incorrect":
      // "Incorrect" is explicit wrong picks only. Revealed-without-picking is
      // folded into "gave_up" post-submit (see ScoreCalculator); questions the
      // user left blank at submit time are likewise "gave_up".
      return questions.filter((q) => q.outcome === "incorrect");
    case "gave_up":
      return questions.filter((q) => q.outcome === "gave_up");
    case "flagged":
      return questions.filter((q) => q.flagged);
    case "all":
    default:
      return questions;
  }
}

const FILTER_LABELS: Record<ReviewFilter, string> = {
  all: "All",
  correct: "Correct",
  incorrect: "Incorrect",
  gave_up: "Gave up",
  flagged: "Flagged",
};

// ── ResultsScreen ─────────────────────────────────────────────────────────────

export type ResultsMode = "post-exam" | "from-history";

interface ResultsScreenProps {
  /** Session id to display. */
  sessionId: string;
  /**
   * "post-exam" = just submitted, back affordance goes Home.
   * "from-history" = opened from history list, back affordance goes /history.
   *
   * Only the header/back affordance changes; all data + layout is the same.
   * F7 imports this component and passes `mode="from-history"`.
   */
  mode?: ResultsMode;
}

/**
 * The results / review screen (F5-T5, 04 §4.3). Fetches the results DTO via
 * `useResults`, renders a ScoreSummaryCard, ResultsActions, a client-side
 * DetailFilterBar, and the QuestionReviewList.
 *
 * Exported as a named export so /history/:id (F7) can reuse it:
 *   import { ResultsScreen } from "@/features/results/ResultsScreen";
 */
export function ResultsScreen({ sessionId, mode = "post-exam" }: ResultsScreenProps) {
  const router = useRouter();
  const { data, isLoading, isError, error } = useResults(sessionId);
  const [filter, setFilter] = useState<ReviewFilter>("all");

  const filteredQuestions = useMemo(
    () => (data ? applyFilter(data.questions, filter) : []),
    [data, filter],
  );

  const filterCounts = useMemo(() => {
    if (!data) return { all: 0, correct: 0, incorrect: 0, gaveUp: 0, flagged: 0 };
    return {
      all: data.questions.length,
      correct: data.questions.filter((q) => q.outcome === "correct").length,
      // "Incorrect" is explicit wrong picks only — give-ups and
      // blank-at-submit are tallied into gaveUp by ScoreCalculator.
      incorrect: data.questions.filter((q) => q.outcome === "incorrect").length,
      gaveUp: data.questions.filter((q) => q.outcome === "gave_up").length,
      flagged: data.questions.filter((q) => q.flagged).length,
    };
  }, [data]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12" aria-label="Loading results">
        <Spinner />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <div className="p-6">
        <EmptyState
          title="Couldn't load results"
          description={
            error instanceof Error ? error.message : "Unknown error loading this session."
          }
        />
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => router.push("/")}>
            Go home
          </Button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const backLabel = mode === "from-history" ? "Back to history" : undefined;
  const backHref = mode === "from-history" ? "/history" : undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      {/* Page header */}
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-fg">
            {mode === "from-history" ? "Review" : "Your Results"}
          </h1>
          {data.completedAt && (
            <p className="text-xs text-muted">
              Completed {new Date(data.completedAt).toLocaleString()}
            </p>
          )}
        </div>
        {backLabel && backHref && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(backHref)}
            aria-label={backLabel}
          >
            {backLabel}
          </Button>
        )}
      </header>

      {/* Score summary */}
      <ScoreSummaryCard results={data} />

      {/* Actions: bookmark, note, retake, home */}
      <ResultsActions results={data} />

      {/* Detailed review */}
      <section aria-label="Detailed question review">
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-fg">Question review</h2>
        </div>

        <div className="mb-4">
          <DetailFilterBar
            activeFilter={filter}
            onFilterChange={setFilter}
            counts={filterCounts}
          />
        </div>

        <QuestionReviewList
          questions={filteredQuestions}
          filterLabel={FILTER_LABELS[filter]}
        />
      </section>
    </div>
  );
}
