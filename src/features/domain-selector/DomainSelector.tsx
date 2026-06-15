"use client";

import { useCallback, useRef, useState } from "react";
import { useExamPaths } from "@/hooks/useExamPaths";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { childNodes, type ExamPathNode } from "@/domain/schemas";
import { Spinner } from "@/components/Spinner";
import { Card } from "@/components/Card";
import { CascadingDropdown, buildLevels, resolveLeafNode } from "./CascadingDropdown";
import { DomainIcon } from "./DomainIcon";
import { LeafSummary } from "./LeafSummary";
import { StartExamButton } from "./StartExamButton";
import type { LeafSummary as LeafSummaryData, Settings } from "@/domain/types";

const DEBOUNCE_MS = 600;

/**
 * Inner component — rendered only once settings have loaded, so it can seed
 * the selection from `last_selected_path` via a `useState` lazy initialiser
 * (no effect needed, no setState-in-effect lint violation).
 */
function DomainSelectorInner({ settings }: { settings: Settings }) {
  const { data, isLoading, isError, error, refetch } = useExamPaths();
  const { mutate: updateSettings } = useUpdateSettings();

  // Seed selectedPath from the saved setting exactly once (lazy initialiser).
  const [selectedPath, setSelectedPath] = useState<string[]>(() => {
    const saved = settings.last_selected_path;
    return Array.isArray(saved) && saved.length > 0 ? saved : [];
  });

  // Debounce timer ref — used only in event handlers, never during render.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Debounced persist (F2-T11).
  const persistSelection = useCallback(
    (path: string[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateSettings({ last_selected_path: path });
      }, DEBOUNCE_MS);
    },
    [updateSettings],
  );

  const handleLevelChange = useCallback(
    (level: number, key: string) => {
      // Selecting at level N resets all deeper levels (F2-T8).
      const newPath = [...selectedPath.slice(0, level), key];
      setSelectedPath(newPath);
      persistSelection(newPath);
    },
    [selectedPath, persistSelection],
  );

  // ── Loading & error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div
        className="flex min-h-[12rem] items-center justify-center"
        role="status"
        aria-label="Loading exam paths"
      >
        <Spinner size={32} />
      </div>
    );
  }

  if (isError) {
    const errCode =
      error && typeof error === "object" && "code" in error
        ? (error as { code: string }).code
        : "UNKNOWN";
    return (
      <Card className="border-danger bg-danger/5">
        <h2 className="font-semibold text-danger">Cannot load exam paths</h2>
        <p className="mt-1 text-sm text-muted">
          {errCode === "EXAM_PATHS_INVALID"
            ? "The exam-paths.json file is invalid or missing. Please check the file and restart."
            : "Failed to load exam paths. Please try refreshing the page."}
        </p>
        {error instanceof Error && (
          <p className="mt-2 font-mono text-xs text-muted">{error.message}</p>
        )}
        <button
          type="button"
          className="mt-3 text-sm font-medium text-brand underline-offset-2 hover:underline"
          onClick={() => void refetch()}
        >
          Retry
        </button>
      </Card>
    );
  }

  if (!data) return null;

  // The API returns tree as Record<string, unknown>; cast to ExamPathNode for
  // the tree-walking helpers which expect that shape.
  const tree = data.tree as ExamPathNode;
  const { leaves } = data;

  // ── Build cascading levels from the tree ─────────────────────────────────

  const levels = buildLevels(tree, selectedPath);

  // ── Resolve the current leaf (if any) ────────────────────────────────────

  const leafNode = resolveLeafNode(tree, selectedPath);
  const currentQuesPath = leafNode?.quesPath;

  const leafData: LeafSummaryData | undefined = currentQuesPath
    ? leaves.find((l) => l.quesPath === currentQuesPath)
    : undefined;

  // Icon from the root-level child of the selection path.
  const firstKey = selectedPath[0];
  let topIcon: string | undefined;
  if (firstKey) {
    const rootChildren = childNodes(tree);
    const found = rootChildren.find(([k]) => k === firstKey);
    if (found) topIcon = typeof found[1].icon === "string" ? found[1].icon : undefined;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Cascading dropdowns */}
      <div
        className="flex flex-col gap-4"
        role="group"
        aria-label="Domain selector"
      >
        {levels.map((lvl, i) => (
          <div key={i} data-testid={`level-${i}`}>
            <CascadingDropdown
              label={lvl.label}
              options={lvl.options}
              value={lvl.selectedKey}
              onChange={(key) => handleLevelChange(i, key)}
              level={i}
            />
          </div>
        ))}
      </div>

      {/* Leaf summary + start button */}
      {leafData && (
        <div
          className="flex flex-col gap-4"
          data-testid="leaf-panel"
        >
          {/* Domain icon + label */}
          <div className="flex items-center gap-2">
            <DomainIcon icon={topIcon} className="h-5 w-5" />
            <span className="text-sm font-medium text-muted">
              {leafData.domainLabel}
            </span>
          </div>

          <LeafSummary
            leaf={leafData}
            onReset={() => void refetch()}
          />

          <StartExamButton
            quesPath={leafData.quesPath}
            remainingSets={leafData.remainingSets}
            exhausted={leafData.exhausted}
            inProgressCount={leafData.inProgressCount}
          />
        </div>
      )}

      {/* Show a prompt if in the middle of the tree (non-leaf, some levels shown) */}
      {!leafData && selectedPath.length > 0 && levels.length === selectedPath.length && (
        <p className="text-sm text-muted" aria-live="polite">
          Continue selecting to reach an exam level.
        </p>
      )}
    </div>
  );
}

/**
 * Outer shell: waits for settings to load (needed for rehydration), then
 * mounts the inner component. This avoids any effect-based setState and keeps
 * rehydration in a stable `useState` lazy initialiser.
 *
 * F2-T6 / F2-T8 / F2-T11.
 */
export function DomainSelector() {
  const { data: settings, isLoading: settingsLoading } = useSettings();

  if (settingsLoading || !settings) {
    return (
      <div
        className="flex min-h-[12rem] items-center justify-center"
        role="status"
        aria-label="Loading settings"
      >
        <Spinner size={32} />
      </div>
    );
  }

  return <DomainSelectorInner settings={settings} />;
}
