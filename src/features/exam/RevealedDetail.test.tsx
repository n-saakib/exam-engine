/**
 * <RevealedDetail> tests. The component is the post-reveal panel shown after
 * the user has seen the correct answer. It renders the joined correct
 * answer(s), each option's explanation (keyed by A/B/C/...) and an optional
 * Tips block. Progressive reveal hides the explanations behind a toggle
 * button; otherwise they are shown inline.
 *
 * BUG GUARD: The most important test in this file verifies that the
 * explanations list is rendered in the SAME order as the SHUFFLED
 * `optionOrder` (when the server-side exam engine has shuffled the options).
 * If this breaks, the user sees a "C" chip next to a description that
 * actually belongs to option A — confusing and hard to spot in review.
 *
 * Verifies:
 *   - Returns null when no `correctAnswer` is set.
 *   - Joins the correct answer keys with ", ".
 *   - (BUG GUARD) Iterates explanations via `optionOrder` when set.
 *   - Falls back to `Object.keys(options)` when `optionOrder` is absent.
 *   - Progressive reveal toggle: hidden by default, click to expand.
 *   - Inline mode: explanations visible without a click.
 *   - Renders `question.Tips` when present.
 *   - Legacy `correctAnswer: string` (single letter) shape is supported.
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

import { RevealedDetail } from "./RevealedDetail";

function makeQuestion(overrides: Partial<LiveQuestion> = {}): LiveQuestion {
  return {
    id: 1,
    order: 0,
    questionType: "single",
    questionText: "Q?",
    options: { A: "a", B: "b", C: "c", D: "d" },
    answer: { selected: [], flagged: false, revealed: true, timeSpentMs: 0 },
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

function renderRevealed(question: LiveQuestion, progressive = false) {
  return render(
    <ToastProvider>
      <GlobalDialogsProvider>
        <RevealedDetail question={question} progressive={progressive} />
      </GlobalDialogsProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<RevealedDetail>", () => {
  it("returns null when correctAnswer is undefined", () => {
    const question = makeQuestion({ correctAnswer: undefined });
    const { container } = renderRevealed(question);
    // No revealed-detail section should be present at all.
    expect(container.querySelector('[data-testid="revealed-detail"]')).toBeNull();
  });

  it("renders the 'Correct answer:' header with joined keys", () => {
    const question = makeQuestion({ correctAnswer: ["A", "B"] });
    renderRevealed(question);
    // The header should join the letters with ", ".
    expect(screen.getByText(/correct answer: a, b/i)).toBeInTheDocument();
  });

  it("BUG GUARD: aligns explanations with the shuffled optionOrder", () => {
    // The server-side engine has shuffled the options so they are
    // presented in the order [C, A, B, D]. The explanations below MUST
    // match that order — otherwise a user sees, e.g., a "C" chip next
    // to the description that actually belongs to option A.
    //
    // Each explanation is a <div> with one <p> (the chip + description)
    // and a second <p> (the reason). The "description" element gets
    // unique per-letter values like "__DESC_A__" so that, after we read
    // the <p>'s textContent (which is "C__DESC_C__" etc.), we can
    // unambiguously extract the description token.
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

    renderRevealed(question);

    const list = screen.getByTestId("explanations");
    // Each explanation is rendered as one direct child <div> of the
    // explanations list. The chip-letter <p> contains the description
    // text (e.g. "C" + "__DESC_C__" → "C__DESC_C__").
    const rows = list.querySelectorAll(":scope > div");
    const descriptions = Array.from(rows).map((row) => {
      const p = row.querySelector("p");
      const text = p?.textContent ?? "";
      // Pull the "__DESC_X__" token out of the chip+description text.
      const match = /__DESC_[A-D]__/.exec(text);
      return match ? match[0] : text;
    });

    // Order should follow optionOrder: C, A, B, D — NOT the natural
    // Object.keys(options) order A, B, C, D.
    expect(descriptions).toEqual([
      "__DESC_C__",
      "__DESC_A__",
      "__DESC_B__",
      "__DESC_D__",
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

    renderRevealed(question);

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

  it("progressive=true: hides explanations by default, reveals them on click", () => {
    const question = makeQuestion();
    renderRevealed(question, /* progressive */ true);

    // Initially hidden — no explanations list in the DOM.
    expect(screen.queryByTestId("explanations")).toBeNull();

    // Toggle button is visible with the closed-state label.
    const toggle = screen.getByRole("button", { name: /show explanations/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Click → explanations appear, button label flips.
    fireEvent.click(toggle);

    const list = screen.getByTestId("explanations");
    expect(list).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /hide explanations/i }),
    ).toHaveAttribute("aria-expanded", "true");

    // And the explanations are now visible. The default fixture uses
    // "expl-A" / "expl-B" / etc. as descriptions; assert on the
    // explanation chip letters (which are unique per row).
    expect(within(list).getByText("expl-A")).toBeInTheDocument();
  });

  it("progressive=false: shows explanations inline without a toggle", () => {
    const question = makeQuestion();
    renderRevealed(question, /* progressive */ false);

    // Explanations are immediately visible.
    const list = screen.getByTestId("explanations");
    expect(list).toBeInTheDocument();
    expect(within(list).getByText("expl-A")).toBeInTheDocument();

    // No toggle button is rendered in non-progressive mode.
    expect(
      screen.queryByRole("button", { name: /show explanations/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /hide explanations/i }),
    ).toBeNull();
  });

  it("renders question.tips when present", () => {
    // The field on LiveQuestion is `Tips` (capital T) per the schema.
    const question = makeQuestion({ Tips: "Remember to read carefully." });
    renderRevealed(question);
    // Non-progressive mode shows inline; the Tips block should be present.
    // Use the revealed-detail wrapper and look for the literal Tips label.
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
    renderRevealed(question);

    // Header shows just "C" — joined list of one is still "C".
    expect(screen.getByText(/correct answer: c/i)).toBeInTheDocument();

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
});
