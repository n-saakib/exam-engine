"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { apiClient, ApiError } from "@/lib/apiClient";

export interface StartExamButtonProps {
  quesPath: string;
  remainingSets: number;
  exhausted: boolean;
  /**
   * Number of in-progress (resume) sessions for the same quesPath. When > 0,
   * the leaf is gated: the user must continue from `/resume` or discard the
   * existing session there before a new exam can be started from the home
   * page. Matches the rule: a paused exam blocks starting a fresh one.
   */
  inProgressCount: number;
}

/**
 * "Start Exam" button — enabled only at a leaf with remainingSets > 0 AND no
 * in-progress (resume) session for the same path.
 *
 * Calls `POST /api/sessions { quesPath }` and navigates to `/exam/:id`.
 * Because this endpoint is built in F4 and may not exist yet, we handle
 * 404 / METHOD_NOT_ALLOWED / network errors gracefully:
 *   - Shows a toast "Coming soon" instead of crashing.
 *   - Includes a loading/disabled state to prevent double-submit (09 §7.3).
 *
 * When F4 lands and the endpoint exists, the navigation path works as-is.
 *
 * F2-T10.
 */
export function StartExamButton({
  quesPath,
  remainingSets,
  exhausted,
  inProgressCount,
}: StartExamButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const gatedByResume = inProgressCount > 0;
  const isEnabled =
    remainingSets > 0 && !exhausted && !gatedByResume && !loading;

  const handleStart = async () => {
    if (!isEnabled) return;
    setLoading(true);

    try {
      const session = await apiClient.post<{ id: string }>("/sessions", {
        json: { quesPath },
      });
      router.push(`/exam/${session.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        // F4 not yet implemented: 404 or 405 are expected; show graceful message.
        if (err.status === 404 || err.status === 405) {
          toast({
            title: "Exam engine coming soon",
            description: "Session creation will be available in the next release.",
            variant: "info",
          });
        } else if (err.code === "SETS_EXHAUSTED") {
          toast({
            title: "All sets completed",
            description: "Use 'Reset progress' to retake sets for this path.",
            variant: "warning",
          });
        } else {
          toast({
            title: "Failed to start exam",
            description: err.message,
            variant: "danger",
          });
        }
      } else {
        toast({
          title: "Exam engine coming soon",
          description: "Session creation is not yet available.",
          variant: "info",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Label and helper text adapt to the gate state so the user always knows
  // what action is available.
  const label = loading
    ? "Starting…"
    : gatedByResume
      ? "Continue in Resume"
      : exhausted
        ? "All sets done"
        : "Start Exam";

  const helperText = gatedByResume
    ? "You have a paused exam for this path. Resume or discard it before starting a new one."
    : undefined;

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="primary"
        size="lg"
        disabled={!isEnabled}
        aria-disabled={!isEnabled}
        onClick={() => void handleStart()}
        className="w-full sm:w-auto"
      >
        {label}
      </Button>
      {helperText && (
        <p className="text-xs text-muted" role="status" aria-live="polite">
          {helperText}
        </p>
      )}
    </div>
  );
}
