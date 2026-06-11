"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useScan } from "@/hooks/useScan";
import { useToast } from "@/components/Toast";
import { apiClient } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { DiagnosticEntry } from "@/server/services/setCatalog";

interface DiagnosticsResponse {
  items: DiagnosticEntry[];
  total: number;
}

/**
 * Catalogue diagnostics panel: lists problem files with reasons and a rescan
 * action. Reuses GET /api/catalog/diagnostics (F3).
 */
export function CatalogDiagnostics() {
  const { toast } = useToast();
  const { mutate: scan, isPending: isScanning } = useScan();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.diagnostics(),
    queryFn: () => apiClient.get<DiagnosticsResponse>("/catalog/diagnostics"),
  });

  function handleRescan() {
    scan(
      {},
      {
        onSuccess: (result) => {
          toast({
            title: "Rescan complete",
            description: `${result.scanned} files, ${result.errors} error(s)`,
            variant: result.errors > 0 ? "warning" : "success",
          });
          void refetch();
        },
        onError: (err) => {
          toast({ title: "Rescan failed", description: err.message, variant: "danger" });
        },
      },
    );
  }

  const items = data?.items ?? [];

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-fg">Catalog Diagnostics</h2>
          <p className="mt-0.5 text-sm text-muted">
            Files with validation warnings or errors.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleRescan}
          disabled={isScanning}
          aria-label="Rescan question-set catalog"
        >
          {isScanning ? "Scanning..." : "Rescan"}
        </Button>
      </div>

      <div className="mt-4" aria-live="polite">
        {isLoading && (
          <p className="text-sm text-muted">Loading diagnostics...</p>
        )}
        {isError && (
          <p className="text-sm text-danger" role="alert">
            Failed to load diagnostics.
          </p>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <p className="text-sm text-success" role="status">
            No issues found. All question sets are valid.
          </p>
        )}
        {items.length > 0 && (
          <ul className="mt-2 space-y-3" aria-label="Diagnostic issues">
            {items.map((item) => (
              <li key={item.filePath} className="rounded-card border border-border bg-bg p-3">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                      item.status === "error"
                        ? "bg-danger/10 text-danger"
                        : "bg-warning/10 text-warning"
                    }`}
                    aria-label={item.status}
                  >
                    {item.status}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-mono text-fg" title={item.filePath}>
                      {item.filePath}
                    </p>
                    {item.messages.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {item.messages.map((msg, i) => (
                          <li key={i} className="text-xs text-muted">
                            &bull; {msg}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
