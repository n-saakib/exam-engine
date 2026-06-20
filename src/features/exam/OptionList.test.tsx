/**
 * <OptionList> tests. The component renders one checkbox-button per option
 * with the chips ALWAYS in the fixed A, B, C, D order (ADR-15). The chip's
 * `data-label` is the display letter (A/B/C/...) and `data-option` is the
 * underlying option key that the click handler receives — these differ when
 * the snapshot's `optionOrder` maps a display position to a shuffled key.
 *
 * Verifies:
 *   - Chips render in fixed A, B, C, D order regardless of `optionOrder`.
 *   - `data-option` is the underlying key (from `optionOrder[i]`, or the
 *     display letter when no shuffle is in effect).
 *   - `optionOrder` entries that don't appear in `options` are dropped
 *     defensively (snapshot drift tolerance).
 *   - Clicking a button calls `onSelect(underlyingKey)`.
 *   - Post-commit, correct options get `data-correct="true"` and wrong
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
    answer: { selected: [], flagged: false, committed: false, gaveUp: false, timeSpentMs: 0 },
    ...overrides,
  };
}

function makeAnswer(overrides: Partial<AnswerState> = {}): AnswerState {
  return {
    selected: [],
    flagged: false,
    committed: false,
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
  it("renders chips in fixed A, B, C, D order; data-option is the underlying key (no shuffle)", () => {
    // No optionOrder set: the display letter IS the underlying key, and the
    // chip labels read A, B, C in canonical order.
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo", C: "charlie" },
      // optionOrder intentionally omitted
    });
    const answer = makeAnswer();

    renderOptionList(question, answer);

    const list = screen.getByTestId("option-list");
    const buttons = within(list).getAllByRole("checkbox");
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.getAttribute("data-label"))).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(buttons.map((b) => b.getAttribute("data-option"))).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("[BUG GUARD] keeps chips in fixed A, B, C, D order even when optionOrder is shuffled", () => {
    // ADR-15: the chip letter is always A, B, C, D — never the shuffled
    // order. The underlying key (the one stored in `selected`) is remapped
    // from the snapshot's optionOrder. So with optionOrder=[C, A, B] the
    // first chip is still labeled A, but it points at the underlying "C".
    const question = makeQuestion({
      options: { A: "first", B: "second", C: "third" },
      optionOrder: ["C", "A", "B"],
    });
    const answer = makeAnswer();

    renderOptionList(question, answer);

    const list = screen.getByTestId("option-list");
    const buttons = within(list).getAllByRole("checkbox");
    expect(buttons).toHaveLength(3);
    // Display order: always A, B, C.
    expect(buttons.map((b) => b.getAttribute("data-label"))).toEqual([
      "A",
      "B",
      "C",
    ]);
    // Underlying key (for onSelect) is remapped from optionOrder.
    expect(buttons.map((b) => b.getAttribute("data-option"))).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  it("filters out optionOrder entries that aren't in options (defensive)", () => {
    // "GHOST" and "X" appear in optionOrder but were removed from the
    // options map. They must be dropped; surviving entries keep their slot
    // in the display order, and the display letter for the dropped slot
    // falls back to being its own underlying key.
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo", C: "charlie" },
      optionOrder: ["GHOST", "B", "X", "A", "C"],
    });
    const answer = makeAnswer();

    renderOptionList(question, answer);

    const list = screen.getByTestId("option-list");
    const buttons = within(list).getAllByRole("checkbox");
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.getAttribute("data-label"))).toEqual([
      "A",
      "B",
      "C",
    ]);
    // Display A → optionOrder[0]="GHOST" is missing → falls back to "A".
    // Display B → optionOrder[1]="B" → "B".
    // Display C → optionOrder[2]="X" is missing → falls back to "C".
    expect(buttons.map((b) => b.getAttribute("data-option"))).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("clicking a chip calls onSelect with the underlying key (not the display label)", () => {
    // With optionOrder=[B, C, A, D], clicking chip A (the FIRST chip) must
    // fire onSelect with the underlying "B" — not "A". This is the contract
    // that keeps the rest of the app (selected storage, grading) stable
    // while the chip labels are fixed.
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo", C: "charlie", D: "delta" },
      optionOrder: ["B", "C", "A", "D"],
    });
    const answer = makeAnswer();
    const onSelect = vi.fn();

    renderOptionList(question, answer, onSelect);

    const list = screen.getByTestId("option-list");
    const buttons = within(list).getAllByRole("checkbox");
    fireEvent.click(buttons[0]); // chip "A" → underlying "B"
    fireEvent.click(buttons[2]); // chip "C" → underlying "A"

    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenNthCalledWith(1, "B");
    expect(onSelect).toHaveBeenNthCalledWith(2, "A");
  });

  it("calls onSelect with the clicked option key (no shuffle case)", () => {
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

  it("marks selected options with data-selected='true' pre-commit", () => {
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
    // No commit → no correctness data attrs.
    expect(bBtn).not.toHaveAttribute("data-correct", "true");
    expect(bBtn).not.toHaveAttribute("data-incorrect", "true");
  });

  it("post-commit: marks correct options with data-correct='true' and wrong selections with data-incorrect='true'", () => {
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo", C: "charlie" },
      correctAnswer: "B",
    });
    // User picked A (wrong) and B (correct); C was untouched.
    const answer = makeAnswer({ selected: ["A", "B"], committed: true });

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

  it("post-commit: handles multi-correct answers (array correctAnswer)", () => {
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo", C: "charlie" },
      correctAnswer: ["A", "C"],
    });
    const answer = makeAnswer({ selected: ["A", "B"], committed: true });

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

  it("post-commit with no correctAnswer on the question: no correctness markers are applied", () => {
    // `correctAnswer` may be absent on the question even when `committed` is true
    // (e.g. lock-only flow). The component must not mis-mark anything as
    // correct/incorrect in that case.
    const question = makeQuestion({
      options: { A: "alpha", B: "bravo" },
      // correctAnswer omitted
    });
    const answer = makeAnswer({ selected: ["A"], committed: true });

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
