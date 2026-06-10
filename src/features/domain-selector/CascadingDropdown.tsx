"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import type { ExamPathNode } from "@/domain/schemas";
import { childNodes } from "@/domain/schemas";
import { DomainIcon } from "./DomainIcon";

export interface CascadingDropdownOption {
  key: string;
  title: string;
  icon?: string;
}

export interface CascadingDropdownProps {
  /** The prompt text shown before a selection is made (from node.label). */
  label: string;
  /** The available child options (key = machine id, title = display text). */
  options: CascadingDropdownOption[];
  /** Currently selected option key (or undefined = nothing selected). */
  value: string | undefined;
  /** Called with the selected option key when the user chooses an option. */
  onChange: (key: string) => void;
  /** Accessible label suffix for screen-reader differentiation of levels. */
  level: number;
}

/**
 * One level of the cascading domain selector. Renders the current node's
 * `label` as the prompt and children `title`s as options. Accessible and
 * keyboard-navigable via a native `<select>` (the most robust cross-browser
 * accessible pattern for a single-select list).
 *
 * F2-T7.
 */
export function CascadingDropdown({
  label,
  options,
  value,
  onChange,
  level,
}: CascadingDropdownProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-sm font-medium text-muted"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value ?? ""}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          aria-label={`${label} (level ${level + 1})`}
          className={cn(
            "w-full appearance-none rounded-card border border-border bg-surface px-3 py-2 pr-8",
            "text-sm text-fg",
            "focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-50",
            "cursor-pointer",
          )}
        >
          <option value="" disabled>
            {label}
          </option>
          {options.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.title}
            </option>
          ))}
        </select>
        {/* Custom chevron — absolute positioned, pointer-events-none so it
            doesn't intercept the native select events */}
        <span
          className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted"
          aria-hidden="true"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

// ─── Tree helpers ────────────────────────────────────────────────────────────

/**
 * Given a tree node and the current selection path (an array of machine-key
 * strings), build the list of `CascadingDropdownOption[]` arrays to render —
 * one per level that has been revealed.
 *
 * Level 0 options = root's children.
 * Level 1 options = selected child's children.
 * … and so on until the user reaches a leaf.
 *
 * Exported for testing.
 */
export function buildLevels(
  root: ExamPathNode,
  selectedPath: string[],
): Array<{ label: string; options: CascadingDropdownOption[]; selectedKey: string | undefined }> {
  const levels: Array<{
    label: string;
    options: CascadingDropdownOption[];
    selectedKey: string | undefined;
  }> = [];

  // Level 0: root's children.
  const rootLabel = typeof root.label === "string" ? root.label : "Choose";
  const rootOptions = childNodes(root).map(([key, child]) => ({
    key,
    title: typeof child.title === "string" ? child.title : key,
    icon: typeof child.icon === "string" ? child.icon : undefined,
  }));

  if (rootOptions.length === 0) return levels;

  levels.push({
    label: rootLabel,
    options: rootOptions,
    selectedKey: selectedPath[0],
  });

  // Walk down the selected path, revealing further levels.
  let currentNode: ExamPathNode = root;
  for (let i = 0; i < selectedPath.length; i++) {
    const key = selectedPath[i]!;
    const children = childNodes(currentNode);
    const found = children.find(([k]) => k === key);
    if (!found) break;

    const [, child] = found;
    // Don't add another level if we've reached a leaf (quesPath present).
    if (typeof child.quesPath === "string") break;

    // Child is non-leaf: reveal its children as the next level.
    const childChildren = childNodes(child);
    if (childChildren.length === 0) break;

    const childLabel = typeof child.label === "string" ? child.label : "Choose";
    const childOptions = childChildren.map(([k, cc]) => ({
      key: k,
      title: typeof cc.title === "string" ? cc.title : k,
      icon: typeof cc.icon === "string" ? cc.icon : undefined,
    }));

    levels.push({
      label: childLabel,
      options: childOptions,
      selectedKey: selectedPath[i + 1],
    });

    currentNode = child;
  }

  return levels;
}

/**
 * Given a tree and a selection path, return the currently selected leaf node
 * (if the path terminates at a leaf), or null.
 *
 * Exported for testing.
 */
export function resolveLeafNode(
  root: ExamPathNode,
  selectedPath: string[],
): ExamPathNode | null {
  let node: ExamPathNode = root;
  for (const key of selectedPath) {
    const children = childNodes(node);
    const found = children.find(([k]) => k === key);
    if (!found) return null;
    node = found[1];
  }
  return typeof node.quesPath === "string" ? node : null;
}

// Re-export for convenience so importing modules don't need to reach into schemas.
export { DomainIcon };
