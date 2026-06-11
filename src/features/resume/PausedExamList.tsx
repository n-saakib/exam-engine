"use client";

import { EmptyState } from "@/components/EmptyState";
import { Spinner } from "@/components/Spinner";
import type { SessionListRow } from "@/domain/types";

import { PausedExamRow } from "./PausedExamRow";

interface PausedExamListProps {
  items: SessionListRow[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Renders the list of in-progress sessions. Handles loading, error, empty, and
 * populated states. Each row delegates to `<PausedExamRow>`.
 */
export function PausedExamList({ items, isLoading, isError }: PausedExamListProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-16" aria-label="Loading paused exams">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="Could not load paused exams"
        description="Something went wrong. Please try refreshing the page."
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No paused exams"
        description="When you pause an exam it will appear here. Start a new exam from Home to begin."
        aria-label="No paused exams"
      />
    );
  }

  return (
    <ul className="space-y-3" aria-label="Paused exams list">
      {items.map((session) => (
        <li key={session.id}>
          <PausedExamRow session={session} />
        </li>
      ))}
    </ul>
  );
}
