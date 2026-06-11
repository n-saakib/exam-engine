"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { useReview, useRetake } from "@/hooks/useResults";
import type { HistoryRow as HistoryRowType } from "@/domain/types";
import { cn } from "@/lib/cn";

// ── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function scoreClass(score: number): string {
  if (score >= 80) return "text-correct";
  if (score >= 50) return "text-revealed";
  return "text-incorrect";
}

// ── InlineBookmarkToggle ─────────────────────────────────────────────────────

interface InlineBookmarkToggleProps {
  sessionId: string;
  isBookmarked: boolean;
}

function InlineBookmarkToggle({ sessionId, isBookmarked }: InlineBookmarkToggleProps) {
  const review = useReview(sessionId);
  const { toast } = useToast();

  const handleToggle = useCallback(() => {
    review.mutate(
      { isBookmarked: !isBookmarked },
      {
        onError: () => {
          toast({
            title: "Could not update bookmark",
            description: "Please try again.",
            variant: "danger",
          });
        },
      },
    );
  }, [isBookmarked, review, toast]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleToggle();
      }}
      disabled={review.isPending}
      aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
      aria-pressed={isBookmarked}
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        "disabled:pointer-events-none disabled:opacity-50",
        isBookmarked
          ? "text-flagged"
          : "text-muted hover:text-fg",
      )}
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill={isBookmarked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
    </button>
  );
}

// ── InlineNoteEditor ──────────────────────────────────────────────────────────

interface InlineNoteEditorProps {
  sessionId: string;
  hasNote: boolean;
}

function InlineNoteEditor({ sessionId, hasNote }: InlineNoteEditorProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const review = useReview(sessionId);
  const { toast } = useToast();

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!open && !loaded) {
        // On first open, the parent row will have the note in expanded detail.
        // We start with empty and the user types from scratch or edits.
        setLoaded(true);
      }
      setOpen((prev) => !prev);
    },
    [open, loaded],
  );

  const handleSave = useCallback(() => {
    review.mutate(
      { note: value.trim() || null },
      {
        onSuccess: () => {
          toast({ title: "Note saved", variant: "success" });
          setOpen(false);
        },
        onError: () => {
          toast({
            title: "Could not save note",
            description: "Please try again.",
            variant: "danger",
          });
        },
      },
    );
  }, [review, toast, value]);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleOpen}
        aria-label={hasNote ? "Edit note" : "Add note"}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
        {hasNote ? "Note" : "Add note"}
      </button>
      {open && (
        <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type a note..."
            rows={2}
            className="w-48 rounded border border-muted/30 bg-bg px-2 py-1 text-xs text-fg placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-brand"
            aria-label="Session note"
            autoFocus
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={review.isPending}
              className="rounded bg-brand px-2 py-0.5 text-xs text-white hover:opacity-90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand"
            >
              Save
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              className="rounded px-2 py-0.5 text-xs text-muted hover:text-fg focus:outline-none focus:ring-2 focus:ring-brand"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

// ── HistoryRow ────────────────────────────────────────────────────────────────

interface HistoryRowProps {
  row: HistoryRowType;
}

/**
 * HistoryRow — one row in the history table (F7-T9). Expandable to show a
 * summary with View details and Retake actions. Inline BookmarkToggle and
 * NoteEditor reuse F5's useReview + useRetake hooks.
 */
export function HistoryRow({ row }: HistoryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const retake = useRetake(row.id);
  const { toast } = useToast();

  const handleRetake = useCallback(
    (scope: "all" | "incorrect") => {
      retake.mutate(
        { scope },
        {
          onError: (err) => {
            const message =
              err instanceof Error ? err.message : "Could not start retake.";
            toast({ title: "Retake failed", description: message, variant: "danger" });
          },
        },
      );
    },
    [retake, toast],
  );

  return (
    <li className="border-b border-muted/10 last:border-0">
      {/* Main row */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="w-full text-left"
      >
        <div className="flex items-center gap-2 px-4 py-3 hover:bg-muted/5 transition-colors">
          {/* Date */}
          <span className="w-24 shrink-0 text-xs text-muted">
            {formatDate(row.completedAt)}
          </span>
          {/* Domain */}
          <span className="flex-1 truncate text-sm text-fg" title={row.domainLabel}>
            {row.domainLabel}
          </span>
          {/* Difficulty */}
          <span className="w-20 shrink-0 text-xs text-muted">
            {row.difficulty}
          </span>
          {/* Score */}
          <span
            className={cn("w-16 shrink-0 text-right text-sm font-semibold", scoreClass(row.scorePercent))}
          >
            {row.scorePercent}%
          </span>
          {/* Time */}
          <span className="w-20 shrink-0 text-right text-xs text-muted">
            {formatTime(row.timeTakenMs)}
          </span>
          {/* Bookmark inline */}
          <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <InlineBookmarkToggle sessionId={row.id} isBookmarked={row.isBookmarked} />
          </span>
          {/* Expand indicator */}
          <svg
            aria-hidden="true"
            className={cn("h-4 w-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded summary */}
      {expanded && (
        <div className="border-t border-muted/10 bg-muted/5 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {/* Summary text */}
            <div className="flex flex-col gap-1 text-sm text-muted">
              <p>
                <span className="font-medium text-fg">{row.setTitle}</span>
              </p>
              <p>
                Completed {new Date(row.completedAt).toLocaleString()} &middot;{" "}
                {row.difficulty} &middot; {formatTime(row.timeTakenMs)}
              </p>
              <p>
                Score:{" "}
                <span className={cn("font-bold", scoreClass(row.scorePercent))}>
                  {row.scorePercent}%
                </span>
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:items-end">
              <Link
                href={`/history/${row.id}`}
                className={cn(
                  "inline-flex h-8 items-center justify-center rounded-card px-3 text-sm font-medium transition-opacity",
                  "bg-surface text-fg border border-border hover:bg-bg",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                )}
              >
                View details
              </Link>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={retake.isPending}
                  onClick={() => handleRetake("incorrect")}
                  aria-label="Retake incorrect questions"
                >
                  {retake.isPending ? "Starting…" : "Retake incorrect"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={retake.isPending}
                  onClick={() => handleRetake("all")}
                  aria-label="Retake all questions"
                >
                  Retake all
                </Button>
              </div>
            </div>
          </div>

          {/* Inline note editor */}
          <div className="mt-3 border-t border-muted/10 pt-3">
            <InlineNoteEditor sessionId={row.id} hasNote={row.hasNote} />
          </div>
        </div>
      )}
    </li>
  );
}
