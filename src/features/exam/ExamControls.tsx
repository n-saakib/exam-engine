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

/** Give up / reveal answer for the current question (F4-T22). */
export function GiveUpButton({ store }: { store: ExamStore }) {
  const reveal = store((s) => s.reveal);
  const qid = store((s) => s.questions[s.currentIndex]?.id);
  const revealed = store((s) => {
    const q = s.questions[s.currentIndex];
    return q ? !!s.answers[q.id]?.revealed : false;
  });
  const { confirm } = useGlobalDialogs();
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (qid === undefined || revealed) return;
    const ok = await confirm({
      title: "Reveal the answer?",
      description:
        "This shows the correct answer and explanations, and marks the question as revealed (excluded from your score).",
      confirmLabel: "Reveal",
      variant: "primary",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await reveal(qid);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={revealed || busy}
      onClick={() => void handle()}
    >
      {revealed ? "Revealed" : busy ? "Revealing…" : "Give up"}
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
