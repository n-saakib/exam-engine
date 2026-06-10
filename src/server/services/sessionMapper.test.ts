import { describe, expect, it } from "vitest";

import { toLiveSession, toResults } from "@/server/services/sessionMapper";
import type { SessionRow } from "@/server/data/repos/sessionRepo";
import type { AnswerRow } from "@/server/data/repos/answerRepo";
import type { SnapshotQuestion } from "@/domain/schemas";

/**
 * Direct unit tests for the answers-hidden DTO mapper (03 §8, F4-T6). This is the
 * server-side gate that strips correctAnswer/explanations/Tips for unrevealed
 * questions — verified WITHOUT going through the DB.
 */

const SNAPSHOT: SnapshotQuestion[] = [
  {
    id: 7,
    order: 1,
    questionType: "single",
    questionText: "Q7?",
    options: { A: "a", B: "b", C: "c" },
    optionOrder: ["A", "B", "C"],
    correctAnswer: "B",
    explanations: {
      A: { description: "A", reason: "no" },
      B: { description: "B", reason: "yes" },
      C: { description: "C", reason: "no" },
    },
    Tips: "tip-7",
  },
  {
    id: 9,
    order: 2,
    questionType: "single",
    questionText: "Q9?",
    options: { A: "a", B: "b" },
    optionOrder: ["A", "B"],
    correctAnswer: "A",
    explanations: {
      A: { description: "A", reason: "yes" },
      B: { description: "B", reason: "no" },
    },
    Tips: "tip-9",
  },
];

function row(over: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "s1",
    status: "in_progress",
    ques_path: "Exams/X",
    domain_label: "X / Y",
    set_id: "set-1",
    set_title: "Set One",
    difficulty: "Easy",
    question_snapshot: JSON.stringify(SNAPSHOT),
    total_questions: 2,
    timer_enabled: 1,
    timer_limit_ms: 600000,
    time_elapsed_ms: 1000,
    current_index: 0,
    shuffle_seed: "seed",
    mode: "full",
    origin_session_id: null,
    score_percent: null,
    correct_count: null,
    incorrect_count: null,
    revealed_count: null,
    unanswered_count: null,
    is_bookmarked: 0,
    note: null,
    created_at: "t0",
    started_at: "t0",
    updated_at: "t0",
    completed_at: null,
    ...over,
  };
}

function answer(over: Partial<AnswerRow> & { question_id: number }): AnswerRow {
  return {
    id: over.question_id,
    session_id: "s1",
    selected_options: "[]",
    is_flagged: 0,
    is_revealed: 0,
    is_correct: null,
    confidence: null,
    time_spent_ms: 0,
    answered_at: null,
    ...over,
  };
}

describe("toLiveSession — answers hidden", () => {
  it("omits correctAnswer/explanations/Tips for unrevealed questions", () => {
    const dto = toLiveSession(row(), [
      answer({ question_id: 7 }),
      answer({ question_id: 9 }),
    ]);
    for (const q of dto.questions) {
      expect(q.correctAnswer).toBeUndefined();
      expect(q.explanations).toBeUndefined();
      expect(q.Tips).toBeUndefined();
    }
  });

  it("includes correct data ONLY for the revealed question", () => {
    const dto = toLiveSession(row(), [
      answer({ question_id: 7, is_revealed: 1 }),
      answer({ question_id: 9 }), // not revealed
    ]);
    const q7 = dto.questions.find((q) => q.id === 7)!;
    const q9 = dto.questions.find((q) => q.id === 9)!;

    expect(q7.correctAnswer).toBe("B");
    expect(q7.explanations).toBeDefined();
    expect(q7.Tips).toBe("tip-7");

    expect(q9.correctAnswer).toBeUndefined();
    expect(q9.explanations).toBeUndefined();
    expect(q9.Tips).toBeUndefined();
  });

  it("carries per-question answer state (selected/flagged/revealed/confidence/time)", () => {
    const dto = toLiveSession(row(), [
      answer({
        question_id: 7,
        selected_options: JSON.stringify(["A"]),
        is_flagged: 1,
        confidence: "medium",
        time_spent_ms: 4200,
      }),
      answer({ question_id: 9 }),
    ]);
    const q7 = dto.questions.find((q) => q.id === 7)!;
    expect(q7.answer).toEqual({
      selected: ["A"],
      flagged: true,
      revealed: false,
      confidence: "medium",
      timeSpentMs: 4200,
    });
  });

  it("preserves snapshot presentation order and optionOrder", () => {
    const dto = toLiveSession(row(), [
      answer({ question_id: 7 }),
      answer({ question_id: 9 }),
    ]);
    expect(dto.questions.map((q) => q.id)).toEqual([7, 9]);
    expect(dto.questions[0]!.optionOrder).toEqual(["A", "B", "C"]);
  });

  it("sets timer.expired when timed and elapsed >= limit", () => {
    const dto = toLiveSession(row({ time_elapsed_ms: 600000 }), [
      answer({ question_id: 7 }),
      answer({ question_id: 9 }),
    ]);
    expect(dto.timer.expired).toBe(true);
  });

  it("does not set expired when under the limit", () => {
    const dto = toLiveSession(row({ time_elapsed_ms: 5 }), [
      answer({ question_id: 7 }),
      answer({ question_id: 9 }),
    ]);
    expect(dto.timer.expired).toBeUndefined();
  });
});

describe("toResults — answers shown", () => {
  it("includes correctAnswer/explanations for every question and computes outcomes", () => {
    const completed = row({
      status: "completed",
      score_percent: 50,
      correct_count: 1,
      incorrect_count: 1,
      revealed_count: 0,
      unanswered_count: 0,
      completed_at: "t1",
    });
    const results = toResults(completed, [
      answer({ question_id: 7, selected_options: JSON.stringify(["B"]) }), // correct
      answer({ question_id: 9, selected_options: JSON.stringify(["B"]) }), // incorrect
    ]);
    expect(results.summary.scorePercent).toBe(50);
    const q7 = results.questions.find((q) => q.id === 7)!;
    const q9 = results.questions.find((q) => q.id === 9)!;
    expect(q7.correctAnswer).toBe("B");
    expect(q7.outcome).toBe("correct");
    expect(q7.yourAnswer).toEqual(["B"]);
    expect(q9.outcome).toBe("incorrect");
    expect(q9.explanations).toBeDefined();
  });
});
