import "server-only";

import type { Database } from "better-sqlite3";

import type { Diagnostic } from "@/domain/schemas";

/** Shape of a row in `set_catalog` as returned from the DB. */
export interface CatalogRow {
  id: number;
  set_id: string;
  set_title: string;
  difficulty: string;
  ques_path: string;
  file_path: string;
  question_count: number;
  content_hash: string;
  source: "filesystem" | "upload";
  status: "ok" | "warning" | "error";
  diagnostics: string | null; // JSON array
  discovered_at: string;
  updated_at: string;
}

/** Parameters for upserting a catalogue entry. */
export interface UpsertCatalogParams {
  setId: string;
  setTitle: string;
  difficulty: string;
  quesPath: string;
  filePath: string;
  questionCount: number;
  contentHash: string;
  source: "filesystem" | "upload";
  status: "ok" | "warning" | "error";
  diagnostics: Diagnostic[];
}

/**
 * All SQL on `set_catalog`. No orchestration logic — just insert/update/query.
 * Services call this; route handlers do not.
 */
export function createSetCatalogRepo(db: Database) {
  const upsert = db.prepare<
    [
      string, // set_id
      string, // set_title
      string, // difficulty
      string, // ques_path
      string, // file_path
      number, // question_count
      string, // content_hash
      string, // source
      string, // status
      string | null, // diagnostics
      string, // discovered_at
      string, // updated_at
    ]
  >(`
    INSERT INTO set_catalog
      (set_id, set_title, difficulty, ques_path, file_path, question_count,
       content_hash, source, status, diagnostics, discovered_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      set_id         = excluded.set_id,
      set_title      = excluded.set_title,
      difficulty     = excluded.difficulty,
      ques_path      = excluded.ques_path,
      question_count = excluded.question_count,
      content_hash   = excluded.content_hash,
      source         = excluded.source,
      status         = excluded.status,
      diagnostics    = excluded.diagnostics,
      updated_at     = excluded.updated_at
  `);

  const selectByFilePath = db.prepare<[string]>(
    "SELECT * FROM set_catalog WHERE file_path = ?",
  );

  const selectBySetId = db.prepare<[string]>(
    "SELECT * FROM set_catalog WHERE set_id = ?",
  );

  const selectByQuesPath = db.prepare<[string]>(
    "SELECT * FROM set_catalog WHERE ques_path = ? ORDER BY set_title ASC",
  );

  const selectAllWarningError = db.prepare(
    "SELECT * FROM set_catalog WHERE status IN ('warning', 'error') ORDER BY file_path ASC",
  );

  const deleteByFilePath = db.prepare<[string]>(
    "DELETE FROM set_catalog WHERE file_path = ?",
  );

  const selectFilePathsByQuesPath = db.prepare<[string]>(
    "SELECT file_path FROM set_catalog WHERE ques_path = ?",
  );

  const selectAllFilePaths = db.prepare(
    "SELECT file_path FROM set_catalog",
  );

  const countAll = db.prepare(
    "SELECT COUNT(*) AS c FROM set_catalog",
  );

  return {
    /**
     * Upsert a catalogue entry. If the file_path already exists, the row is
     * updated; otherwise inserted. `discovered_at` is only written on INSERT
     * (the ON CONFLICT clause doesn't touch it).
     */
    upsert(params: UpsertCatalogParams): void {
      const now = new Date().toISOString();
      const diagJson =
        params.diagnostics.length > 0
          ? JSON.stringify(params.diagnostics)
          : null;

      // We need to set discovered_at on first insert only; use the DB timestamp
      // if the row already exists, otherwise set it to now.
      const existing = selectByFilePath.get(params.filePath) as CatalogRow | undefined;
      const discoveredAt = existing?.discovered_at ?? now;

      upsert.run(
        params.setId,
        params.setTitle,
        params.difficulty,
        params.quesPath,
        params.filePath,
        params.questionCount,
        params.contentHash,
        params.source,
        params.status,
        diagJson,
        discoveredAt,
        now,
      );
    },

    /**
     * Remove catalogue entries whose file_path is no longer present on disk.
     * Accepts the full set of currently-known file paths; removes any row whose
     * path is not in that set (optionally filtered to a ques_path subtree).
     */
    removeAbsent(knownPaths: Set<string>, quesPath?: string): number {
      const rows = quesPath
        ? (selectFilePathsByQuesPath.all(quesPath) as Array<{ file_path: string }>)
        : (selectAllFilePaths.all() as Array<{ file_path: string }>);

      let removed = 0;
      for (const { file_path } of rows) {
        if (!knownPaths.has(file_path)) {
          deleteByFilePath.run(file_path);
          removed++;
        }
      }
      return removed;
    },

    /** Find a single entry by its absolute file path. */
    findByFilePath(filePath: string): CatalogRow | undefined {
      return selectByFilePath.get(filePath) as CatalogRow | undefined;
    },

    /** Find all entries with a given set_id (may be >1 if authors duplicated the id). */
    findBySetId(setId: string): CatalogRow[] {
      return selectBySetId.all(setId) as CatalogRow[];
    },

    /** List all catalogue entries for a given quesPath, ordered by setTitle. */
    listByQuesPath(quesPath: string): CatalogRow[] {
      return selectByQuesPath.all(quesPath) as CatalogRow[];
    },

    /** All entries currently flagged as warning or error (for diagnostics endpoint). */
    listWarningAndError(): CatalogRow[] {
      return selectAllWarningError.all() as CatalogRow[];
    },

    /** Total number of rows in the catalogue. */
    count(): number {
      const row = countAll.get() as { c: number };
      return row.c;
    },
  };
}

export type SetCatalogRepo = ReturnType<typeof createSetCatalogRepo>;
