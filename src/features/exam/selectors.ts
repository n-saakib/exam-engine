import type { LiveQuestion } from "@/domain/types";
import type { AnswerState } from "@/store/examStore";

function setEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}

function asArray(ca: string | string[]): string[] {
  return Array.isArray(ca) ? ca : [ca];
}

/**
 * Derive the question-level outcome during the exam, based on the answer
 * state and the live question (which carries correctAnswer post-reveal).
 * Mirrors the server-side scoreCalculator.gradeSession logic for the
 * post-reveal case but is a pure client-side helper.
 */
export type LiveOutcome =
  | "correct"
  | "incorrect"
  | "gave_up"
  | "pending"
  | "unanswered";

export function liveOutcome(
  a: AnswerState | undefined,
  q?: LiveQuestion,
): LiveOutcome {
  if (!a) return "unanswered";
  if (a.gaveUp) return "gave_up";
  if (!a.revealed) return a.selected.length > 0 ? "pending" : "unanswered";
  // revealed === true
  if (a.selected.length === 0) return "gave_up";
  if (q?.correctAnswer === undefined) return "pending";
  return setEquals(a.selected, asArray(q.correctAnswer)) ? "correct" : "incorrect";
}

/** Per-question navigator status. Order matters for the legend. */
export type NavStatus =
  | "current"
  | "gave_up"
  | "answered_correct"
  | "answered_incorrect"
  | "answered_pending"
  | "flagged"
  | "unanswered";

export function answerStatus(
  a: AnswerState | undefined,
  isCurrent: boolean,
  q?: LiveQuestion,
): NavStatus {
  if (isCurrent) return "current";
  if (a?.gaveUp) return "gave_up";
  if (a?.revealed) {
    const out = liveOutcome(a, q);
    if (out === "correct") return "answered_correct";
    if (out === "incorrect") return "answered_incorrect";
    if (out === "gave_up") return "gave_up";        // revealed but no selection
    return "answered_pending";                       // correctAnswer not yet known
  }
  if (a?.flagged) return "flagged";
  if (a && a.selected.length > 0) return "answered_pending";
  return "unanswered";
}

export function countAnswered(answers: Record<number, AnswerState>): number {
  return Object.values(answers).filter(
    (a) => a.revealed || a.gaveUp || a.selected.length > 0,
  ).length;
}

export function countFlagged(answers: Record<number, AnswerState>): number {
  return Object.values(answers).filter((a) => a.flagged).length;
}

export function countGaveUp(answers: Record<number, AnswerState>): number {
  return Object.values(answers).filter((a) => a.gaveUp).length;
}
