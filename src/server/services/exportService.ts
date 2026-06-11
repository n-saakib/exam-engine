import "server-only";

import type { Database } from "better-sqlite3";
import type { SessionRow } from "@/server/data/repos/sessionRepo";
import type { Settings } from "@/domain/types";
import { getAllSettings } from "@/server/data/repos/settingsRepo";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ExportFormat = "json" | "csv";
export type ExportScope = "history" | "all";

export interface ExportResult {
  body: string;
  contentType: string;
  filename: string;
}

/** A per-question entry in a detailed JSON export row. */
interface ExportQuestion {
  id: number;
  order: number;
  questionType: string;
  questionText: string;
  correctAnswer: unknown;
  yourAnswer: string[];
  outcome: string;
  flagged: boolean;
  timeSpentMs: number;
}

/** A single completed-exam row in a JSON export. */
interface ExportSessionEntry {
  id: string;
  domainLabel: string;
  setTitle: string;
  difficulty: string;
  mode: string;
  completedAt: string;
  scorePercent: number;
  correct: number;
  incorrect: number;
  revealed: number;
  unanswered: number;
  total: number;
  timeTakenMs: number;
  isBookmarked: boolean;
  note: string | null;
  /** Populated only when scope=all */
  questions?: ExportQuestion[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeCSV(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_HEADERS = [
  "id",
  "domainLabel",
  "setTitle",
  "difficulty",
  "mode",
  "completedAt",
  "scorePercent",
  "correct",
  "incorrect",
  "revealed",
  "unanswered",
  "total",
  "timeTakenMs",
  "isBookmarked",
  "note",
];

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Builds an in-memory export payload from the DB. We gather ALL data before
 * returning so we can report errors as a proper JSON error envelope rather than
 * erroring mid-stream (09 §7.5).
 */
export function createExportService(db: Database) {
  function getCompletedSessions(): SessionRow[] {
    return db
      .prepare(
        "SELECT * FROM exam_sessions WHERE status = 'completed' ORDER BY completed_at ASC",
      )
      .all() as SessionRow[];
  }

  function getAnswersBySession(sessionId: string): Array<{
    question_id: number;
    selected_options: string;
    is_flagged: number;
    is_revealed: number;
    time_spent_ms: number;
  }> {
    return db
      .prepare(
        "SELECT question_id, selected_options, is_flagged, is_revealed, time_spent_ms FROM session_answers WHERE session_id = ? ORDER BY question_id ASC",
      )
      .all(sessionId) as Array<{
      question_id: number;
      selected_options: string;
      is_flagged: number;
      is_revealed: number;
      time_spent_ms: number;
    }>;
  }

  function buildSessionEntry(row: SessionRow, includeQuestions: boolean): ExportSessionEntry {
    const entry: ExportSessionEntry = {
      id: row.id,
      domainLabel: row.domain_label,
      setTitle: row.set_title,
      difficulty: row.difficulty,
      mode: row.mode,
      completedAt: row.completed_at ?? "",
      scorePercent: row.score_percent ?? 0,
      correct: row.correct_count ?? 0,
      incorrect: row.incorrect_count ?? 0,
      revealed: row.revealed_count ?? 0,
      unanswered: row.unanswered_count ?? 0,
      total: row.total_questions,
      timeTakenMs: row.time_elapsed_ms,
      isBookmarked: row.is_bookmarked === 1,
      note: row.note,
    };

    if (includeQuestions) {
      let snapshot: Array<{
        id: number;
        order: number;
        questionType?: string;
        questionText: string;
        correctAnswer: unknown;
      }> = [];
      try {
        snapshot = JSON.parse(row.question_snapshot);
      } catch {
        // malformed snapshot — skip questions
      }

      const answers = getAnswersBySession(row.id);
      const answerMap = new Map(answers.map((a) => [a.question_id, a]));

      entry.questions = snapshot.map((q) => {
        const ans = answerMap.get(q.id);
        const selected: string[] = ans ? (JSON.parse(ans.selected_options) as string[]) : [];
        const isRevealed = (ans?.is_revealed ?? 0) === 1;

        let outcome = "unanswered";
        if (isRevealed) {
          outcome = "revealed";
        } else if (selected.length === 0) {
          outcome = "unanswered";
        } else {
          const correct = q.correctAnswer;
          const correctArr = Array.isArray(correct) ? correct : [correct];
          const match =
            correctArr.length === selected.length &&
            correctArr.every((k: unknown) => selected.includes(String(k)));
          outcome = match ? "correct" : "incorrect";
        }

        return {
          id: q.id,
          order: q.order,
          questionType: q.questionType ?? "single",
          questionText: q.questionText,
          correctAnswer: q.correctAnswer,
          yourAnswer: selected,
          outcome,
          flagged: (ans?.is_flagged ?? 0) === 1,
          timeSpentMs: ans?.time_spent_ms ?? 0,
        };
      });
    }

    return entry;
  }

  return {
    /**
     * Build the export payload. Gathers all data in memory first so callers
     * can handle errors before writing any response bytes.
     */
    build(format: ExportFormat, scope: ExportScope): ExportResult {
      const sessions = getCompletedSessions();
      const includeQuestions = scope === "all" && format === "json";
      const timestamp = new Date().toISOString().slice(0, 10);

      if (format === "json") {
        const entries = sessions.map((s) => buildSessionEntry(s, includeQuestions));
        const payload: {
          exportedAt: string;
          totalExams: number;
          sessions: ExportSessionEntry[];
          settings?: Settings;
        } = {
          exportedAt: new Date().toISOString(),
          totalExams: entries.length,
          sessions: entries,
        };

        if (scope === "all") {
          payload.settings = getAllSettings(db);
        }

        return {
          body: JSON.stringify(payload, null, 2),
          contentType: "application/json",
          filename: `certprep-export-${timestamp}.json`,
        };
      }

      // CSV: flat history rows only (scope=all still produces the same columns)
      const lines: string[] = [CSV_HEADERS.join(",")];
      for (const row of sessions) {
        const e = buildSessionEntry(row, false);
        lines.push(
          [
            escapeCSV(e.id),
            escapeCSV(e.domainLabel),
            escapeCSV(e.setTitle),
            escapeCSV(e.difficulty),
            escapeCSV(e.mode),
            escapeCSV(e.completedAt),
            escapeCSV(e.scorePercent),
            escapeCSV(e.correct),
            escapeCSV(e.incorrect),
            escapeCSV(e.revealed),
            escapeCSV(e.unanswered),
            escapeCSV(e.total),
            escapeCSV(e.timeTakenMs),
            escapeCSV(e.isBookmarked),
            escapeCSV(e.note),
          ].join(","),
        );
      }

      return {
        body: lines.join("\r\n"),
        contentType: "text/csv",
        filename: `certprep-export-${timestamp}.csv`,
      };
    },
  };
}

export type ExportService = ReturnType<typeof createExportService>;
