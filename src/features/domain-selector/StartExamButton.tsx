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
}

/**
 * "Start Exam" button — enabled only at a leaf with remainingSets > 0.
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
}: StartExamButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const isEnabled = remainingSets > 0 && !exhausted && !loading;

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

  return (
    <Button
      variant="primary"
      size="lg"
      disabled={!isEnabled}
      aria-disabled={!isEnabled}
      onClick={() => void handleStart()}
      className="w-full sm:w-auto"
    >
      {loading ? "Starting…" : exhausted ? "All sets done" : "Start Exam"}
    </Button>
  );
}
