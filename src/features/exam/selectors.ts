import type { AnswerState } from "@/store/examStore";

/** Per-question navigator status. Order matters for the legend. */
export type NavStatus =
  | "current"
  | "revealed"
  | "flagged"
  | "answered"
  | "unanswered";

export function answerStatus(
  a: AnswerState | undefined,
  isCurrent: boolean,
): NavStatus {
  if (isCurrent) return "current";
  if (a?.revealed) return "revealed";
  if (a?.flagged) return "flagged";
  if (a && a.selected.length > 0) return "answered";
  return "unanswered";
}

export function countAnswered(answers: Record<number, AnswerState>): number {
  return Object.values(answers).filter((a) => a.selected.length > 0 || a.revealed)
    .length;
}

export function countFlagged(answers: Record<number, AnswerState>): number {
  return Object.values(answers).filter((a) => a.flagged).length;
}
