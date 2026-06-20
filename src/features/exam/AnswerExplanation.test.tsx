/**
 * <AnswerExplanation> tests. The component is the post-commit panel shown
 * after the user has submitted or given up on a question. The "Correct
 * answer: …" header is always visible; the per-option explanations and
 * Tips are collapsed behind a "Show explanation" / "Hide explanation"
 * toggle so the user isn't dumped the full reasoning at commit time.
 *
 * BUG GUARD: The most important test in this file verifies that the
 * explanations list is rendered in the FIXED A, B, C, D order (ADR-15), with
 * each chip's letter mapped to the underlying key from `optionOrder`. If
 * this breaks, the user sees a "C" chip next to a description that actually
 * belongs to option A — confusing and hard to spot in review.
 *
 * The `data-testid="revealed-detail"` selector is preserved so the e2e
 * spine selector remains stable across the rename.
 *
 * Verifies:
 *   - Returns null when no `correctAnswer` is set.
 *   - Joins the correct answer keys with ", ".
 *   - (BUG GUARD) Iterates explanations in fixed A, B, C, D order; the
 *     description text comes from the underlying key (via optionOrder).
 *   - Falls back to `Object.keys(options)` when `optionOrder` is absent.
 *   - Renders `question.Tips` when present (after opening the toggle).
 *   - Legacy `correctAnswer: string` (single letter) shape is supported.
 *   - Toggle: collapsed by default, opens / closes on click, hidden when
 *     there's nothing to show.
 */

import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";
import type { LiveQuestion } from "@/domain/types";

vi.mock("@/lib/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import { AnswerExplanation } from "./AnswerExplanation";

function makeQuestion(overrides: Partial<LiveQuestion> = {}): LiveQuestion {
  return {
    id: 1,
    order: 0,
    questionType: "single",
    questionText: "Q?",
    options: { A: "a", B: "b", C: "c", D: "d" },
    answer: { selected: [], flagged: false, committed: true, gaveUp: false, timeSpentMs: 0 },
    correctAnswer: "A",
    explanations: {
      // Descriptions use a fixed "expl-" prefix so they remain unique
      // even when adjacent to the chip letter "A"/"B"/etc. in the DOM.
      A: { description: "expl-A", reason: "reason-A" },
      B: { description: "expl-B", reason: "reason-B" },
      C: { description: "expl-C", reason: "reason-C" },
      D: { description: "expl-D", reason: "reason-D" },
    },
    ...overrides,
  };
}

function renderExplanation(question: LiveQuestion) {
  return render(
    <ToastProvider>
      <GlobalDialogsProvider>
        <AnswerExplanation question={question} />
      </GlobalDialogsProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<AnswerExplanation>", () => {
  it("returns null when correctAnswer is undefined", () => {
    const question = makeQuestion({ correctAnswer: undefined });
    const { container } = renderExplanation(question);
    // No revealed-detail section should be present at all.
    expect(container.querySelector('[data-testid="revealed-detail"]')).toBeNull();
  });

  it("renders the 'Correct answer:' header with joined keys", () => {
    const question = makeQuestion({ correctAnswer: ["A", "B"] });
    renderExplanation(question);
    // The header should join the letters with ", ".
    expect(screen.getByText(/correct answer: a, b/i)).toBeInTheDocument();
  });

  // BUG GUARD: ADR-15 — the "Correct answer" header in the post-commit
  // detail must show the display letter (A, B, C, D) the user saw on the
  // option chips, NOT the underlying key. If the shuffle mapped
  // underlying "B" to display "A", the header must read "Correct answer:
  // A", not "Correct answer: B" — so it matches the chip the user
  // actually clicked.
  it("BUG GUARD: 'Correct answer' header reverse-maps underlying keys to display letters via optionOrder", () => {
    // optionOrder = [B, C, A, D]:
    //   chip A → underlying "B"
    //   chip B → underlying "C"
    //   chip C → underlying "A"
    //   chip D → underlying "D"
    // The correct underlying key is "A" (which is at chip C in the
    // display), so the header should read "Correct answer: C".
    const question = makeQuestion({
      optionOrder: ["B", "C", "A", "D"],
      correctAnswer: "A",
    });
    renderExplanation(question);
    expect(screen.getByText(/correct answer: c/i)).toBeInTheDocument();
    // And the underlying key must NOT leak through.
    expect(screen.queryByText(/correct answer: a/i)).toBeNull();
  });

  it("'Correct answer' header sorts multi-answer display letters alphabetically", () => {
    // With optionOrder=[B, A, C, D], underlying "A" is at display B and
    // underlying "B" is at display A. The header should read "A, B" in
    // natural display-letter order, not "B, A" in optionOrder index
    // order.
    const question = makeQuestion({
      optionOrder: ["B", "A", "C", "D"],
      correctAnswer: ["A", "B"],
    });
    renderExplanation(question);
    expect(screen.getByText(/correct answer: a, b/i)).toBeInTheDocument();
  });

  it("BUG GUARD: renders explanations in fixed A, B, C, D order, remapping descriptions via optionOrder", () => {
    // ADR-15: the chip letter on each explanation is always A, B, C, D — the
    // description text, however, comes from the underlying key mapped via
    // `optionOrder`. With optionOrder=[C, A, B, D], chip A shows the
    // description for the underlying C, chip B for A, chip C for B, chip D
    // for D. If the mapping is wrong the user sees e.g. a "C" chip next
    // to a description that actually belongs to option A.
    //
    // Each explanation is a <div> with one <p> (the chip + description)
    // and a second <p> (the reason). The "description" element gets
    // unique per-letter values like "__DESC_A__" so that, after we read
    // the <p>'s textContent (which is "A" + "__DESC_C__" etc.), we can
    // unambiguously extract both the chip letter and the description token.
    const question = makeQuestion({
      options: { A: "a", B: "b", C: "c", D: "d" },
      optionOrder: ["C", "A", "B", "D"],
      correctAnswer: "A",
      explanations: {
        A: { description: "__DESC_A__", reason: "reason-A" },
        B: { description: "__DESC_B__", reason: "reason-B" },
        C: { description: "__DESC_C__", reason: "reason-C" },
        D: { description: "__DESC_D__", reason: "reason-D" },
      },
    });

    renderExplanation(question);

    // Explanations are collapsed behind the toggle by default — open the
    // panel first so the BUG GUARD below can inspect the rendered rows.
    fireEvent.click(screen.getByRole("button", { name: /show explanation/i }));

    const list = screen.getByTestId("explanations");
    // Each explanation is rendered as one direct child <div> of the
    // explanations list. The chip-letter <p> contains the chip + the
    // description text (e.g. "A" + "__DESC_C__" → "A__DESC_C__").
    const rows = list.querySelectorAll(":scope > div");
    const rowsParsed = Array.from(rows).map((row) => {
      const p = row.querySelector("p");
      const text = p?.textContent ?? "";
      const chipMatch = /^([A-D])/.exec(text);
      const descMatch = /__DESC_[A-D]__/.exec(text);
      return {
        chip: chipMatch ? chipMatch[1] : null,
        description: descMatch ? descMatch[0] : text,
      };
    });

    // Chips are in fixed A, B, C, D order (NOT the shuffled order), and
    // the description for chip X is the one whose underlying key sits at
    // optionOrder[chipIndex]. Concretely:
    //   chip A → optionOrder[0]="C" → "__DESC_C__"
    //   chip B → optionOrder[1]="A" → "__DESC_A__"
    //   chip C → optionOrder[2]="B" → "__DESC_B__"
    //   chip D → optionOrder[3]="D" → "__DESC_D__"
    expect(rowsParsed).toEqual([
      { chip: "A", description: "__DESC_C__" },
      { chip: "B", description: "__DESC_A__" },
      { chip: "C", description: "__DESC_B__" },
      { chip: "D", description: "__DESC_D__" },
    ]);
  });

  it("falls back to natural Object.keys(options) order when optionOrder is absent", () => {
    // No optionOrder → use Object.keys(options) order (A, B, C, D).
    const question = makeQuestion({
      // optionOrder intentionally omitted
      correctAnswer: "A",
      explanations: {
        A: { description: "__DESC_A__", reason: "reason-A" },
        B: { description: "__DESC_B__", reason: "reason-B" },
        C: { description: "__DESC_C__", reason: "reason-C" },
        D: { description: "__DESC_D__", reason: "reason-D" },
      },
    });

    renderExplanation(question);

    // Open the explanations panel first (collapsed by default).
    fireEvent.click(screen.getByRole("button", { name: /show explanation/i }));

    const list = screen.getByTestId("explanations");
    const rows = list.querySelectorAll(":scope > div");
    const descriptions = Array.from(rows).map((row) => {
      const p = row.querySelector("p");
      const text = p?.textContent ?? "";
      const match = /__DESC_[A-D]__/.exec(text);
      return match ? match[0] : text;
    });

    expect(descriptions).toEqual([
      "__DESC_A__",
      "__DESC_B__",
      "__DESC_C__",
      "__DESC_D__",
    ]);
  });

  it("renders question.tips when present", () => {
    // The field on LiveQuestion is `Tips` (capital T) per the schema.
    const question = makeQuestion({ Tips: "Remember to read carefully." });
    renderExplanation(question);
    // Open the explanations panel first (Tips is collapsed with the rest).
    fireEvent.click(screen.getByRole("button", { name: /show explanation/i }));
    // The Tips block should be present. Use the revealed-detail wrapper and
    // look for the literal Tips label (testid is preserved across the rename).
    const wrapper = screen.getByTestId("revealed-detail");
    expect(within(wrapper).getByText(/^tips$/i)).toBeInTheDocument();
    expect(
      within(wrapper).getByText("Remember to read carefully."),
    ).toBeInTheDocument();
  });

  it("handles legacy correctAnswer: string (single letter) shape", () => {
    // Older payloads may send a single string instead of an array.
    // The component should still render a single-letter header.
    const question = makeQuestion({ correctAnswer: "C" });
    renderExplanation(question);

    // Header shows just "C" — joined list of one is still "C".
    expect(screen.getByText(/correct answer: c/i)).toBeInTheDocument();

    // Open the explanations panel first so we can verify the correct-key
    // highlighting on the chips.
    fireEvent.click(screen.getByRole("button", { name: /show explanation/i }));

    // And the correct-key highlighting should still apply: the chip on
    // option C's explanation should carry the "bg-correct" class while
    // the others use the muted surface style.
    const list = screen.getByTestId("explanations");
    const correctChip = within(list).getByText("C");
    expect(correctChip.className).toMatch(/bg-correct/);

    // Sanity: the wrong-option chips should NOT have the correct styling.
    const wrongChip = within(list).getByText("A");
    expect(wrongChip.className).not.toMatch(/bg-correct/);
  });

  // ── Show / Hide explanation toggle ─────────────────────────────────────────
  it("renders the 'Show explanation' button but does NOT render the explanation list until clicked", () => {
    const question = makeQuestion();
    renderExplanation(question);

    // The "Correct answer" header is always visible (it's the answer, not
    // the explanation). The explanation rows + Tips are collapsed.
    expect(screen.getByText(/correct answer: a/i)).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /show explanation/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe("explanation-1");
    expect(screen.queryByTestId("explanations")).toBeNull();
  });

  it("opens the explanation list when 'Show explanation' is clicked and closes it on a second click", () => {
    const question = makeQuestion({ Tips: "Read carefully." });
    renderExplanation(question);

    const toggle = screen.getByRole("button", { name: /show explanation/i });
    fireEvent.click(toggle);

    // Panel is open: the explanations list is in the DOM, the button
    // flipped to "Hide explanation", and aria-expanded is "true".
    expect(screen.getByRole("button", { name: /hide explanation/i })).toBeInTheDocument();
    expect(screen.getByTestId("explanations")).toBeInTheDocument();
    expect(screen.getByText("Read carefully.")).toBeInTheDocument();

    // Click again to close.
    fireEvent.click(screen.getByRole("button", { name: /hide explanation/i }));
    expect(screen.getByRole("button", { name: /show explanation/i })).toBeInTheDocument();
    expect(screen.queryByTestId("explanations")).toBeNull();
  });

  it("does not render the 'Show explanation' button when there are no explanations and no Tips", () => {
    const question = makeQuestion({
      explanations: undefined,
      Tips: undefined,
    });
    renderExplanation(question);

    // Header is still visible — it's the answer.
    expect(screen.getByText(/correct answer: a/i)).toBeInTheDocument();
    // But there's nothing to expand, so no toggle.
    expect(screen.queryByRole("button", { name: /show explanation/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /hide explanation/i })).toBeNull();
  });
});
