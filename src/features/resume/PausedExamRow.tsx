"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { useGlobalDialogs } from "@/features/shell/GlobalDialogs";
import { apiClient } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { SessionListRow, SessionList } from "@/domain/types";

import { formatElapsedMs, formatPausedAt } from "./formatters";

// ── ResumeButton ──────────────────────────────────────────────────────────────

interface ResumeButtonProps {
  sessionId: string;
}

/**
 * Navigates to /exam/:id to resume the paused session at the exact saved
 * position (F4 ExamScreen rehydrates from the live DTO on mount).
 */
export function ResumeButton({ sessionId }: ResumeButtonProps) {
  const router = useRouter();

  return (
    <Button
      variant="primary"
      size="sm"
      aria-label="Resume exam"
      onClick={() => router.push(`/exam/${sessionId}`)}
    >
      Resume
    </Button>
  );
}

// ── DiscardButton ─────────────────────────────────────────────────────────────

interface DiscardButtonProps {
  session: SessionListRow;
}

/**
 * Prompts for confirmation via the global dialog, then DELETEs the session.
 * Performs an optimistic removal from the `['sessions', 'in_progress']` cache
 * and rolls back on error. On success, also invalidates `['inProgressCount']`
 * so the MenuBar badge decrements immediately.
 */
export function DiscardButton({ session }: DiscardButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const { confirm } = useGlobalDialogs();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDiscard = async () => {
    const confirmed = await confirm({
      title: "Discard exam?",
      description: `This will permanently remove your progress for "${session.setTitle}". This cannot be undone.`,
      confirmLabel: "Discard",
      cancelLabel: "Keep",
      variant: "danger",
    });

    if (!confirmed) return;

    // Snapshot current cache for rollback.
    const key = queryKeys.sessions("in_progress");
    await queryClient.cancelQueries({ queryKey: key });
    const snapshot = queryClient.getQueryData<SessionList>(key);

    // Optimistic removal.
    if (snapshot) {
      queryClient.setQueryData<SessionList>(key, {
        ...snapshot,
        items: snapshot.items.filter((item) => item.id !== session.id),
        total: Math.max(0, snapshot.total - 1),
      });
    }

    setIsPending(true);
    try {
      await apiClient.delete<void>(`/sessions/${session.id}`);

      // Invalidate both keys so badge + list are fresh.
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.inProgressCount(),
      });
    } catch (err) {
      // Rollback optimistic change.
      if (snapshot) {
        queryClient.setQueryData(key, snapshot);
      }
      const message =
        err instanceof Error ? err.message : "Could not discard the exam.";
      toast({
        title: "Failed to discard",
        description: message,
        variant: "danger",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Discard exam"
      disabled={isPending}
      onClick={handleDiscard}
    >
      {isPending ? "Discarding…" : "Discard"}
    </Button>
  );
}

// ── ProgressChip ──────────────────────────────────────────────────────────────

function ProgressChip({ percent }: { percent: number }) {
  const display = Math.round(percent);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
      aria-label={`${display}% answered`}
    >
      {display}% answered
    </span>
  );
}

// ── PausedExamRow ─────────────────────────────────────────────────────────────

interface PausedExamRowProps {
  session: SessionListRow;
}

/**
 * One row in the paused-exams list. Shows domain path, set title/difficulty,
 * progress chip, elapsed time, and last-paused date.
 * Contains Resume and Discard action buttons.
 */
export function PausedExamRow({ session }: PausedExamRowProps) {
  return (
    <Card
      as="article"
      aria-label={`Paused exam: ${session.setTitle}`}
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      {/* Left: context info */}
      <div className="min-w-0 flex-1 space-y-1">
        {/* Domain path */}
        <p className="text-xs text-muted">{session.domainLabel}</p>

        {/* Title + difficulty */}
        <h3 className="truncate font-semibold text-fg">{session.setTitle}</h3>
        <p className="text-xs text-muted capitalize">{session.difficulty}</p>

        {/* Chips row */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <ProgressChip percent={session.percentAnswered} />
          <span className="text-xs text-muted" aria-label={`Elapsed time: ${formatElapsedMs(session.timeElapsedMs)}`}>
            {formatElapsedMs(session.timeElapsedMs)} elapsed
          </span>
          <span className="text-xs text-muted" aria-label={`Last paused at ${formatPausedAt(session.pausedAt)}`}>
            Paused {formatPausedAt(session.pausedAt)}
          </span>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex shrink-0 gap-2">
        <DiscardButton session={session} />
        <ResumeButton sessionId={session.id} />
      </div>
    </Card>
  );
}
