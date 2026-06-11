"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { useReview, useRetake } from "@/hooks/useResults";
import type { Results } from "@/domain/types";
import { cn } from "@/lib/cn";

// ── BookmarkToggle ────────────────────────────────────────────────────────────

interface BookmarkToggleProps {
  sessionId: string;
  isBookmarked: boolean;
}

/**
 * Optimistic bookmark toggle with rollback on error (F5-T9).
 */
export function BookmarkToggle({ sessionId, isBookmarked }: BookmarkToggleProps) {
  const { toast } = useToast();
  const review = useReview(sessionId);

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
      onClick={handleToggle}
      disabled={review.isPending}
      aria-label={isBookmarked ? "Remove bookmark" : "Bookmark this session"}
      aria-pressed={isBookmarked}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-card px-3 py-2 text-sm font-medium border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        isBookmarked
          ? "bg-flagged/10 border-flagged/40 text-flagged"
          : "bg-surface border-border text-muted hover:bg-bg",
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
      {isBookmarked ? "Bookmarked" : "Bookmark"}
    </button>
  );
}

// ── NoteEditor ────────────────────────────────────────────────────────────────

const NOTE_DEBOUNCE_MS = 600;

interface NoteEditorProps {
  sessionId: string;
  initialNote: string | null;
}

/**
 * Inline note editor with debounced save (F5-T9). Shows a save indicator.
 */
export function NoteEditor({ sessionId, initialNote }: NoteEditorProps) {
  const [value, setValue] = useState(initialNote ?? "");
  const [savedIndicator, setSavedIndicator] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const review = useReview(sessionId);
  const { toast } = useToast();

  // Keep local state in sync if the prop changes (e.g. after an external mutation).
  const prevNoteRef = useRef(initialNote);
  useEffect(() => {
    if (prevNoteRef.current !== initialNote && initialNote !== value) {
      setValue(initialNote ?? "");
    }
    prevNoteRef.current = initialNote;
  }, [initialNote, value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      setValue(next);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        review.mutate(
          { note: next.trim() === "" ? null : next },
          {
            onSuccess: () => {
              setSavedIndicator(true);
              setTimeout(() => setSavedIndicator(false), 1500);
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
      }, NOTE_DEBOUNCE_MS);
    },
    [review, toast],
  );

  // Flush on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="session-note" className="text-xs font-medium text-muted">
        Note
      </label>
      <textarea
        id="session-note"
        value={value}
        onChange={handleChange}
        placeholder="Add a study note..."
        rows={3}
        className={cn(
          "w-full rounded-card border border-border bg-bg px-3 py-2 text-sm text-fg",
          "placeholder:text-muted resize-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
        )}
      />
      {savedIndicator && (
        <span className="text-xs text-correct" role="status" aria-live="polite">
          Saved
        </span>
      )}
    </div>
  );
}

// ── RetakeMenu ────────────────────────────────────────────────────────────────

interface RetakeMenuProps {
  sessionId: string;
  hasIncorrectOrRevealed: boolean;
}

/**
 * Retake actions: "Retake all" and the primary CTA "Retake incorrect only"
 * (disabled when no incorrect/revealed exist). Navigates to the new exam on
 * success (F5-T9, F5-T11).
 */
export function RetakeMenu({ sessionId, hasIncorrectOrRevealed }: RetakeMenuProps) {
  const { toast } = useToast();
  const retake = useRetake(sessionId);

  const handleRetake = useCallback(
    (scope: "all" | "incorrect") => {
      retake.mutate(
        { scope },
        {
          onError: (err) => {
            const message =
              err instanceof Error ? err.message : "Could not start retake.";
            toast({
              title: "Retake failed",
              description: message,
              variant: "danger",
            });
          },
        },
      );
    },
    [retake, toast],
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Primary CTA — Retake incorrect only */}
      <Button
        variant="primary"
        size="md"
        disabled={!hasIncorrectOrRevealed || retake.isPending}
        onClick={() => handleRetake("incorrect")}
        aria-label="Retake only the incorrect and revealed questions"
        title={
          !hasIncorrectOrRevealed
            ? "No incorrect or revealed questions to retake"
            : undefined
        }
      >
        {retake.isPending ? "Starting…" : "Retake incorrect only"}
      </Button>

      {/* Secondary — Retake all */}
      <Button
        variant="secondary"
        size="md"
        disabled={retake.isPending}
        onClick={() => handleRetake("all")}
        aria-label="Retake all questions from the beginning"
      >
        Retake all questions
      </Button>
    </div>
  );
}

// ── ResultsActions (composed panel) ──────────────────────────────────────────

interface ResultsActionsProps {
  results: Results;
}

/**
 * Composed actions panel: BookmarkToggle, NoteEditor, RetakeMenu, and a
 * Home/Back button.
 */
export function ResultsActions({ results }: ResultsActionsProps) {
  const router = useRouter();

  const hasIncorrectOrRevealed =
    results.summary.incorrect > 0 || results.summary.revealed > 0;

  return (
    <section
      className="rounded-card border border-border bg-surface p-5 flex flex-col gap-4"
      aria-label="Session actions"
    >
      {/* Bookmark + Home row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <BookmarkToggle
          sessionId={results.id}
          isBookmarked={results.isBookmarked}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/")}
          aria-label="Go to home screen"
        >
          Home
        </Button>
      </div>

      {/* Note */}
      <NoteEditor sessionId={results.id} initialNote={results.note} />

      {/* Retake */}
      <RetakeMenu
        sessionId={results.id}
        hasIncorrectOrRevealed={hasIncorrectOrRevealed}
      />
    </section>
  );
}
