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
 *   - `revealed` ("gave up") counts as its OWN outcome — NOT incorrect — and is
 *     excluded from the correct tally. It still counts toward `total`.
 *   - `unanswered` = not revealed and no option selected.
 *   - `scorePercent = round(correct / total * 100)` — see ROUNDING below.
 *
 * ROUNDING: half-up to the nearest integer percent via `Math.round`. The
 * denominator is the FULL question count (`total`), so revealed/unanswered/wrong
 * all pull the percentage down equally (a "gave up" is not free). `total === 0`
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
  /** Selected option keys. Empty ⇒ unanswered (unless revealed). */
  selected: string[];
  /** "Gave up" — overrides correctness; counts as `revealed`. */
  revealed: boolean;
  /** User explicitly gave up on this question (first-class outcome, distinct from per-question "submit for review" reveal). */
  gaveUp: boolean;
}

/** Per-question grading result. */
export interface QuestionResult {
  questionId: number;
  outcome: Outcome;
  /**
   * Whether the selection matched the correct answer, IGNORING reveal. Useful for
   * retake-incorrect (a revealed-but-correct guess is still "didn't earn it") and
   * for transparency. `null` when unanswered.
   */
  isCorrect: boolean | null;
}

/** Session totals. `total` is the denominator for `scorePercent`. */
export interface ScoreTotals {
  correct: number;
  incorrect: number;
  revealed: number;
  unanswered: number;
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
  let revealed = 0;
  let unanswered = 0;
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
      // User explicitly gave up — first-class outcome, distinct from
      // a per-question "submit for review" reveal.
      outcome = "gave_up";
      gaveUp++;
    } else if (answer.revealed) {
      outcome = "revealed";
      revealed++;
    } else if (answer.selected.length === 0) {
      outcome = "unanswered";
      unanswered++;
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
      isCorrect:
        answer.selected.length === 0 && !answer.revealed && !answer.gaveUp
          ? null
          : answer.gaveUp
            ? null
            : isCorrect,
    });
  }

  const total = snapshot.length;
  const scorePercent = total === 0 ? 0 : Math.round((correct / total) * 100);

  return {
    perQuestion,
    totals: { correct, incorrect, revealed, unanswered, gaveUp, total, scorePercent },
  };
}
