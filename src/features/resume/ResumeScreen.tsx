"use client";

import { useInProgressSessions } from "@/hooks/useInProgressSessions";
import { PausedExamList } from "./PausedExamList";

/**
 * ResumeScreen (F6-T4, 04 §4.4).
 *
 * Lists all in-progress sessions sorted by most-recent activity, with one
 * `<PausedExamRow>` per session carrying Resume and Discard actions.
 * Renders an `<EmptyState>` when no sessions are in progress.
 *
 * Data: `useInProgressSessions()` (React Query, key `['sessions','in_progress']`).
 * Mutations (discard) are owned by `<DiscardButton>` inside `<PausedExamRow>`.
 * Navigation (resume) is owned by `<ResumeButton>` inside `<PausedExamRow>`.
 */
export function ResumeScreen() {
  const { items, isLoading, isError } = useInProgressSessions();

  return (
    <section className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-fg">Resume</h1>
        <p className="mt-1 text-sm text-muted">
          Pick up where you left off, or discard sessions you no longer need.
        </p>
      </header>

      <PausedExamList items={items} isLoading={isLoading} isError={isError} />
    </section>
  );
}
