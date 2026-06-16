/**
 * `selectors` tests. The selectors are pure functions derived from the
 * `AnswerState` in the exam store; they are the source of truth for what
 * badge/colour each question's navigator tile shows.
 *
 * Verifies:
 *   - `answerStatus` priority: current > revealed > flagged > answered > unanswered.
 *   - `countAnswered` counts entries with a selection OR a reveal (whichever applies).
 *   - `countFlagged` counts only entries with `flagged === true`.
 */

import { describe, it, expect } from "vitest";

import { answerStatus, countAnswered, countFlagged } from "./selectors";
import type { AnswerState } from "@/store/examStore";

function makeAnswer(overrides: Partial<AnswerState> = {}): AnswerState {
  return {
    selected: [],
    flagged: false,
    revealed: false,
    timeSpentMs: 0,
    ...overrides,
  };
}

describe("answerStatus", () => {
  it("returns 'current' when isCurrent is true, regardless of state", () => {
    // Even with selection, flag, and reveal all set, the current question
    // is always reported as 'current' so the navigator can highlight it.
    expect(
      answerStatus(
        makeAnswer({ selected: ["A"], flagged: true, revealed: true }),
        true,
      ),
    ).toBe("current");
  });

  it("returns 'current' for an empty answer when isCurrent is true", () => {
    // isCurrent wins even over the 'unanswered' default.
    expect(answerStatus(makeAnswer(), true)).toBe("current");
  });

  it("returns 'revealed' when revealed is true and not current", () => {
    // Reveal outranks everything except 'current'.
    expect(answerStatus(makeAnswer({ revealed: true }), false)).toBe(
      "revealed",
    );
  });

  it("returns 'revealed' even when flagged is also true", () => {
    // A flagged + revealed question is still 'revealed' (flag is a sticky
    // bookmark; the post-reveal badge supersedes it).
    expect(
      answerStatus(makeAnswer({ revealed: true, flagged: true }), false),
    ).toBe("revealed");
  });

  it("returns 'revealed' even when there is a selection", () => {
    // Reveal outranks a selection-based 'answered' status.
    expect(
      answerStatus(
        makeAnswer({ revealed: true, selected: ["A"] }),
        false,
      ),
    ).toBe("revealed");
  });

  it("returns 'flagged' when flagged is true, revealed is false, and no selection", () => {
    expect(answerStatus(makeAnswer({ flagged: true }), false)).toBe(
      "flagged",
    );
  });

  it("returns 'flagged' when flagged is true alongside a selection (flag wins)", () => {
    // Pin the priority: a flagged+answered question is 'flagged', not 'answered'.
    expect(
      answerStatus(
        makeAnswer({ flagged: true, selected: ["A"] }),
        false,
      ),
    ).toBe("flagged");
  });

  it("returns 'answered' when selected is non-empty and not flagged/revealed/current", () => {
    expect(answerStatus(makeAnswer({ selected: ["A"] }), false)).toBe(
      "answered",
    );
  });

  it("returns 'answered' for a multi-selection", () => {
    // 'answered' is about having at least one selected option, not the count.
    expect(
      answerStatus(makeAnswer({ selected: ["A", "B", "C"] }), false),
    ).toBe("answered");
  });

  it("returns 'unanswered' for an empty answer state when not current", () => {
    expect(answerStatus(makeAnswer(), false)).toBe("unanswered");
  });

  it("returns 'unanswered' when the answer is undefined and not current", () => {
    // Undefined means "no row in the answers map yet" — same default.
    expect(answerStatus(undefined, false)).toBe("unanswered");
  });
});

describe("countAnswered", () => {
  it("returns 0 for an empty answers map", () => {
    expect(countAnswered({})).toBe(0);
  });

  it("counts entries that have a selection", () => {
    // Three selected questions, no reveals → all three are 'answered'.
    const answers: Record<number, AnswerState> = {
      1: makeAnswer({ selected: ["A"] }),
      2: makeAnswer({ selected: ["A", "B"] }),
      3: makeAnswer({ selected: ["B"] }),
    };
    expect(countAnswered(answers)).toBe(3);
  });

  it("counts entries that have been revealed", () => {
    // Revealed but never selected is still 'answered' from the nav's POV
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
      1: makeAnswer({ selected: ["A"] }), // answered, not flagged
      2: makeAnswer({ revealed: true }), // revealed, not flagged
      3: makeAnswer(), // untouched
      4: makeAnswer({ flagged: true }), // ← counted
      5: makeAnswer({ flagged: true, selected: ["A"] }), // ← counted (flag + answer)
      6: makeAnswer({ flagged: true, revealed: true }), // ← counted (flag + reveal)
    };
    expect(countFlagged(answers)).toBe(3);
  });
});
