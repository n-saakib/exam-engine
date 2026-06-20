"use client";

import { useState } from "react";

import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { useGlobalDialogs } from "@/features/shell/GlobalDialogs";
import { cn } from "@/lib/cn";
import type { ExamStore } from "@/store/examStore";

/** Flag toggle for the current question (F4-T19). */
export function FlagButton({ store }: { store: ExamStore }) {
  const flagged = store((s) => {
    const q = s.questions[s.currentIndex];
    return q ? !!s.answers[q.id]?.flagged : false;
  });
  const toggleFlag = store((s) => s.toggleFlag);
  const qid = store((s) => s.questions[s.currentIndex]?.id);

  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={flagged}
      onClick={() => qid !== undefined && toggleFlag(qid)}
      className={cn(flagged && "border-flagged text-flagged")}
    >
      <span aria-hidden="true" className="mr-1">
        ⚑
      </span>
      {flagged ? "Flagged" : "Flag"}
    </Button>
  );
}

/** Previous-question button (F4-T19). */
export function PrevButton({ store }: { store: ExamStore }) {
  const currentIndex = store((s) => s.currentIndex);
  const goTo = store((s) => s.goTo);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={currentIndex <= 0}
      onClick={() => goTo(currentIndex - 1)}
    >
      Previous
    </Button>
  );
}

/** Next on all but the last question; "Submit" (opens dialog) on the last (F4-T19). */
export function SubmitOrNextButton({
  store,
  onRequestSubmit,
}: {
  store: ExamStore;
  onRequestSubmit: () => void;
}) {
  const currentIndex = store((s) => s.currentIndex);
  const total = store((s) => s.questions.length);
  const goTo = store((s) => s.goTo);
  const isLast = currentIndex >= total - 1;

  if (isLast) {
    return (
      <Button variant="primary" size="sm" onClick={onRequestSubmit}>
        Submit exam
      </Button>
    );
  }
  return (
    <Button variant="primary" size="sm" onClick={() => goTo(currentIndex + 1)}>
      Next
    </Button>
  );
}

/**
 * Submit-or-give-up button (F4-T22). The label and post-confirm action depend
 * on whether the user has selected at least one option for the current
 * question:
 *
 *   - 0 selected, any question  → label "Give up"; on confirm, commit the
 *     question as `gave_up` and surface the correct answer inline.
 *   - ≥1 selected, any question → label "Submit answer"; on confirm, commit the
 *     selection (graded answer + explanations appear inline). No navigation,
 *     no exam finalisation — those are owned by the Next / Submit-exam button.
 *
 * Critically, this button never finalises the exam, even on the last
 * question. Finalising the exam is the responsibility of the dedicated
 * `Submit exam` button (`SubmitOrNextButton` on the navigation row), so a
 * single click on "Submit answer" cannot accidentally end the user's session.
 *
 * Both branches share the same code path: `store.commit(qid)` writes
 * `is_committed = 1` server-side and surfaces `correctAnswer` /
 * `explanations` / `Tips` on the question in the live DTO. The `gaveUp`
 * flag is sticky and only set when the caller opts in (no-selection case).
 */
export function SubmitOrGiveUpButton({ store }: { store: ExamStore }) {
  const commit = store((s) => s.commit);
  const qid = store((s) => s.questions[s.currentIndex]?.id);
  const committed = store((s) => {
    const q = s.questions[s.currentIndex];
    return q ? !!s.answers[q.id]?.committed : false;
  });
  const selectedCount = store((s) => {
    const q = s.questions[s.currentIndex];
    return q ? s.answers[q.id]?.selected.length ?? 0 : 0;
  });
  const { confirm } = useGlobalDialogs();
  const [busy, setBusy] = useState(false);

  const hasSelection = selectedCount > 0;

  const handle = async () => {
    if (qid === undefined || committed) return;
    // Only the give-up branch asks for confirmation — once committed, the
    // question counts as `gave_up` in scoring, which is the irreversible
    // action we want a guard for. Submitting a real answer is reversible in
    // spirit (the user can keep editing and re-submit until the exam ends).
    if (!hasSelection) {
      const ok = await confirm({
        title: "Give up on this question?",
        description:
          "This submits the question as a give-up (counts as wrong) and shows the correct answer and explanations.",
        confirmLabel: "Give up",
        variant: "primary" as const,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const isGiveUp = !hasSelection;
      await commit(qid, { gaveUp: isGiveUp });
    } finally {
      setBusy(false);
    }
  };

  const label = committed
    ? "Submitted"
    : busy
      ? "Submitting…"
      : hasSelection
        ? "Submit answer"
        : "Give up";

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={committed || busy}
      onClick={() => void handle()}
    >
      {label}
    </Button>
  );
}

/** Pause: force-flush autosave, then navigate away (session stays in_progress, F4-T27). */
export function PauseButton({
  store,
  onPaused,
}: {
  store: ExamStore;
  onPaused: () => void;
}) {
  const pause = store((s) => s.pause);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    try {
      await pause();
      toast({
        title: "Exam paused",
        description: "Your progress is saved. Resume any time.",
        variant: "info",
      });
      onPaused();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void handle()}>
      {busy ? "Saving…" : "Pause"}
    </Button>
  );
}
