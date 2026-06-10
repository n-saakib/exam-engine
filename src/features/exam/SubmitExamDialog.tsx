"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/Dialog";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/apiClient";
import type { ExamStore } from "@/store/examStore";
import { countAnswered, countFlagged } from "./selectors";

/**
 * Confirm-finish dialog (F4-T20). Shows unanswered + flagged counts, then on
 * confirm forces a flush, POSTs submit, and navigates to /results/:id.
 */
export function SubmitExamDialog({
  store,
  open,
  onOpenChange,
  onSubmitted,
}: {
  store: ExamStore;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: (sessionId: string) => void;
}) {
  const total = store((s) => s.questions.length);
  const answers = store((s) => s.answers);
  const submit = store((s) => s.submit);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const answered = countAnswered(answers);
  const unanswered = total - answered;
  const flagged = countFlagged(answers);

  const handleSubmit = async () => {
    setBusy(true);
    try {
      const id = await submit();
      onOpenChange(false);
      onSubmitted(id);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not submit the exam.";
      toast({ title: "Submit failed", description: message, variant: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogTitle>Finish exam?</DialogTitle>
        <DialogDescription>
          Submitting grades your answers and ends the session.
        </DialogDescription>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-card border border-border bg-surface p-2">
            <dt className="text-xs text-muted">Answered</dt>
            <dd className="text-lg font-semibold">{answered}</dd>
          </div>
          <div className="rounded-card border border-border bg-surface p-2">
            <dt className="text-xs text-muted">Unanswered</dt>
            <dd className="text-lg font-semibold text-incorrect">{unanswered}</dd>
          </div>
          <div className="rounded-card border border-border bg-surface p-2">
            <dt className="text-xs text-muted">Flagged</dt>
            <dd className="text-lg font-semibold text-flagged">{flagged}</dd>
          </div>
        </dl>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Keep going
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => void handleSubmit()}
          >
            {busy ? "Submitting…" : "Submit exam"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
