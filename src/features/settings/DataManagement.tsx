"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useGlobalDialogs } from "@/features/shell/GlobalDialogs";
import { useToast } from "@/components/Toast";
import { apiClient } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { ResetResponse } from "@/domain/types";
import { useExamPaths } from "@/hooks/useExamPaths";

interface ExamPathsData {
  tree: Record<string, unknown>;
  leaves: Array<{ quesPath: string; domainLabel: string }>;
}

/**
 * Data management section:
 * - Export JSON / CSV downloads
 * - Reset progress per-path (path picker)
 * - Full reset
 * - Factory reset
 *
 * Each destructive action is behind a confirm dialog with clear consequences.
 */
export function DataManagement() {
  const { confirm } = useGlobalDialogs();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string>("");
  const { data: examPathsData } = useExamPaths() as { data: ExamPathsData | undefined };

  const leaves = examPathsData?.leaves ?? [];

  function downloadExport(format: "json" | "csv", scope: "history" | "all") {
    const url = `/api/export?format=${format}&scope=${scope}`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  async function handleResetPath() {
    if (!selectedPath) {
      toast({ title: "Select a path first", variant: "warning" });
      return;
    }

    const label = leaves.find((l) => l.quesPath === selectedPath)?.domainLabel ?? selectedPath;
    const confirmed = await confirm({
      title: "Reset progress for this path?",
      description: `This will clear completion records for "${label}". Your session history and scores are kept — you will just be able to redo those sets.`,
      confirmLabel: "Reset progress",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsResetting(true);
    try {
      const result = await apiClient.post<ResetResponse>("/progress/reset", {
        json: { scope: "path", quesPath: selectedPath },
      });
      toast({
        title: "Progress reset",
        description: `${result.cleared.completion} completion record(s) cleared.`,
        variant: "success",
      });
      void queryClient.invalidateQueries({ queryKey: ["sets"] });
      setSelectedPath("");
    } catch (err) {
      toast({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "danger",
      });
    } finally {
      setIsResetting(false);
    }
  }

  async function handleFullReset() {
    const confirmed = await confirm({
      title: "Full reset — are you sure?",
      description:
        "This will permanently delete ALL exam sessions, answers, and completion records. Your settings and question-set catalog will be kept. This cannot be undone.",
      confirmLabel: "Delete all history",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsResetting(true);
    try {
      const result = await apiClient.post<ResetResponse>("/progress/reset", {
        json: { scope: "all", confirm: true },
      });
      toast({
        title: "Full reset complete",
        description: `${result.cleared.sessions} session(s) and ${result.cleared.completion} completion(s) deleted.`,
        variant: "success",
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.history() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() });
      void queryClient.invalidateQueries({ queryKey: ["sets"] });
    } catch (err) {
      toast({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "danger",
      });
    } finally {
      setIsResetting(false);
    }
  }

  async function handleFactoryReset() {
    const confirmed = await confirm({
      title: "Factory reset — are you absolutely sure?",
      description:
        "This will delete ALL sessions, answers, completion records, AND reset all settings to their defaults. Everything will be as if you just installed the app. This cannot be undone.",
      confirmLabel: "Factory reset",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsResetting(true);
    try {
      const result = await apiClient.post<ResetResponse>("/progress/reset", {
        json: { scope: "factory" },
      });
      toast({
        title: "Factory reset complete",
        description: `${result.cleared.sessions} session(s) deleted. Settings restored to defaults.`,
        variant: "success",
      });
      void queryClient.invalidateQueries();
    } catch (err) {
      toast({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "danger",
      });
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <Card className="mt-6">
      <h2 className="text-base font-semibold text-fg">Data Management</h2>
      <p className="mt-1 text-sm text-muted">
        Export your history or clear data.
      </p>

      {/* Export */}
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-fg">Export</h3>
        <p className="mt-0.5 text-xs text-muted">
          Download your exam history.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => downloadExport("json", "history")}
            aria-label="Export exam history as JSON"
          >
            Export history (JSON)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => downloadExport("csv", "history")}
            aria-label="Export exam history as CSV"
          >
            Export history (CSV)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => downloadExport("json", "all")}
            aria-label="Export full data including settings as JSON"
          >
            Export full data (JSON)
          </Button>
        </div>
      </div>

      {/* Reset per-path */}
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-fg">Reset progress for a path</h3>
        <p className="mt-0.5 text-xs text-muted">
          Clears completion records for the selected path so you can redo those sets. Session history and scores are kept.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="reset-path" className="sr-only">
              Select a path to reset
            </label>
            <select
              id="reset-path"
              value={selectedPath}
              onChange={(e) => setSelectedPath(e.target.value)}
              className="rounded-card border border-border bg-bg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
              disabled={isResetting}
            >
              <option value="">Select a path...</option>
              {leaves.map((leaf) => (
                <option key={leaf.quesPath} value={leaf.quesPath}>
                  {leaf.domainLabel}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            variant="danger"
            onClick={handleResetPath}
            disabled={!selectedPath || isResetting}
            aria-label="Reset progress for selected path"
          >
            Reset this path
          </Button>
        </div>
      </div>

      {/* Full reset */}
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-fg">Full reset</h3>
        <p className="mt-0.5 text-xs text-muted">
          Delete all sessions, answers, and completion records. Settings and the question-set catalog are kept.
        </p>
        <Button
          size="sm"
          variant="danger"
          className="mt-3"
          onClick={handleFullReset}
          disabled={isResetting}
          aria-label="Delete all exam history and progress"
        >
          Delete all history
        </Button>
      </div>

      {/* Factory reset */}
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-fg">Factory reset</h3>
        <p className="mt-0.5 text-xs text-muted">
          Everything above, plus resets all settings to defaults. The app will be in its initial state.
        </p>
        <Button
          size="sm"
          variant="danger"
          className="mt-3"
          onClick={handleFactoryReset}
          disabled={isResetting}
          aria-label="Factory reset: delete all data and restore default settings"
        >
          Factory reset
        </Button>
      </div>
    </Card>
  );
}
