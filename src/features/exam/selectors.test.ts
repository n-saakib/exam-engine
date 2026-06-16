/**
 * `selectors` tests. The selectors are pure functions derived from the
 * `AnswerState` in the exam store; they are the source of truth for what
 * badge/colour each question's navigator tile shows.
 *
 * Verifies:
 *   - `answerStatus` priority: current > gave_up > answered_correct >
 *     answered_incorrect > answered_pending > flagged > unanswered.
 *   - `countAnswered` counts entries with a selection, reveal, or gaveUp.
 *   - `countFlagged` counts only entries with `flagged === true`.
 *   - `countGaveUp` counts only entries with `gaveUp === true`.
 *   - `liveOutcome` correctly derives correct/incorrect/pending/gave_up
 *     from the answer state and the live question.
 */

import { describe, it, expect } from "vitest";

import {
  answerStatus,
  countAnswered,
  countFlagged,
  countGaveUp,
  liveOutcome,
} from "./selectors";
import type { LiveQuestion } from "@/domain/types";
import type { AnswerState } from "@/store/examStore";

function makeAnswer(overrides: Partial<AnswerState> = {}): AnswerState {
  return {
    selected: [],
    flagged: false,
    revealed: false,
    gaveUp: false,
    timeSpentMs: 0,
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<LiveQuestion> = {}): LiveQuestion {
  return {
    id: "q1",
    prompt: "What?",
    options: [],
    ...overrides,
  } as LiveQuestion;
}

describe("answerStatus", () => {
  it("returns 'current' when isCurrent is true, regardless of state", () => {
    // Even with selection, flag, and reveal all set, the current question
    // is always reported as 'current' so the navigator can highlight it.
    expect(
      answerStatus(
        makeAnswer({ selected: ["A"], flagged: true, revealed: true, gaveUp: true }),
        true,
      ),
    ).toBe("current");
  });

  it("returns 'current' for an empty answer when isCurrent is true", () => {
    // isCurrent wins even over the 'unanswered' default.
    expect(answerStatus(makeAnswer(), true)).toBe("current");
  });

  it("returns 'answered_correct' when revealed with a correct selection", () => {
    // Reveal + matching correctAnswer -> green.
    const q = makeQuestion({ correctAnswer: "A" });
    expect(
      answerStatus(makeAnswer({ revealed: true, selected: ["A"] }), false, q),
    ).toBe("answered_correct");
  });

  it("returns 'answered_correct' for a multi-select match", () => {
    // Order-independent multi-select comparison.
    const q = makeQuestion({ correctAnswer: ["A", "B"] });
    expect(
      answerStatus(
        makeAnswer({ revealed: true, selected: ["B", "A"] }),
        false,
        q,
      ),
    ).toBe("answered_correct");
  });

  it("returns 'answered_incorrect' when revealed with a wrong selection", () => {
    // Reveal + non-matching correctAnswer -> red.
    const q = makeQuestion({ correctAnswer: "A" });
    expect(
      answerStatus(makeAnswer({ revealed: true, selected: ["B"] }), false, q),
    ).toBe("answered_incorrect");
  });

  it("returns 'answered_pending' when revealed but correctAnswer is unknown", () => {
    // Reveal happened, but we don't have the correct key yet (e.g. live
    // question not refreshed with snapshot).
    expect(
      answerStatus(
        makeAnswer({ revealed: true, selected: ["A"] }),
        false,
        makeQuestion(),
      ),
    ).toBe("answered_pending");
  });

  it("returns 'gave_up' when gaveUp is true, regardless of selection", () => {
    // Gave-up outranks everything except 'current'.
    expect(
      answerStatus(
        makeAnswer({ gaveUp: true, selected: ["A"] }),
        false,
      ),
    ).toBe("gave_up");
  });

  it("returns 'gave_up' when revealed with an empty selection", () => {
    // Reveal with no selection means the user gave up post-reveal.
    expect(
      answerStatus(makeAnswer({ revealed: true }), false),
    ).toBe("gave_up");
  });

  it("returns 'flagged' when flagged is true, revealed is false, gaveUp is false, and no selection", () => {
    expect(answerStatus(makeAnswer({ flagged: true }), false)).toBe(
      "flagged",
    );
  });

  it("returns 'flagged' when flagged is true alongside a selection (flag wins over pending)", () => {
    // Pin the priority: a flagged+pending question is 'flagged', not 'answered_pending'.
    expect(
      answerStatus(
        makeAnswer({ flagged: true, selected: ["A"] }),
        false,
      ),
    ).toBe("flagged");
  });

  it("returns 'answered_pending' when selected is non-empty and not flagged/revealed/current/gaveUp", () => {
    expect(answerStatus(makeAnswer({ selected: ["A"] }), false)).toBe(
      "answered_pending",
    );
  });

  it("returns 'answered_pending' for a multi-selection that hasn't been revealed", () => {
    // 'answered_pending' is about having at least one selected option, not the count.
    expect(
      answerStatus(makeAnswer({ selected: ["A", "B", "C"] }), false),
    ).toBe("answered_pending");
  });

  it("returns 'unanswered' for an empty answer state when not current", () => {
    expect(answerStatus(makeAnswer(), false)).toBe("unanswered");
  });

  it("returns 'unanswered' when the answer is undefined and not current", () => {
    // Undefined means "no row in the answers map yet" — same default.
    expect(answerStatus(undefined, false)).toBe("unanswered");
  });
});

describe("liveOutcome", () => {
  it("returns 'unanswered' when the answer is undefined", () => {
    expect(liveOutcome(undefined)).toBe("unanswered");
  });

  it("returns 'unanswered' for an empty state", () => {
    expect(liveOutcome(makeAnswer())).toBe("unanswered");
  });

  it("returns 'gave_up' when gaveUp is true", () => {
    expect(liveOutcome(makeAnswer({ gaveUp: true }))).toBe("gave_up");
  });

  it("returns 'pending' when there is a selection but no reveal", () => {
    expect(liveOutcome(makeAnswer({ selected: ["A"] }))).toBe("pending");
  });

  it("returns 'gave_up' when revealed with no selection", () => {
    expect(liveOutcome(makeAnswer({ revealed: true }))).toBe("gave_up");
  });

  it("returns 'pending' when revealed with a selection but no correctAnswer on the question", () => {
    expect(
      liveOutcome(
        makeAnswer({ revealed: true, selected: ["A"] }),
        makeQuestion(),
      ),
    ).toBe("pending");
  });

  it("returns 'correct' when the selection matches a single correctAnswer", () => {
    const q = makeQuestion({ correctAnswer: "A" });
    expect(
      liveOutcome(makeAnswer({ revealed: true, selected: ["A"] }), q),
    ).toBe("correct");
  });

  it("returns 'incorrect' when the selection does not match a single correctAnswer", () => {
    const q = makeQuestion({ correctAnswer: "A" });
    expect(
      liveOutcome(makeAnswer({ revealed: true, selected: ["B"] }), q),
    ).toBe("incorrect");
  });

  it("returns 'correct' when the selection matches an array correctAnswer as a set", () => {
    const q = makeQuestion({ correctAnswer: ["A", "B"] });
    expect(
      liveOutcome(
        makeAnswer({ revealed: true, selected: ["B", "A"] }),
        q,
      ),
    ).toBe("correct");
  });

  it("returns 'incorrect' when the selection is a subset of an array correctAnswer", () => {
    // Partial match is incorrect.
    const q = makeQuestion({ correctAnswer: ["A", "B"] });
    expect(
      liveOutcome(makeAnswer({ revealed: true, selected: ["A"] }), q),
    ).toBe("incorrect");
  });
});

describe("countAnswered", () => {
  it("returns 0 for an empty answers map", () => {
    expect(countAnswered({})).toBe(0);
  });

  it("counts entries that have a selection", () => {
    // Three selected questions, no reveals → all three are touched.
    const answers: Record<number, AnswerState> = {
      1: makeAnswer({ selected: ["A"] }),
      2: makeAnswer({ selected: ["A", "B"] }),
      3: makeAnswer({ selected: ["B"] }),
    };
    expect(countAnswered(answers)).toBe(3);
  });

  it("counts entries that have been revealed", () => {
    // Revealed but never selected is still touched from the nav's POV
    // (the user has seen and acknowledged the answer).
    const answers: Record<number, AnswerState> = {
      4: makeAnswer({ revealed: true }),
      5: makeAnswer({ revealed: true }),
    };
    expect(countAnswered(answers)).toBe(2);
  });

  it("counts entries that have BOTH a selection and a reveal exactly once", () => {
    // The OR predicate must not double-count a single entry.
    const answers: Record<number, AnswerState> = {
      6: makeAnswer({ selected: ["A"], revealed: true }),
    };
    expect(countAnswered(answers)).toBe(1);
  });

  it("ignores entries with neither a selection nor a reveal", () => {
    // A mix that includes untouched questions — only the touched ones count.
    const answers: Record<number, AnswerState> = {
      1: makeAnswer({ selected: ["A"] }),
      2: makeAnswer(), // empty — not counted
      3: makeAnswer({ revealed: true }),
      4: makeAnswer(), // empty — not counted
      5: makeAnswer({ flagged: true }), // flagged but no select/reveal — not counted
    };
    expect(countAnswered(answers)).toBe(2);
  });
});

describe("countFlagged", () => {
  it("returns 0 for an empty answers map", () => {
    expect(countFlagged({})).toBe(0);
  });

  it("counts only entries with flagged === true", () => {
    // Selection/reveal/empty entries must NOT be counted as flagged.
    const answers: Record<number, AnswerState> = {
      1: makeAnswer({ selected: ["A"] }), // pending, not flagged
      2: makeAnswer({ revealed: true }), // revealed, not flagged
      3: makeAnswer(), // untouched
      4: makeAnswer({ flagged: true }), // ← counted
      5: makeAnswer({ flagged: true, selected: ["A"] }), // ← counted (flag + answer)
      6: makeAnswer({ flagged: true, revealed: true }), // ← counted (flag + reveal)
    };
    expect(countFlagged(answers)).toBe(3);
  });
});

describe("countGaveUp", () => {
  it("returns 0 for an empty answers map", () => {
    expect(countGaveUp({})).toBe(0);
  });

  it("counts only entries with gaveUp === true", () => {
    const answers: Record<number, AnswerState> = {
      1: makeAnswer({ selected: ["A"] }), // pending
      2: makeAnswer({ revealed: true, selected: ["A"] }), // revealed, not gave up
      3: makeAnswer(), // untouched
      4: makeAnswer({ gaveUp: true }), // ← counted
      5: makeAnswer({ gaveUp: true, selected: ["A"] }), // ← counted (gave up + select)
      6: makeAnswer({ gaveUp: true, revealed: true }), // ← counted (gave up + reveal)
    };
    expect(countGaveUp(answers)).toBe(3);
  });
});
