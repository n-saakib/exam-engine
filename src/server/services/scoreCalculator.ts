import "server-only";

import type { Outcome } from "@/domain/types";
import type { SnapshotQuestion } from "@/domain/schemas";

/**
 * ScoreCalculator — the single source of truth for grading (01 §4, F4-T11).
 *
 * PURE: no DB, no fs, no clock, no randomness. Given the question snapshot plus
 * the per-question answer state it returns a deterministic outcome per question
 * and the session totals. Grading lives ONLY here and in `submit`; the client
 * never computes the official score.
 *
 * Scoring rules (F4 / 03 §5.1):
 *   - Outcome is one of `correct | incorrect | gave_up`.
 *   - `gave_up` covers three cases that all count as wrong: the user explicitly
 *     gave up; the user left the question blank at submit; the user revealed
 *     the solution in-exam without committing a selection. All three are
 *     treated identically for scoring and for the UI breakdown.
 *   - `revealed` is a LIVE-EXAM VIEWING FLAG on `AnswerState` only — it is not
 *     a graded outcome and never appears on the wire as one.
 *   - `scorePercent = round(correct / total * 100)` — see ROUNDING below.
 *
 * ROUNDING: half-up to the nearest integer percent via `Math.round`. The
 * denominator is the FULL question count (`total`), so gave-up/incorrect all
 * pull the percentage down equally (a "gave up" is not free). `total === 0`
 * yields `0` (no division by zero).
 *
 * EXTENSIBILITY: the per-question correctness check is dispatched on
 * `questionType` through `GRADERS`. Both `single` and `multi` use set equality
 * on a normalised `string[]` (see ADR-13); `ordered` and `freetext` are clean
 * future branches. Picking 2+ options on a `single` question scores `incorrect`
 * (set equality fails on length mismatch) — this is the intended pedagogical
 * behaviour: the user is not prevented from over-selecting.
 */

/** The minimal answer shape ScoreCalculator needs (decoupled from the DB row). */
export interface AnswerInput {
  questionId: number;
  /** Selected option keys. Empty ⇒ gave_up (unless the user also gave up explicitly, which is the same outcome). */
  selected: string[];
  /** Live-exam "view the solution" flag. Affects answer visibility during the exam; does NOT drive the post-submit outcome. */
  revealed: boolean;
  /** User explicitly gave up on this question — surfaces as `gave_up` outcome. */
  gaveUp: boolean;
}

/** Per-question grading result. */
export interface QuestionResult {
  questionId: number;
  outcome: Outcome;
  /**
   * Whether the selection matched the correct answer, IGNORING give-up. Useful
   * for retake-incorrect (a gave-up question can still have a correct selection
   * to surface for transparency) and for the UI's "Your answer" comparison.
   * `null` when the user did not commit a selection.
   */
  isCorrect: boolean | null;
}

/** Session totals. `total` is the denominator for `scorePercent`. */
export interface ScoreTotals {
  correct: number;
  incorrect: number;
  gaveUp: number;
  total: number;
  /** round(correct / total * 100); 0 when total === 0. */
  scorePercent: number;
}

export interface ScoreResult {
  perQuestion: QuestionResult[];
  totals: ScoreTotals;
}

/**
 * A grader decides ONLY raw correctness for one question type (no notion of
 * reveal/unanswered — that policy lives in `grade`). Returning a clean boolean
 * keeps the outcome policy in one place and makes multi/ordered a 1-line add.
 */
type Grader = (selected: string[], correctAnswer: string | string[]) => boolean;

/**
 * Set-equality helper. Used for both `single` and `multi` question types
 * (post ADR-13 unified-array-shape migration). For `single`, a length-1
 * `correctAnswer` (normalised from the legacy string) compared against
 * `selected` reduces to "the user's set equals the singleton correct key" —
 * which is equivalent to the old `selected.length === 1 && selected[0] === ca`
 * check. For `multi`, it's strict set equality (no partial credit).
 */
function setEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}

/** Normalise a possibly-legacy string `correctAnswer` to an array. */
function asArray(ca: string | string[]): string[] {
  return Array.isArray(ca) ? ca : [ca];
}

const GRADERS: Partial<Record<SnapshotQuestion["questionType"], Grader>> = {
  single: (selected, correctAnswer) => setEquals(selected, asArray(correctAnswer)),
  multi: (selected, correctAnswer) => setEquals(selected, asArray(correctAnswer)),
  // Future branches (kept here so the dispatch site doesn't grow special-cases):
  // ordered: (selected, correctAnswer) => sequenceEquals(selected, asArray(correctAnswer)),
};

/**
 * Grade a whole session from its snapshot + answers. Answers are matched to
 * snapshot questions by the stable `question.id`; a question with no answer row
 * is treated as unanswered (defensive — the engine seeds a blank row per
 * question, so this should not normally happen).
 */
export function gradeSession(
  snapshot: SnapshotQuestion[],
  answers: AnswerInput[],
): ScoreResult {
  const byId = new Map<number, AnswerInput>();
  for (const a of answers) byId.set(a.questionId, a);

  const perQuestion: QuestionResult[] = [];
  let correct = 0;
  let incorrect = 0;
  let gaveUp = 0;

  for (const q of snapshot) {
    const answer = byId.get(q.id) ?? {
      questionId: q.id,
      selected: [],
      revealed: false,
      gaveUp: false,
    };

    const grader = GRADERS[q.questionType];
    // An unsupported type at grade time can't be scored correct — treat the raw
    // correctness as false (the engine refuses to CREATE unsupported sessions, so
    // this is only a defensive floor).
    const isCorrect = grader
      ? grader(answer.selected, q.correctAnswer)
      : false;

    let outcome: Outcome;
    if (answer.gaveUp) {
      // User explicitly gave up — outcome is `gave_up`.
      outcome = "gave_up";
      gaveUp++;
    } else if (answer.selected.length === 0) {
      // No selection committed. Covers two cases that are indistinguishable for
      // grading: the user left the question blank, OR the user revealed the
      // solution in-exam without committing an answer. Both count as `gave_up`.
      outcome = "gave_up";
      gaveUp++;
    } else if (isCorrect) {
      outcome = "correct";
      correct++;
    } else {
      outcome = "incorrect";
      incorrect++;
    }

    perQuestion.push({
      questionId: q.id,
      outcome,
      // `isCorrect` is surfaced for UI transparency (e.g. the "didn't earn it"
      // semantics of a gave-up-but-correct selection); null when there is
      // no selection to grade.
      isCorrect: answer.selected.length === 0 || answer.gaveUp ? null : isCorrect,
    });
  }

  const total = snapshot.length;
  const scorePercent = total === 0 ? 0 : Math.round((correct / total) * 100);

  return {
    perQuestion,
    totals: { correct, incorrect, gaveUp, total, scorePercent },
  };
}
