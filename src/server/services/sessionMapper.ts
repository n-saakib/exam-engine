import "server-only";

import type {
  LiveSession,
  LiveQuestion,
  LiveAnswer,
  Results,
  ResultsQuestion,
  Difficulty,
  Outcome,
} from "@/domain/types";
import type { SnapshotQuestion } from "@/domain/schemas";
import type { SessionRow } from "@/server/data/repos/sessionRepo";
import type { AnswerRow } from "@/server/data/repos/answerRepo";
import { gradeSession } from "@/server/services/scoreCalculator";

/**
 * DTO mappers — the ONLY place the snapshot becomes a client-facing shape.
 *
 * ⚠️ ANSWERS-HIDDEN IS ENFORCED HERE (03 §8, F4-T6). `toLiveSession` strips
 * `correctAnswer`/`explanations`/`Tips` from every question whose answer is NOT
 * `revealed` (when the session is in progress). A revealed question — and only
 * that question — carries its correct data. Never rely on the client to hide.
 */

function parseSelected(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

/** Index answer rows by question id for O(1) lookup. */
function indexAnswers(answers: AnswerRow[]): Map<number, AnswerRow> {
  const m = new Map<number, AnswerRow>();
  for (const a of answers) m.set(a.question_id, a);
  return m;
}

function parseSnapshot(row: SessionRow): SnapshotQuestion[] {
  return JSON.parse(row.question_snapshot) as SnapshotQuestion[];
}

/**
 * Build the live session DTO (03 §4.1) from the stored row + answers. Reveal of
 * the correct data is decided per question: a question is "open" iff its answer
 * is revealed. (When the session is completed, callers should use the results
 * mapper — but for safety a completed session still only attaches data to
 * questions actually revealed, since the results endpoint is the answers-shown
 * surface.)
 */
export function toLiveSession(row: SessionRow, answers: AnswerRow[]): LiveSession {
  const snapshot = parseSnapshot(row);
  const byId = indexAnswers(answers);

  const timerLimitMs = row.timer_limit_ms;
  const timerEnabled = row.timer_enabled === 1;
  const expired =
    timerEnabled && timerLimitMs != null && row.time_elapsed_ms >= timerLimitMs;

  const questions: LiveQuestion[] = snapshot.map((q) => {
    const ans = byId.get(q.id);
    const revealed = ans?.is_revealed === 1;

    const answer: LiveAnswer = {
      selected: ans ? parseSelected(ans.selected_options) : [],
      flagged: ans?.is_flagged === 1,
      gaveUp: ans?.is_gave_up === 1,
      revealed,
      timeSpentMs: ans?.time_spent_ms ?? 0,
    };

    const base: LiveQuestion = {
      id: q.id,
      order: q.order,
      questionType: q.questionType,
      questionText: q.questionText,
      options: q.options,
      ...(q.optionOrder ? { optionOrder: q.optionOrder } : {}),
      answer,
    };

    // ── answers-hidden gate ────────────────────────────────────────────────
    // Attach correct data ONLY for revealed questions; otherwise omit entirely.
    if (revealed) {
      base.correctAnswer = q.correctAnswer;
      if (q.explanations) base.explanations = q.explanations;
      if (q.Tips !== undefined) base.Tips = q.Tips;
    }

    return base;
  });

  return {
    id: row.id,
    status: row.status,
    quesPath: row.ques_path,
    domainLabel: row.domain_label,
    setTitle: row.set_title,
    difficulty: row.difficulty as Difficulty,
    mode: row.mode,
    totalQuestions: row.total_questions,
    currentIndex: row.current_index,
    timer: {
      enabled: timerEnabled,
      limitMs: timerLimitMs,
      elapsedMs: row.time_elapsed_ms,
      ...(expired ? { expired: true } : {}),
    },
    questions,
    createdAt: row.created_at,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Build the full graded results DTO (03 §5.1) — answers and explanations are
 * INCLUDED for every question (this is the post-submit / history surface). The
 * outcomes are recomputed from the snapshot + answers via ScoreCalculator so the
 * results detail is always consistent with the stored score (and with grading).
 */
export function toResults(row: SessionRow, answers: AnswerRow[]): Results {
  const snapshot = parseSnapshot(row);
  const byId = indexAnswers(answers);

  const graded = gradeSession(
    snapshot,
    answers.map((a) => ({
      questionId: a.question_id,
      selected: parseSelected(a.selected_options),
      revealed: a.is_revealed === 1,
      gaveUp: a.is_gave_up === 1,
    })),
  );
  const outcomeById = new Map<number, Outcome>(
    graded.perQuestion.map((r) => [r.questionId, r.outcome]),
  );

  const questions: ResultsQuestion[] = snapshot.map((q) => {
    const ans = byId.get(q.id);
    return {
      id: q.id,
      order: q.order,
      questionType: q.questionType,
      questionText: q.questionText,
      options: q.options,
      // Surface the snapshot's optionOrder (ADR-15) so the review screen can
      // render options in the SAME order the user saw during the exam and
      // reverse-map `correctAnswer` / `yourAnswer` (stored as underlying
      // keys) to the display letter (A, B, C, D) the user actually clicked.
      ...(q.optionOrder ? { optionOrder: q.optionOrder } : {}),
      correctAnswer: q.correctAnswer,
      yourAnswer: ans ? parseSelected(ans.selected_options) : [],
      outcome: outcomeById.get(q.id) ?? "unanswered",
      flagged: ans?.is_flagged === 1,
      gaveUp: ans?.is_gave_up === 1,
      explanations: q.explanations ?? {},
      ...(q.Tips !== undefined ? { Tips: q.Tips } : {}),
    };
  });

  return {
    id: row.id,
    status: row.status,
    domainLabel: row.domain_label,
    setTitle: row.set_title,
    difficulty: row.difficulty as Difficulty,
    mode: row.mode,
    summary: {
      // Prefer the persisted score fields (written at submit); fall back to the
      // freshly graded totals if they're somehow absent.
      scorePercent: row.score_percent ?? graded.totals.scorePercent,
      correct: row.correct_count ?? graded.totals.correct,
      // "Incorrect" in the UI breakdown is the single "wrong" tally: explicit
      // wrong picks + revealed-without-correct + unanswered. All three are
      // not-correct in the score (none count toward `correct`) and the
      // breakdown collapses them into one number so the user sees a simple
      // 4-column view (correct / incorrect / gave up / flagged). The DB
      // still persists the granular counts for export/legacy.
      incorrect:
        (row.incorrect_count ?? graded.totals.incorrect) +
        (row.revealed_count ?? graded.totals.revealed) +
        (row.unanswered_count ?? graded.totals.unanswered),
      gaveUp: row.gave_up_count ?? graded.totals.gaveUp,
      flagged: answers.reduce((n, a) => (a.is_flagged === 1 ? n + 1 : n), 0),
      total: row.total_questions,
      timeTakenMs: row.time_elapsed_ms,
      timerLimitMs: row.timer_limit_ms,
    },
    isBookmarked: row.is_bookmarked === 1,
    note: row.note,
    completedAt: row.completed_at,
    questions,
  };
}
