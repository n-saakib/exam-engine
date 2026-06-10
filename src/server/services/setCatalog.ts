import "server-only";

import fs from "node:fs";
import path from "node:path";

import { validateQuestionSet, type Diagnostic } from "@/domain/schemas";
import type { QuestionSet } from "@/domain/types";
import { AppError } from "@/server/http/errors";
import { config } from "@/server/config";
import { readAllJsonFiles } from "@/server/data/fileReader";
import { resolveUnderRoot } from "@/server/util/paths";
import type { SetCatalogRepo, CatalogRow } from "@/server/data/repos/setCatalogRepo";
import type { CompletionRepo } from "@/server/data/repos/completionRepo";

// ─── DTOs ────────────────────────────────────────────────────────────────────

/** Summary returned by `scan()`. */
export interface ScanSummary {
  scanned: number;
  added: number;
  updated: number;
  removed: number;
  errors: number;
  diagnostics: Array<{
    filePath: string;
    status: "ok" | "warning" | "error";
    messages: string[];
  }>;
}

/** A set as listed in `GET /api/sets`. */
export interface CatalogSetItem {
  setId: string;
  setTitle: string;
  difficulty: string;
  questionCount: number;
  filePath: string;
  status: "ok" | "warning" | "error";
  completed: boolean;
  lastAttemptAt: string | null;
  updatedSinceAttempt: boolean;
  diagnostics: Diagnostic[];
}

/** Response shape for `listForPath()`. */
export interface SetListResponse {
  items: CatalogSetItem[];
  total: number;
  remaining: number;
  exhausted: boolean;
}

/** A diagnostic entry for the `/api/catalog/diagnostics` endpoint. */
export interface DiagnosticEntry {
  filePath: string;
  status: "warning" | "error";
  messages: string[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Orchestrates catalogue scanning, completion tracking, and set loading.
 * No raw SQL here — delegates all persistence to the repos.
 */
export function createSetCatalogService(
  catalogRepo: SetCatalogRepo,
  completionRepo: CompletionRepo,
) {
  /**
   * Derive the `ques_path` for a file by finding which configured leaf directory
   * it sits under. We compare the file's parent directory against the Exams root
   * (and uploads root) and derive a relative-from-CWD-style path that matches
   * the `quesPath` values in `exam-paths.json`.
   *
   * Returns null if the file isn't under any known root.
   */
  function quesPathForFile(filePath: string): string | null {
    const dir = path.dirname(filePath);
    const examsRoot = path.resolve(config.examsRoot);
    const uploadsRoot = config.uploadsRoot;

    for (const root of [examsRoot, uploadsRoot]) {
      if (!dir.startsWith(root)) continue;
      // Build a path relative to cwd, which matches the exam-paths.json quesPath style.
      const rel = path.relative(process.cwd(), dir);
      return rel; // e.g. "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy"
    }
    return null;
  }

  /**
   * Determine status + diagnostics for a file, honouring duplicate-setId detection.
   * Returns the classification to write to the catalogue.
   */
  function classifyFile(
    filePath: string,
    raw: unknown,
    existingHash: string | undefined,
    newHash: string,
    knownSetIds: Map<string, string[]>, // setId -> [filePaths]
  ): {
    status: "ok" | "warning" | "error";
    diagnostics: Diagnostic[];
    setId: string | null;
    setTitle: string;
    difficulty: string;
    questionCount: number;
  } {
    const validation = validateQuestionSet(raw);

    if (!validation.ok || !validation.data) {
      return {
        status: "error",
        diagnostics: validation.diagnostics,
        setId: null,
        setTitle: path.basename(filePath),
        difficulty: "Unknown",
        questionCount: 0,
      };
    }

    const set = validation.data;
    const diagnostics: Diagnostic[] = [...validation.diagnostics];

    // Warn on duplicate set_id across different files.
    const peers = knownSetIds.get(set.setId) ?? [];
    const otherFiles = peers.filter((p) => p !== filePath);
    if (otherFiles.length > 0) {
      diagnostics.push({
        severity: "warning",
        message: `duplicate set_id "${set.setId}" also found in: ${otherFiles.join(", ")}`,
      });
    }

    const hasErrors = diagnostics.some((d) => d.severity === "error");
    const hasWarnings = diagnostics.some((d) => d.severity === "warning");
    const status = hasErrors ? "error" : hasWarnings ? "warning" : "ok";

    return {
      status,
      diagnostics,
      setId: set.setId,
      setTitle: set.setTitle,
      difficulty: set.difficulty,
      questionCount: set.questions.length,
    };
  }

  return {
    /**
     * Scan the Exams root (and uploads/) for JSON question sets, validate each,
     * upsert the catalogue, mark removed files, and return a summary.
     *
     * Resilient: one bad file never aborts the scan.
     *
     * @param quesPath  Optional leaf path to restrict the scan to one subtree.
     */
    async scan(quesPath?: string): Promise<ScanSummary> {
      const examsRoot = config.examsRoot;
      const uploadsRoot = config.uploadsRoot;

      // When quesPath is given, resolve it against the exams root to narrow the walk.
      let scanRoot = examsRoot;
      if (quesPath) {
        try {
          const resolved = resolveUnderRoot(examsRoot, quesPath);
          if (fs.existsSync(resolved)) {
            scanRoot = resolved;
          } else {
            // Fall back to scanning under uploads root if it's there.
            try {
              const uploadsResolved = resolveUnderRoot(uploadsRoot, quesPath);
              if (fs.existsSync(uploadsResolved)) {
                scanRoot = uploadsResolved;
              }
            } catch {
              // uploads root traversal attempt — ignore
            }
          }
        } catch {
          // PATH_TRAVERSAL from resolveUnderRoot — scan everything
        }
      }

      const results = readAllJsonFiles(
        scanRoot,
        quesPath ? undefined : uploadsRoot,
      );

      // Build a map of setId → [filePaths] across ALL discovered files for
      // duplicate detection (before upsert loop).
      const setIdToFiles = new Map<string, string[]>();
      for (const r of results) {
        if (r.raw !== null) {
          const v = validateQuestionSet(r.raw);
          if (v.ok && v.data) {
            const existing = setIdToFiles.get(v.data.setId) ?? [];
            existing.push(r.filePath);
            setIdToFiles.set(v.data.setId, existing);
          }
        }
      }

      let added = 0;
      let updated = 0;
      let errors = 0;
      const diagnosticEntries: ScanSummary["diagnostics"] = [];

      for (const r of results) {
        const existingRow = catalogRepo.findByFilePath(r.filePath);

        // Derive ques_path (the leaf directory relative to cwd).
        const derivedQuesPath = quesPathForFile(r.filePath);
        if (!derivedQuesPath) {
          // File is outside any known root — skip it.
          continue;
        }

        if (r.raw === null) {
          // Unreadable or unparseable JSON — record as error.
          errors++;
          catalogRepo.upsert({
            setId: `__parse_error__${path.basename(r.filePath)}`,
            setTitle: path.basename(r.filePath),
            difficulty: "Unknown",
            quesPath: derivedQuesPath,
            filePath: r.filePath,
            questionCount: 0,
            contentHash: r.hash,
            source: r.filePath.includes(path.sep + "uploads" + path.sep)
              ? "upload"
              : "filesystem",
            status: "error",
            diagnostics: [
              {
                severity: "error",
                message: r.parseError ?? "Failed to parse JSON",
              },
            ],
          });
          diagnosticEntries.push({
            filePath: r.filePath,
            status: "error",
            messages: [r.parseError ?? "Failed to parse JSON"],
          });
          if (!existingRow) added++;
          else updated++;
          continue;
        }

        const classification = classifyFile(
          r.filePath,
          r.raw,
          existingRow?.content_hash,
          r.hash,
          setIdToFiles,
        );

        if (classification.status === "error") errors++;

        const source = r.filePath.startsWith(uploadsRoot)
          ? "upload" as const
          : "filesystem" as const;

        catalogRepo.upsert({
          setId: classification.setId ?? `__invalid__${path.basename(r.filePath)}`,
          setTitle: classification.setTitle,
          difficulty: classification.difficulty,
          quesPath: derivedQuesPath,
          filePath: r.filePath,
          questionCount: classification.questionCount,
          contentHash: r.hash,
          source,
          status: classification.status,
          diagnostics: classification.diagnostics,
        });

        if (!existingRow) {
          added++;
        } else if (existingRow.content_hash !== r.hash) {
          updated++;
        }
        // else: unchanged — neither added nor updated count increments

        if (classification.diagnostics.length > 0) {
          diagnosticEntries.push({
            filePath: r.filePath,
            status: classification.status,
            messages: classification.diagnostics.map((d) => d.message),
          });
        }
      }

      // Mark removed: files that were in the catalogue but no longer exist on disk.
      const knownPaths = new Set(results.map((r) => r.filePath));
      const removed = catalogRepo.removeAbsent(knownPaths, quesPath);

      return {
        scanned: results.length,
        added,
        updated,
        removed,
        errors,
        diagnostics: diagnosticEntries,
      };
    },

    /**
     * List all sets for a given `quesPath` leaf with completion + drift state.
     * Throws `PATH_NOT_FOUND` if no sets exist for the path.
     */
    listForPath(quesPath: string): SetListResponse {
      const rows = catalogRepo.listByQuesPath(quesPath);
      if (rows.length === 0) {
        throw new AppError(
          "PATH_NOT_FOUND",
          `No question sets found for path: ${quesPath}`,
          404,
        );
      }

      const completedIds = new Set(completionRepo.listCompletedSetIds(quesPath));

      const items: CatalogSetItem[] = rows.map((row) => {
        const completed = completedIds.has(row.set_id);
        const lastAttemptAt = completionRepo.latestCompletedAt(quesPath, row.set_id);

        // Drift: content changed since the last time it was completed.
        let updatedSinceAttempt = false;
        if (completed && lastAttemptAt) {
          updatedSinceAttempt = row.updated_at > lastAttemptAt;
        }

        const diagnostics: Diagnostic[] = row.diagnostics
          ? (JSON.parse(row.diagnostics) as Diagnostic[])
          : [];

        return {
          setId: row.set_id,
          setTitle: row.set_title,
          difficulty: row.difficulty,
          questionCount: row.question_count,
          filePath: row.file_path,
          status: row.status,
          completed,
          lastAttemptAt,
          updatedSinceAttempt,
          diagnostics,
        };
      });

      const remaining = items.filter(
        (i) => !i.completed && i.status !== "error",
      ).length;
      const exhausted = remaining === 0;

      return {
        items,
        total: items.length,
        remaining,
        exhausted,
      };
    },

    /**
     * Load a full question set by its `setId` or absolute `filePath`.
     * - `409 SET_AMBIGUOUS` if the setId matches multiple files.
     * - `404 SET_NOT_FOUND` if nothing matches.
     */
    loadSet(setIdOrFilePath: string): QuestionSet {
      // Try as file path first (absolute path check).
      if (path.isAbsolute(setIdOrFilePath)) {
        const row = catalogRepo.findByFilePath(setIdOrFilePath);
        if (!row) {
          throw new AppError(
            "SET_NOT_FOUND",
            `No catalogued set at path: ${setIdOrFilePath}`,
            404,
          );
        }
        return parseSetFile(row.file_path);
      }

      // Otherwise treat as setId.
      const rows = catalogRepo.findBySetId(setIdOrFilePath);
      if (rows.length === 0) {
        throw new AppError(
          "SET_NOT_FOUND",
          `No catalogued set with id: ${setIdOrFilePath}`,
          404,
        );
      }
      if (rows.length > 1) {
        throw new AppError(
          "SET_AMBIGUOUS",
          `set_id "${setIdOrFilePath}" is ambiguous — found in multiple files`,
          409,
          { candidates: rows.map((r) => r.file_path) },
        );
      }
      return parseSetFile(rows[0]!.file_path);
    },

    /**
     * Pick the next unattempted (not completed) set for a path.
     * Skips sets with `status: 'error'` (can't be started).
     * Throws `SETS_EXHAUSTED (409)` when all sets have been completed.
     */
    pickNextUnattempted(quesPath: string): CatalogRow {
      const rows = catalogRepo.listByQuesPath(quesPath);
      if (rows.length === 0) {
        throw new AppError(
          "PATH_NOT_FOUND",
          `No question sets found for path: ${quesPath}`,
          404,
        );
      }

      const completedIds = new Set(completionRepo.listCompletedSetIds(quesPath));
      const available = rows.filter(
        (r) => !completedIds.has(r.set_id) && r.status !== "error",
      );

      if (available.length === 0) {
        throw new AppError(
          "SETS_EXHAUSTED",
          `All sets for path "${quesPath}" have been completed`,
          409,
        );
      }

      // Return the first unattempted set (catalogue is ordered by setTitle).
      return available[0]!;
    },

    /**
     * Whether all sets for a given path have been completed.
     */
    isExhausted(quesPath: string): boolean {
      const rows = catalogRepo.listByQuesPath(quesPath);
      if (rows.length === 0) return false;
      const completedIds = new Set(completionRepo.listCompletedSetIds(quesPath));
      return rows
        .filter((r) => r.status !== "error")
        .every((r) => completedIds.has(r.set_id));
    },

    /**
     * All warning/error entries for the diagnostics endpoint.
     */
    listDiagnostics(): DiagnosticEntry[] {
      const rows = catalogRepo.listWarningAndError();
      return rows.map((row) => {
        const diagnostics: Diagnostic[] = row.diagnostics
          ? (JSON.parse(row.diagnostics) as Diagnostic[])
          : [];
        return {
          filePath: row.file_path,
          status: row.status as "warning" | "error",
          messages: diagnostics.map((d) => d.message),
        };
      });
    },
  };
}

export type SetCatalogService = ReturnType<typeof createSetCatalogService>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSetFile(filePath: string): QuestionSet {
  let raw: unknown;
  try {
    const bytes = fs.readFileSync(filePath, "utf8");
    raw = JSON.parse(bytes);
  } catch (e) {
    throw new AppError(
      "SET_NOT_FOUND",
      `Could not read set file: ${(e as Error).message}`,
      404,
    );
  }
  const result = validateQuestionSet(raw);
  if (!result.ok || !result.data) {
    throw new AppError(
      "SET_NOT_FOUND",
      `Set file failed validation: ${result.diagnostics.map((d) => d.message).join("; ")}`,
      404,
    );
  }
  return result.data;
}
