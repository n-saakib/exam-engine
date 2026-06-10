import { describe, expect, it } from "vitest";

import {
  gradeSession,
  type AnswerInput,
} from "@/server/services/scoreCalculator";
import type { SnapshotQuestion } from "@/domain/schemas";

/**
 * ScoreCalculator is the crown jewel — the single source of truth for grading.
 * Pure, deterministic, no IO. These tests pin every outcome rule and the rounding.
 */

/** Build a single-choice snapshot question (correctAnswer defaults to "A"). */
function q(id: number, correctAnswer = "A"): SnapshotQuestion {
  return {
    id,
    order: id,
    questionType: "single",
    questionText: `Q${id}`,
    options: { A: "a", B: "b", C: "c", D: "d" },
    optionOrder: ["A", "B", "C", "D"],
    correctAnswer,
  };
}

function ans(
  questionId: number,
  selected: string[],
  revealed = false,
): AnswerInput {
  return { questionId, selected, revealed };
}

describe("gradeSession — outcomes", () => {
  it("all correct → 100%", () => {
    const snap = [q(1, "A"), q(2, "B"), q(3, "C")];
    const answers = [ans(1, ["A"]), ans(2, ["B"]), ans(3, ["C"])];
    const { totals } = gradeSession(snap, answers);
    expect(totals).toMatchObject({
      correct: 3,
      incorrect: 0,
      revealed: 0,
      unanswered: 0,
      total: 3,
      scorePercent: 100,
    });
  });

  it("all wrong → 0%", () => {
    const snap = [q(1, "A"), q(2, "A")];
    const answers = [ans(1, ["B"]), ans(2, ["C"])];
    const { totals, perQuestion } = gradeSession(snap, answers);
    expect(totals).toMatchObject({ correct: 0, incorrect: 2, scorePercent: 0 });
    expect(perQuestion.map((p) => p.outcome)).toEqual(["incorrect", "incorrect"]);
  });

  it("mixed correct/incorrect", () => {
    const snap = [q(1, "A"), q(2, "B"), q(3, "C"), q(4, "D")];
    const answers = [
      ans(1, ["A"]), // correct
      ans(2, ["A"]), // incorrect
      ans(3, ["C"]), // correct
      ans(4, ["A"]), // incorrect
    ];
    const { totals } = gradeSession(snap, answers);
    expect(totals).toMatchObject({
      correct: 2,
      incorrect: 2,
      scorePercent: 50,
    });
  });

  it("unanswered (empty selection, not revealed) counts as unanswered, not incorrect", () => {
    const snap = [q(1, "A"), q(2, "B")];
    const answers = [ans(1, ["A"]), ans(2, [])];
    const { totals, perQuestion } = gradeSession(snap, answers);
    expect(totals).toMatchObject({
      correct: 1,
      incorrect: 0,
      unanswered: 1,
      total: 2,
      scorePercent: 50,
    });
    expect(perQuestion[1]!.outcome).toBe("unanswered");
    expect(perQuestion[1]!.isCorrect).toBeNull();
  });

  it("a missing answer row is treated as unanswered", () => {
    const snap = [q(1, "A"), q(2, "B")];
    const answers = [ans(1, ["A"])]; // no row for q2
    const { totals, perQuestion } = gradeSession(snap, answers);
    expect(totals.unanswered).toBe(1);
    expect(perQuestion[1]!.outcome).toBe("unanswered");
  });
});

describe("gradeSession — revealed ('gave up') semantics", () => {
  it("revealed counts as revealed, NOT incorrect, and is excluded from correct", () => {
    const snap = [q(1, "A"), q(2, "B"), q(3, "C")];
    const answers = [
      ans(1, ["A"]), // correct
      ans(2, [], true), // revealed, no selection
      ans(3, ["X"], true), // revealed even though it had a (wrong) selection
    ];
    const { totals, perQuestion } = gradeSession(snap, answers);
    expect(totals).toMatchObject({
      correct: 1,
      incorrect: 0,
      revealed: 2,
      unanswered: 0,
      total: 3,
    });
    expect(perQuestion[1]!.outcome).toBe("revealed");
    expect(perQuestion[2]!.outcome).toBe("revealed");
  });

  it("revealed pulls the percentage down (denominator is full total, not just graded)", () => {
    // 1 correct out of 2 questions, the other revealed → 1/2 = 50%, NOT 100%.
    const snap = [q(1, "A"), q(2, "B")];
    const answers = [ans(1, ["A"]), ans(2, ["B"], true)];
    const { totals } = gradeSession(snap, answers);
    expect(totals.scorePercent).toBe(50);
    expect(totals.correct).toBe(1);
    expect(totals.revealed).toBe(1);
  });

  it("revealed-but-correct-guess still does not count as correct", () => {
    const snap = [q(1, "A")];
    const answers = [ans(1, ["A"], true)]; // would be correct, but gave up
    const { totals, perQuestion } = gradeSession(snap, answers);
    expect(totals.correct).toBe(0);
    expect(totals.revealed).toBe(1);
    expect(perQuestion[0]!.outcome).toBe("revealed");
    // raw correctness is still exposed for retake/transparency
    expect(perQuestion[0]!.isCorrect).toBe(true);
  });
});

describe("gradeSession — selection edge cases", () => {
  it("empty selection array is unanswered", () => {
    const { totals } = gradeSession([q(1)], [ans(1, [])]);
    expect(totals.unanswered).toBe(1);
    expect(totals.scorePercent).toBe(0);
  });

  it("multiple selected options for a single-type question is NOT correct", () => {
    const snap = [q(1, "A")];
    const answers = [ans(1, ["A", "B"])];
    const { totals, perQuestion } = gradeSession(snap, answers);
    expect(totals.correct).toBe(0);
    expect(totals.incorrect).toBe(1);
    expect(perQuestion[0]!.isCorrect).toBe(false);
  });

  it("empty snapshot → 0% and zeroed totals (no division by zero)", () => {
    const { totals } = gradeSession([], []);
    expect(totals).toEqual({
      correct: 0,
      incorrect: 0,
      revealed: 0,
      unanswered: 0,
      total: 0,
      scorePercent: 0,
    });
  });
});

describe("gradeSession — rounding (half-up via Math.round, documented)", () => {
  it("rounds 1/3 to 33", () => {
    const snap = [q(1, "A"), q(2, "A"), q(3, "A")];
    const answers = [ans(1, ["A"]), ans(2, ["B"]), ans(3, ["B"])];
    expect(gradeSession(snap, answers).totals.scorePercent).toBe(33);
  });

  it("rounds 2/3 to 67", () => {
    const snap = [q(1, "A"), q(2, "A"), q(3, "A")];
    const answers = [ans(1, ["A"]), ans(2, ["A"]), ans(3, ["B"])];
    expect(gradeSession(snap, answers).totals.scorePercent).toBe(67);
  });

  it("rounds 1/8 (12.5) half-up to 13", () => {
    const snap = Array.from({ length: 8 }, (_, i) => q(i + 1, "A"));
    const answers = snap.map((sq, i) => ans(sq.id, i === 0 ? ["A"] : ["B"]));
    expect(gradeSession(snap, answers).totals.scorePercent).toBe(13);
  });
});

describe("gradeSession — structure ready for multi (future branch)", () => {
  it("an unsupported question type at grade time scores 0, never throws", () => {
    const multi: SnapshotQuestion = {
      id: 1,
      order: 1,
      questionType: "multi",
      questionText: "pick all",
      options: { A: "a", B: "b" },
      correctAnswer: ["A", "B"],
    };
    // Engine refuses to create these; ScoreCalculator must still be total/defensive.
    const { totals, perQuestion } = gradeSession(
      [multi],
      [ans(1, ["A", "B"])],
    );
    expect(perQuestion[0]!.outcome).toBe("incorrect");
    expect(totals.scorePercent).toBe(0);
  });
});
