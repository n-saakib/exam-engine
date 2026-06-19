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

/** Build a single-choice snapshot question (correctAnswer defaults to ["A"]). */
function q(id: number, correctAnswer: string | string[] = ["A"]): SnapshotQuestion {
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
  gaveUp = false,
): AnswerInput {
  return { questionId, selected, revealed, gaveUp };
}

describe("gradeSession — outcomes", () => {
  it("all correct → 100%", () => {
    const snap = [q(1, ["A"]), q(2, ["B"]), q(3, ["C"])];
    const answers = [ans(1, ["A"]), ans(2, ["B"]), ans(3, ["C"])];
    const { totals } = gradeSession(snap, answers);
    expect(totals).toMatchObject({
      correct: 3,
      incorrect: 0,
      gaveUp: 0,
      total: 3,
      scorePercent: 100,
    });
  });

  it("all wrong → 0%", () => {
    const snap = [q(1, ["A"]), q(2, ["A"])];
    const answers = [ans(1, ["B"]), ans(2, ["C"])];
    const { totals, perQuestion } = gradeSession(snap, answers);
    expect(totals).toMatchObject({ correct: 0, incorrect: 2, scorePercent: 0 });
    expect(perQuestion.map((p) => p.outcome)).toEqual(["incorrect", "incorrect"]);
  });

  it("mixed correct/incorrect", () => {
    const snap = [q(1, ["A"]), q(2, ["B"]), q(3, ["C"]), q(4, ["D"])];
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

  it("blank-at-submit (empty selection) counts as gave_up, not incorrect", () => {
    const snap = [q(1, ["A"]), q(2, ["B"])];
    const answers = [ans(1, ["A"]), ans(2, [])];
    const { totals, perQuestion } = gradeSession(snap, answers);
    expect(totals).toMatchObject({
      correct: 1,
      incorrect: 0,
      gaveUp: 1,
      total: 2,
      scorePercent: 50,
    });
    expect(perQuestion[1]!.outcome).toBe("gave_up");
    expect(perQuestion[1]!.isCorrect).toBeNull();
  });

  it("a missing answer row is treated as gave_up (blank)", () => {
    const snap = [q(1, ["A"]), q(2, ["B"])];
    const answers = [ans(1, ["A"])]; // no row for q2
    const { totals, perQuestion } = gradeSession(snap, answers);
    expect(totals.gaveUp).toBe(1);
    expect(perQuestion[1]!.outcome).toBe("gave_up");
  });

  it("accepts the legacy string-shaped correctAnswer (backward-compat shim) and grades correctly", () => {
    // Pre-ADR-13 snapshots may still hold a string for `single` questions.
    const snap = [q(1, "A")];
    const answers = [ans(1, ["A"])];
    const { totals } = gradeSession(snap, answers);
    expect(totals.correct).toBe(1);
    expect(totals.scorePercent).toBe(100);
  });
});

describe("gradeSession — gave_up semantics (replaces old 'revealed' outcome)", () => {
  // `revealed` is no longer a post-submit outcome. Revealed-without-picking
  // is classified as `gave_up`, alongside explicit give-ups and blank-at-submit.
  // Revealed-with-a-(wrong-)selection becomes `incorrect` (the user actually
  // committed an answer).

  it("revealed-empty counts as gave_up (was 'revealed')", () => {
    const snap = [q(1, ["A"]), q(2, ["B"])];
    const answers = [ans(1, ["A"]), ans(2, [], true)]; // revealed, no selection
    const { totals, perQuestion } = gradeSession(snap, answers);
    expect(totals).toMatchObject({
      correct: 1,
      incorrect: 0,
      gaveUp: 1,
      total: 2,
    });
    expect(perQuestion[1]!.outcome).toBe("gave_up");
  });

  it("revealed-with-a-wrong-selection counts as incorrect (was 'revealed')", () => {
    const snap = [q(1, ["A"]), q(2, ["B"]), q(3, ["C"])];
    const answers = [
      ans(1, ["A"]), // correct
      ans(2, ["X"], true), // revealed, had a (wrong) selection
      ans(3, [], true), // revealed, no selection → gave_up
    ];
    const { totals, perQuestion } = gradeSession(snap, answers);
    expect(totals).toMatchObject({
      correct: 1,
      incorrect: 1,
      gaveUp: 1,
      total: 3,
    });
    expect(perQuestion[1]!.outcome).toBe("incorrect");
    expect(perQuestion[2]!.outcome).toBe("gave_up");
  });

  it("gave_up pulls the percentage down (denominator is full total, not just graded)", () => {
    // 1 correct out of 2 questions, the other gave_up → 1/2 = 50%, NOT 100%.
    const snap = [q(1, ["A"]), q(2, ["B"])];
    const answers = [ans(1, ["A"]), ans(2, [], false, true)]; // explicit give-up
    const { totals } = gradeSession(snap, answers);
    expect(totals.scorePercent).toBe(50);
    expect(totals.correct).toBe(1);
    expect(totals.gaveUp).toBe(1);
  });

  it("explicit gave_up with a correct selection still does not count as correct", () => {
    const snap = [q(1, ["A"])];
    const answers = [ans(1, ["A"], false, true)]; // would be correct, but user gave up
    const { totals, perQuestion } = gradeSession(snap, answers);
    expect(totals.correct).toBe(0);
    expect(totals.gaveUp).toBe(1);
    expect(perQuestion[0]!.outcome).toBe("gave_up");
    // raw correctness is still null when the user gave up (no selection was committed)
    expect(perQuestion[0]!.isCorrect).toBeNull();
  });
});

describe("gradeSession — selection edge cases", () => {
  it("empty selection array is gave_up", () => {
    const { totals } = gradeSession([q(1)], [ans(1, [])]);
    expect(totals.gaveUp).toBe(1);
    expect(totals.scorePercent).toBe(0);
  });

  it("multiple selected options for a single-type question is NOT correct", () => {
    const snap = [q(1, ["A"])];
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
      gaveUp: 0,
      total: 0,
      scorePercent: 0,
    });
  });
});

describe("gradeSession — rounding (half-up via Math.round, documented)", () => {
  it("rounds 1/3 to 33", () => {
    const snap = [q(1, ["A"]), q(2, ["A"]), q(3, ["A"])];
    const answers = [ans(1, ["A"]), ans(2, ["B"]), ans(3, ["B"])];
    expect(gradeSession(snap, answers).totals.scorePercent).toBe(33);
  });

  it("rounds 2/3 to 67", () => {
    const snap = [q(1, ["A"]), q(2, ["A"]), q(3, ["A"])];
    const answers = [ans(1, ["A"]), ans(2, ["A"]), ans(3, ["B"])];
    expect(gradeSession(snap, answers).totals.scorePercent).toBe(67);
  });

  it("rounds 1/8 (12.5) half-up to 13", () => {
    const snap = Array.from({ length: 8 }, (_, i) => q(i + 1, ["A"]));
    const answers = snap.map((sq, i) => ans(sq.id, i === 0 ? ["A"] : ["B"]));
    expect(gradeSession(snap, answers).totals.scorePercent).toBe(13);
  });
});

describe("gradeSession — multi (set equality, ADR-13)", () => {
  function multiQ(id: number, correctAnswer: string[]): SnapshotQuestion {
    return {
      id,
      order: id,
      questionType: "multi",
      questionText: `MQ${id}`,
      options: { A: "a", B: "b", C: "c", D: "d" },
      correctAnswer,
    };
  }

  it("a matching set selection is correct (100%)", () => {
    const { totals, perQuestion } = gradeSession(
      [multiQ(1, ["A", "C"])],
      [ans(1, ["A", "C"])],
    );
    expect(perQuestion[0]!.outcome).toBe("correct");
    expect(perQuestion[0]!.isCorrect).toBe(true);
    expect(totals.scorePercent).toBe(100);
  });

  it("a partial selection is incorrect (strict set equality, no partial credit)", () => {
    const { totals, perQuestion } = gradeSession(
      [multiQ(1, ["A", "B"])],
      [ans(1, ["A"])],
    );
    expect(perQuestion[0]!.outcome).toBe("incorrect");
    expect(perQuestion[0]!.isCorrect).toBe(false);
    expect(totals.scorePercent).toBe(0);
  });

  it("an extra selection (user picked 1 too many) is incorrect", () => {
    const { perQuestion } = gradeSession(
      [multiQ(1, ["A", "B"])],
      [ans(1, ["A", "B", "C"])],
    );
    expect(perQuestion[0]!.outcome).toBe("incorrect");
  });

  it("a different order but the same set is correct (set equality, not sequence)", () => {
    const { perQuestion } = gradeSession(
      [multiQ(1, ["A", "B"])],
      [ans(1, ["B", "A"])],
    );
    expect(perQuestion[0]!.outcome).toBe("correct");
  });

  it("an empty selection on a multi question is gave_up", () => {
    const { totals, perQuestion } = gradeSession(
      [multiQ(1, ["A", "B"])],
      [ans(1, [])],
    );
    expect(perQuestion[0]!.outcome).toBe("gave_up");
    expect(perQuestion[0]!.isCorrect).toBeNull();
    expect(totals.scorePercent).toBe(0);
  });
});

describe("gradeSession — ordered (still unsupported, defensive floor)", () => {
  it("an ordered-type question at grade time scores 0, never throws", () => {
    const ordered: SnapshotQuestion = {
      id: 1,
      order: 1,
      questionType: "ordered",
      questionText: "rank",
      options: { A: "a", B: "b", C: "c" },
      correctAnswer: ["A", "B", "C"],
    };
    // Engine refuses to create these; ScoreCalculator must still be total/defensive.
    const { totals, perQuestion } = gradeSession(
      [ordered],
      [ans(1, ["A", "B", "C"])],
    );
    expect(perQuestion[0]!.outcome).toBe("incorrect");
    expect(totals.scorePercent).toBe(0);
  });
});
