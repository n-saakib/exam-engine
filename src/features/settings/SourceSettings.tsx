"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useScan, type ScanSummary } from "@/hooks/useScan";
import { useToast } from "@/components/Toast";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

interface DiagnosticsData {
  items: Array<{ filePath: string; status: string; messages: string[] }>;
  total: number;
}

/**
 * Source settings section: Exams root path input + filesystem/upload mode
 * toggle + rescan button. In upload mode shows the upload dropzone and uploaded
 * set list.
 */
export function SourceSettings() {
  const { data: settings } = useSettings();
  const { mutate: updateSettings, isPending: isSaving } = useUpdateSettings();
  const { mutate: scan, isPending: isScanning } = useScan();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [pathInput, setPathInput] = useState<string | undefined>(undefined);
  const [pathError, setPathError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanSummary | null>(null);

  const currentPath = settings?.exams_root ?? "";
  const currentMode = settings?.source_mode ?? "filesystem";
  const displayPath = pathInput !== undefined ? pathInput : currentPath;

  // Fetch uploaded sets (catalog entries with source=upload)
  const { data: uploadedSets } = useQuery({
    queryKey: ["uploadedSets"],
    queryFn: () => apiClient.get<DiagnosticsData>("/catalog/diagnostics"),
    enabled: currentMode === "upload",
  });

  function handlePathChange(value: string) {
    setPathInput(value);
    setPathError(null);
  }

  function handlePathSave() {
    if (displayPath.trim() === "") {
      setPathError("Path cannot be empty.");
      return;
    }
    updateSettings(
      { exams_root: displayPath.trim() },
      {
        onSuccess: (response) => {
          setPathInput(undefined);
          setPathError(null);
          const res = response as unknown as Record<string, unknown>;
          if (res.scan) {
            setScanResult(res.scan as ScanSummary);
            toast({ title: "Path saved and rescan complete", variant: "success" });
          } else {
            toast({ title: "Path saved", variant: "success" });
          }
          void queryClient.invalidateQueries({ queryKey: queryKeys.settings() });
        },
        onError: (err) => {
          setPathError(err.message);
        },
      },
    );
  }

  function handleModeToggle(mode: "filesystem" | "upload") {
    updateSettings(
      { source_mode: mode },
      {
        onSuccess: () => {
          toast({ title: `Switched to ${mode} mode`, variant: "success" });
        },
        onError: (err) => {
          toast({ title: "Failed to update mode", description: err.message, variant: "danger" });
        },
      },
    );
  }

  function handleRescan() {
    scan(
      {},
      {
        onSuccess: (result) => {
          setScanResult(result);
          toast({
            title: "Rescan complete",
            description: `${result.scanned} files scanned, ${result.added} added, ${result.errors} errors`,
            variant: result.errors > 0 ? "warning" : "success",
          });
        },
        onError: (err) => {
          toast({ title: "Rescan failed", description: err.message, variant: "danger" });
        },
      },
    );
  }

  const isDirty = pathInput !== undefined && pathInput !== currentPath;

  return (
    <Card className="mt-6">
      <h2 className="text-base font-semibold text-fg">Question-Set Source</h2>
      <p className="mt-1 text-sm text-muted">
        Configure where CertPrep looks for question sets.
      </p>

      {/* Mode toggle */}
      <div className="mt-4">
        <span className="text-sm font-medium text-fg">Source mode</span>
        <div
          className="mt-2 inline-flex rounded-card border border-border bg-bg p-0.5"
          role="radiogroup"
          aria-label="Source mode"
        >
          {(["filesystem", "upload"] as const).map((mode) => (
            <label key={mode} className="cursor-pointer">
              <input
                type="radio"
                className="sr-only"
                name="source_mode"
                value={mode}
                checked={currentMode === mode}
                onChange={() => handleModeToggle(mode)}
                disabled={isSaving}
              />
              <span
                aria-hidden="true"
                className={
                  currentMode === mode
                    ? "inline-flex items-center rounded-[calc(var(--radius-card)-2px)] bg-brand px-3 py-1 text-xs font-semibold text-brand-fg"
                    : "inline-flex items-center rounded-[calc(var(--radius-card)-2px)] px-3 py-1 text-xs font-medium text-muted hover:text-fg"
                }
              >
                {mode === "filesystem" ? "Filesystem" : "Upload"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Filesystem path input */}
      {currentMode === "filesystem" && (
        <div className="mt-4">
          <label htmlFor="exams-root" className="block text-sm font-medium text-fg">
            Exams root path
          </label>
          <p className="mt-0.5 text-xs text-muted">
            Absolute or relative path to the directory containing your question sets.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              id="exams-root"
              type="text"
              value={displayPath}
              onChange={(e) => handlePathChange(e.target.value)}
              className="flex-1 rounded-card border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="e.g. ./Exams or /home/user/Exams"
              aria-describedby={pathError ? "exams-root-error" : undefined}
              aria-invalid={pathError ? "true" : undefined}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={handlePathSave}
              disabled={!isDirty || isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
          {pathError && (
            <p id="exams-root-error" className="mt-1.5 text-xs text-danger" role="alert">
              {pathError}
            </p>
          )}
        </div>
      )}

      {/* Upload mode */}
      {currentMode === "upload" && (
        <div className="mt-4">
          <p className="text-sm font-medium text-fg">Upload question sets</p>
          <p className="mt-0.5 text-xs text-muted">
            Drop or browse for .json question-set files. They are catalogued immediately.
          </p>
          <div className="mt-2 rounded-card border-2 border-dashed border-border bg-bg p-4 transition hover:border-brand">
            <UploadDropzone
              onComplete={(result) => {
                toast({
                  title: `Uploaded ${result.accepted.length} set(s)`,
                  description:
                    result.rejected.length > 0
                      ? `${result.rejected.length} rejected`
                      : undefined,
                  variant: result.rejected.length > 0 ? "warning" : "success",
                });
                void queryClient.invalidateQueries({ queryKey: ["uploadedSets"] });
              }}
              onError={(err) => {
                toast({ title: "Upload failed", description: err.message, variant: "danger" });
              }}
            />
          </div>
          {uploadedSets && uploadedSets.total > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted uppercase tracking-wide">
                Uploaded files with issues ({uploadedSets.total})
              </p>
              <ul className="mt-1 space-y-1">
                {uploadedSets.items.slice(0, 5).map((item) => (
                  <li key={item.filePath} className="text-xs text-fg truncate">
                    {item.filePath}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Rescan button + summary */}
      <div className="mt-4 flex items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={handleRescan}
          disabled={isScanning}
          aria-label="Rescan question-set catalog"
        >
          {isScanning ? "Scanning..." : "Rescan Catalog"}
        </Button>
        {scanResult && (
          <p className="text-xs text-muted" role="status">
            {scanResult.scanned} files &middot; {scanResult.added} added &middot;{" "}
            {scanResult.updated} updated &middot; {scanResult.removed} removed
            {scanResult.errors > 0 && (
              <span className="text-warning"> &middot; {scanResult.errors} errors</span>
            )}
          </p>
        )}
      </div>
    </Card>
  );
}
