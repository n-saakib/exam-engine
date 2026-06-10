import "server-only";

import fs from "node:fs";

import { ExamPathsSchema, childNodes, isLeaf, type ExamPathNode } from "@/domain/schemas";
import { AppError } from "@/server/http/errors";
import { config } from "@/server/config";
import { resolveUnderRoot } from "@/server/util/paths";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A resolved leaf in the navigation tree. `domainLabel` is built from the title
 * chain of all ancestor nodes, e.g. "Cloud / AWS / AWS SAA / Easy".
 * `safe` is false when the quesPath couldn't be resolved under the exams root
 * (dangling or escaping) — it's still listed, just flagged as a warning.
 */
export interface ResolvedLeaf {
  quesPath: string;
  domainLabel: string;
  icon?: string;
  safe: boolean;
}

// ─── PathResolver ─────────────────────────────────────────────────────────────

/**
 * Reads `config.examPathsFile`, validates it with `ExamPathsSchema`, and exposes:
 *   - `tree`  — the raw validated node (same shape as exam-paths.json)
 *   - `leaves` — flat list of every leaf, enriched with a `domainLabel` and path safety flag
 *
 * F2-T1 / F2-T3 / F2-T4.
 *
 * Forward-compatible: unknown top-level keys (future schema additions) are allowed
 * by the `catchall` in ExamPathNodeSchema; unknown `version` values are warned and
 * then ignored — the tree is still parsed and returned.
 */
export function createPathResolver() {
  /**
   * Parse the exam-paths.json file.
   * Throws `EXAM_PATHS_INVALID` on any hard failure.
   */
  function load(): ExamPathNode {
    let raw: unknown;
    try {
      const bytes = fs.readFileSync(config.examPathsFile, "utf8");
      raw = JSON.parse(bytes);
    } catch (e) {
      throw new AppError(
        "EXAM_PATHS_INVALID",
        `Cannot read exam-paths.json: ${(e as Error).message}`,
        500,
      );
    }

    // Zod validate.
    const parsed = ExamPathsSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError(
        "EXAM_PATHS_INVALID",
        "exam-paths.json failed schema validation",
        500,
        {
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
      );
    }

    const tree = parsed.data;

    // Structural checks (02 §2.2):
    // Root must have `label` and ≥1 child.
    if (typeof tree.label !== "string" || tree.label.trim() === "") {
      throw new AppError(
        "EXAM_PATHS_INVALID",
        "exam-paths.json root must have a non-empty `label`",
        500,
      );
    }
    const rootChildren = childNodes(tree);
    if (rootChildren.length === 0) {
      throw new AppError(
        "EXAM_PATHS_INVALID",
        "exam-paths.json root must have at least one child node",
        500,
      );
    }

    // Validate non-leaf nodes recursively (label + title checks).
    validateNode(tree, "", /* isRoot */ true);

    // Forward-compat: warn on unknown version (but don't crash).
    if (typeof tree.version === "number" && tree.version > 1) {
      console.warn(
        `[PathResolver] exam-paths.json declares version=${tree.version} (known: 1). ` +
          "Attempting to parse anyway — some features may not render correctly.",
      );
    }

    return tree;
  }

  /**
   * Recursively validate a node. Hard errors throw; structural violations that
   * are path-sandboxing related are warnings (still listed, flagged `safe: false`).
   */
  function validateNode(node: ExamPathNode, path: string, isRoot: boolean): void {
    if (!isRoot) {
      // Non-root nodes must have a `title`.
      if (typeof node.title !== "string" || node.title.trim() === "") {
        throw new AppError(
          "EXAM_PATHS_INVALID",
          `Node at "${path}" is missing a non-empty \`title\``,
          500,
        );
      }
    }

    const children = childNodes(node);
    const leaf = isLeaf(node);

    if (!leaf) {
      // Non-leaf must have label + ≥1 child.
      if (typeof node.label !== "string" || node.label.trim() === "") {
        throw new AppError(
          "EXAM_PATHS_INVALID",
          `Non-leaf node at "${path}" is missing a non-empty \`label\``,
          500,
        );
      }
      if (children.length === 0 && !isRoot) {
        throw new AppError(
          "EXAM_PATHS_INVALID",
          `Non-leaf node at "${path}" has no child nodes`,
          500,
        );
      }
      for (const [key, child] of children) {
        validateNode(child, path ? `${path}.${key}` : key, false);
      }
    }
    // Leaf: quesPath sandboxing is handled in flattenLeaves (warning, not error).
  }

  /**
   * Walk the tree depth-first, collecting leaves with their built-up title chains.
   */
  function flattenLeaves(
    node: ExamPathNode,
    titleChain: string[],
    inheritedIcon?: string,
  ): ResolvedLeaf[] {
    const out: ResolvedLeaf[] = [];
    const icon = node.icon ?? inheritedIcon;

    if (isLeaf(node)) {
      const quesPath = node.quesPath!;
      const domainLabel = titleChain.join(" / ");

      // Sandbox check — F2-T3: dangling/escaping quesPath = warning, not crash.
      let safe = true;
      try {
        resolveUnderRoot(config.examsRoot, quesPath);
      } catch {
        safe = false;
        console.warn(
          `[PathResolver] quesPath "${quesPath}" escapes or doesn't resolve under ` +
            `exams root "${config.examsRoot}" — leaf is listed but flagged unsafe.`,
        );
      }

      out.push({ quesPath, domainLabel, icon, safe });
      return out;
    }

    for (const [, child] of childNodes(node)) {
      const childTitle = typeof child.title === "string" ? child.title : "";
      out.push(...flattenLeaves(child, [...titleChain, childTitle], icon));
    }

    return out;
  }

  return {
    /** The validated navigation tree (full shape of exam-paths.json). */
    get tree(): ExamPathNode {
      return load();
    },

    /** Flat list of all leaves with domainLabel + path safety. */
    get leaves(): ResolvedLeaf[] {
      const tree = load();
      return flattenLeaves(tree, []);
    },

    /**
     * Convenience: load tree + leaves in a single parse (avoids two file reads).
     */
    loadAll(): { tree: ExamPathNode; leaves: ResolvedLeaf[] } {
      const tree = load();
      const leaves = flattenLeaves(tree, []);
      return { tree, leaves };
    },
  };
}

export type PathResolver = ReturnType<typeof createPathResolver>;
