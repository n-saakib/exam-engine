/**
 * <OptionList> tests. The component renders one checkbox-button per option,
 * honours `question.optionOrder` from the server snapshot when present, and
 * falls back to `Object.keys(question.options)` when absent.
 *
 * Verifies:
 *   - When `optionOrder` is absent, options render in option-map insertion order.
 *   - When `optionOrder` is present, options render in THAT exact order (this
 *     is the bug we're guarding against: previously some code paths re-derived
 *     order from the option map and ignored the server-provided shuffle).
 *   - `optionOrder` entries that don't appear in `options` are filtered out
 *     defensively (snapshot drift tolerance).
 *   - Clicking a button calls `onSelect(key)`.
 *   - Post-reveal, correct options get `data-correct="true"` and wrong
 *     selections get `data-incorrect="true"`.
 */

import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { LiveQuestion } from "@/domain/types";
import type { AnswerState } from "@/store/examStore";

vi.mock("@/lib/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import { OptionList } from "./OptionList";

function makeQuestion(overrides: Partial<LiveQuestion> = {}): LiveQuestion {
  return {
    id: 1,
    order: 0,
    questionType: "single",
    questionText: "Pick one",
    options: { A: "alpha", B: "bravo", C: "charlie" },
    answer: { selected: [], flagged: false, revealed: false, gaveUp: false, timeSpentMs: 0 },
    ...overrides,
  };
}

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

function renderOptionList(question: LiveQuestion, answer: AnswerState, onSelect = vi.fn()) {
  return render(<OptionList question={question} answer={answer} onSelect={onSelect} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<OptionList>", () => {
  it("renders options in Object.keys(question.options) order when no optionOrder is set (fallback)", () => {
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo", C: "charlie" },
      // optionOrder intentionally omitted
    });
    const answer = makeAnswer();

    renderOptionList(question, answer);

    const list = screen.getByTestId("option-list");
    const buttons = within(list).getAllByRole("checkbox");
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.getAttribute("data-option"))).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("renders options in the EXACT order from question.optionOrder when present", () => {
    // The option map insertion order is A, B, C — but the server snapshot
    // tells us the shuffled display order is C, A, B. We must render C, A, B
    // and not fall back to the option map.
    const question = makeQuestion({
      options: { A: "first", B: "second", C: "third" },
      optionOrder: ["C", "A", "B"],
    });
    const answer = makeAnswer();

    renderOptionList(question, answer);

    const list = screen.getByTestId("option-list");
    const buttons = within(list).getAllByRole("checkbox");
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.getAttribute("data-option"))).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  it("filters optionOrder to drop keys that aren't in options (defensive)", () => {
    // "GHOST" and "X" appear in the snapshot's optionOrder but were removed
    // from the options map (e.g. server-side change). They must be dropped
    // and the surviving keys must keep their declared order.
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo", C: "charlie" },
      optionOrder: ["GHOST", "B", "X", "A", "C"],
    });
    const answer = makeAnswer();

    renderOptionList(question, answer);

    const list = screen.getByTestId("option-list");
    const buttons = within(list).getAllByRole("checkbox");
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.getAttribute("data-option"))).toEqual([
      "B",
      "A",
      "C",
    ]);
  });

  it("calls onSelect with the clicked option key", () => {
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo", C: "charlie" },
    });
    const answer = makeAnswer();
    const onSelect = vi.fn();

    renderOptionList(question, answer, onSelect);

    const list = screen.getByTestId("option-list");
    const buttons = within(list).getAllByRole("checkbox");
    fireEvent.click(buttons[1]); // B
    fireEvent.click(buttons[2]); // C

    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenNthCalledWith(1, "B");
    expect(onSelect).toHaveBeenNthCalledWith(2, "C");
  });

  it("marks selected options with data-selected='true' pre-reveal", () => {
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo", C: "charlie" },
    });
    const answer = makeAnswer({ selected: ["B"] });

    renderOptionList(question, answer);

    const list = screen.getByTestId("option-list");
    const aBtn = within(list).getByRole("checkbox", { name: /alpha/i });
    const bBtn = within(list).getByRole("checkbox", { name: /bravo/i });
    const cBtn = within(list).getByRole("checkbox", { name: /charlie/i });

    expect(bBtn).toHaveAttribute("data-selected", "true");
    expect(aBtn).not.toHaveAttribute("data-selected", "true");
    expect(cBtn).not.toHaveAttribute("data-selected", "true");
    // No reveal → no correctness data attrs.
    expect(bBtn).not.toHaveAttribute("data-correct", "true");
    expect(bBtn).not.toHaveAttribute("data-incorrect", "true");
  });

  it("post-reveal: marks correct options with data-correct='true' and wrong selections with data-incorrect='true'", () => {
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo", C: "charlie" },
      correctAnswer: "B",
    });
    // User picked A (wrong) and B (correct); C was untouched.
    const answer = makeAnswer({ selected: ["A", "B"], revealed: true });

    renderOptionList(question, answer);

    const list = screen.getByTestId("option-list");
    const aBtn = within(list).getByRole("checkbox", { name: /alpha/i });
    const bBtn = within(list).getByRole("checkbox", { name: /bravo/i });
    const cBtn = within(list).getByRole("checkbox", { name: /charlie/i });

    // Correct option is B.
    expect(bBtn).toHaveAttribute("data-correct", "true");
    expect(bBtn).not.toHaveAttribute("data-incorrect", "true");

    // A was selected but is not the correct answer → wrong pick.
    expect(aBtn).toHaveAttribute("data-incorrect", "true");
    expect(aBtn).not.toHaveAttribute("data-correct", "true");

    // C was not selected and is not correct → no correctness marker.
    expect(cBtn).not.toHaveAttribute("data-correct", "true");
    expect(cBtn).not.toHaveAttribute("data-incorrect", "true");
  });

  it("post-reveal: handles multi-correct answers (array correctAnswer)", () => {
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo", C: "charlie" },
      correctAnswer: ["A", "C"],
    });
    const answer = makeAnswer({ selected: ["A", "B"], revealed: true });

    renderOptionList(question, answer);

    const list = screen.getByTestId("option-list");
    const aBtn = within(list).getByRole("checkbox", { name: /alpha/i });
    const bBtn = within(list).getByRole("checkbox", { name: /bravo/i });
    const cBtn = within(list).getByRole("checkbox", { name: /charlie/i });

    // Both A and C are correct.
    expect(aBtn).toHaveAttribute("data-correct", "true");
    expect(cBtn).toHaveAttribute("data-correct", "true");
    // B was selected but isn't in the correct set → wrong pick.
    expect(bBtn).toHaveAttribute("data-incorrect", "true");
  });

  it("post-reveal with no correctAnswer on the question: no correctness markers are applied", () => {
    // `correctAnswer` may be absent on the question even when `revealed` is true
    // (e.g. lock-only flow). The component must not mis-mark anything as
    // correct/incorrect in that case.
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo" },
      // correctAnswer omitted
    });
    const answer = makeAnswer({ selected: ["A"], revealed: true });

    renderOptionList(question, answer);

    const list = screen.getByTestId("option-list");
    const aBtn = within(list).getByRole("checkbox", { name: /alpha/i });
    const bBtn = within(list).getByRole("checkbox", { name: /bravo/i });

    expect(aBtn).not.toHaveAttribute("data-correct", "true");
    expect(aBtn).not.toHaveAttribute("data-incorrect", "true");
    expect(bBtn).not.toHaveAttribute("data-correct", "true");
    expect(bBtn).not.toHaveAttribute("data-incorrect", "true");
  });
});
