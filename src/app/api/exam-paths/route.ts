import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { getContainer } from "@/server/container";
import type { ExamPathsResponse, LeafSummary } from "@/domain/types";

// DB-backed + file-backed route → Node.js runtime only; never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/exam-paths
 *
 * Returns the parsed navigation tree and a flat list of leaves enriched with
 * per-leaf set counts (from SetCatalog).  Paths that haven't been scanned yet
 * return zero counts (PATH_NOT_FOUND from setCatalog.listForPath is treated as
 * zero, not an error — a leaf may simply have no files yet).
 *
 * Errors:
 *   500 EXAM_PATHS_INVALID — exam-paths.json is missing, malformed, or invalid.
 */
export const GET = defineHandler({
  handler: async () => {
    const { pathResolver, setCatalog } = getContainer().services;

    // Throws EXAM_PATHS_INVALID if the file is bad.
    const { tree, leaves: resolvedLeaves } = pathResolver.loadAll();

    // Enrich each leaf with SetCatalog counts.
    const leaves: LeafSummary[] = resolvedLeaves.map((leaf) => {
      let totalSets = 0;
      let completedSets = 0;
      let remainingSets = 0;
      let exhausted = false;

      try {
        const listResult = setCatalog.listForPath(leaf.quesPath);
        totalSets = listResult.total;
        remainingSets = listResult.remaining;
        exhausted = listResult.exhausted;
        completedSets = totalSets - remainingSets;
      } catch (err: unknown) {
        // PATH_NOT_FOUND = leaf has no catalogued sets yet — zero counts, not an error.
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code: string }).code === "PATH_NOT_FOUND"
        ) {
          // leave all counts at zero
        } else {
          // Unexpected error: re-throw.
          throw err;
        }
      }

      return {
        quesPath: leaf.quesPath,
        domainLabel: leaf.domainLabel,
        ...(leaf.icon !== undefined ? { icon: leaf.icon } : {}),
        safe: leaf.safe,
        totalSets,
        completedSets,
        remainingSets,
        exhausted,
      };
    });

    const body: ExamPathsResponse = { tree: tree as Record<string, unknown>, leaves };
    return json(body);
  },
});
