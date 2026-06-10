"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { apiClient } from "@/lib/apiClient";
import type { LeafSummary as LeafSummaryData } from "@/domain/types";

export interface LeafSummaryProps {
  leaf: LeafSummaryData;
  /** Called after a successful progress reset so the parent can re-fetch. */
  onReset?: () => void;
}

/**
 * Shows the set counts for a selected leaf path.
 * When exhausted, offers a "Reset progress" affordance that calls
 * `POST /api/progress/reset { scope:'path', quesPath }`.
 *
 * F2-T9.
 */
export function LeafSummary({ leaf, onReset }: LeafSummaryProps) {
  const [resetting, setResetting] = useState(false);
  const { toast } = useToast();

  const handleReset = async () => {
    setResetting(true);
    try {
      await apiClient.post("/progress/reset", {
        json: { scope: "path", quesPath: leaf.quesPath },
      });
      toast({ title: "Progress reset", description: "You can now retake all sets for this path.", variant: "success" });
      onReset?.();
    } catch {
      toast({ title: "Reset failed", description: "Could not reset progress. Please try again.", variant: "danger" });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div
      className="rounded-card border border-border bg-surface p-4 text-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-fg">
            {leaf.totalSets === 0
              ? "No sets catalogued yet"
              : `${leaf.totalSets} ${leaf.totalSets === 1 ? "set" : "sets"} · ${leaf.remainingSets} remaining`}
          </span>
          {leaf.totalSets > 0 && (
            <span className="text-xs text-muted">
              {leaf.completedSets} completed
              {leaf.exhausted ? " · All sets completed" : ""}
            </span>
          )}
        </div>

        {leaf.exhausted && leaf.totalSets > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleReset()}
            disabled={resetting}
            aria-label="Reset progress for this path"
          >
            {resetting ? "Resetting…" : "Reset progress"}
          </Button>
        )}
      </div>
    </div>
  );
}
