/**
 * <QuestionNavigator> tests. The component renders one button per question,
 * highlights the current question via `aria-current="true"`, and jumps
 * questions via the store's `goTo` action.
 *
 * Verifies:
 *   - One button per question is rendered.
 *   - The current question has `aria-current="true"`.
 *   - Clicking a button calls `goTo` with the new index.
 */

import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";
import { createExamStore, type ExamStore } from "@/store/examStore";
import type { LiveSession, LiveQuestion } from "@/domain/types";

vi.mock("@/lib/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import { QuestionNavigator } from "./QuestionNavigator";

function makeQuestion(id: number): LiveQuestion {
  return {
    id,
    order: id - 1,
    questionType: "single",
    questionText: `Q${id}?`,
    options: { A: "a", B: "b" },
    answer: { selected: [], flagged: false, revealed: false, timeSpentMs: 0 },
  };
}

function makeSession(numQuestions: number, currentIndex = 0): LiveSession {
  return {
    id: "s1",
    status: "in_progress",
    quesPath: "p",
    domainLabel: "d",
    setTitle: "s",
    difficulty: "Easy",
    mode: "full",
    totalQuestions: numQuestions,
    currentIndex,
    timer: { enabled: false, elapsedMs: 0 },
    questions: Array.from({ length: numQuestions }, (_, i) =>
      makeQuestion(i + 1),
    ),
    createdAt: "x",
    startedAt: "x",
    updatedAt: "x",
  };
}

function renderNavigator(store: ExamStore) {
  return render(
    <ToastProvider>
      <GlobalDialogsProvider>
        <QuestionNavigator store={store} />
      </GlobalDialogsProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<QuestionNavigator>", () => {
  it("renders one button per question", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(5));

    renderNavigator(store);

    const nav = screen.getByTestId("question-navigator");
    // Each <li> contains one <button> (the numbered jump-to-question button).
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(5);
  });

  it("marks the current question with aria-current='true'", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(5, 2));

    renderNavigator(store);

    const nav = screen.getByTestId("question-navigator");
    // The "Question 3" button (1-based, currentIndex=2 → i=2 → "Question 3")
    // is the current one and should carry aria-current="true".
    const currentBtn = within(nav).getByRole("button", { name: /question 3/i });
    expect(currentBtn).toHaveAttribute("aria-current", "true");

    // The other questions are NOT the current one.
    const firstBtn = within(nav).getByRole("button", { name: /question 1/i });
    expect(firstBtn).not.toHaveAttribute("aria-current", "true");
  });

  it("calls goTo with the clicked index when a button is clicked", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(5, 0));

    renderNavigator(store);

    const nav = screen.getByTestId("question-navigator");
    const fourthBtn = within(nav).getByRole("button", { name: /question 4/i });
    fireEvent.click(fourthBtn);

    // goTo(3) should advance currentIndex to 3.
    expect(store.getState().currentIndex).toBe(3);
  });

  it("marks an answered (non-current) question with data-status='answered' and ✓ glyph", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(5, 0));
    // Q1 is current. Mark Q2 (id=2) as answered with selected=["A"].
    store.setState((s) => ({
      answers: {
        ...s.answers,
        2: { selected: ["A"], flagged: false, revealed: false, timeSpentMs: 0 },
      },
    }));

    renderNavigator(store);

    const nav = screen.getByTestId("question-navigator");
    const q2 = within(nav).getByRole("button", { name: /question 2/i });
    expect(q2).toHaveAttribute("data-status", "answered");
    // data-flagged is only set when flagged.
    expect(q2).not.toHaveAttribute("data-flagged");
    // The ✓ glyph should be present as an aria-hidden span inside the button.
    expect(q2.textContent).toContain("✓");
    // And NOT the other state glyphs.
    expect(q2.textContent).not.toContain("⚑");
    expect(q2.textContent).not.toContain("👁");
  });

  it("marks a flagged (non-current) question with data-status='flagged' and ⚑ glyph", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(5, 0));
    // Mark Q3 (id=3) as flagged only.
    store.setState((s) => ({
      answers: {
        ...s.answers,
        3: { selected: [], flagged: true, revealed: false, timeSpentMs: 0 },
      },
    }));

    renderNavigator(store);

    const nav = screen.getByTestId("question-navigator");
    const q3 = within(nav).getByRole("button", { name: /question 3/i });
    expect(q3).toHaveAttribute("data-status", "flagged");
    expect(q3).toHaveAttribute("data-flagged", "true");
    expect(q3.textContent).toContain("⚑");
    // No ✓ or 👁 glyph for plain-flagged.
    expect(q3.textContent).not.toContain("✓");
    expect(q3.textContent).not.toContain("👁");
  });

  it("marks a revealed (non-current) question with data-status='revealed' and 👁 glyph", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(5, 0));
    // Mark Q4 (id=4) as revealed.
    store.setState((s) => ({
      answers: {
        ...s.answers,
        4: { selected: [], flagged: false, revealed: true, timeSpentMs: 0 },
      },
    }));

    renderNavigator(store);

    const nav = screen.getByTestId("question-navigator");
    const q4 = within(nav).getByRole("button", { name: /question 4/i });
    expect(q4).toHaveAttribute("data-status", "revealed");
    // Not flagged.
    expect(q4).not.toHaveAttribute("data-flagged");
    // The 👁 glyph is present.
    expect(q4.textContent).toContain("👁");
    expect(q4.textContent).not.toContain("✓");
    expect(q4.textContent).not.toContain("⚑");
  });

  it("marks an untouched question with data-status='unanswered' and no extra glyph", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(5, 0));
    // Q5 (id=5) is left at its default state from the DTO.

    renderNavigator(store);

    const nav = screen.getByTestId("question-navigator");
    const q5 = within(nav).getByRole("button", { name: /question 5/i });
    expect(q5).toHaveAttribute("data-status", "unanswered");
    expect(q5).not.toHaveAttribute("data-flagged");
    // No extra glyph beyond the number.
    expect(q5.textContent?.trim()).toBe("5");
    expect(q5.textContent).not.toContain("✓");
    expect(q5.textContent).not.toContain("⚑");
    expect(q5.textContent).not.toContain("👁");
  });

  it("prioritises 'flagged' over 'answered' when both are set, but exposes both in the aria-label", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(5, 0));
    // Q2 (id=2): answered AND flagged.
    store.setState((s) => ({
      answers: {
        ...s.answers,
        2: { selected: ["A"], flagged: true, revealed: false, timeSpentMs: 0 },
      },
    }));

    renderNavigator(store);

    const nav = screen.getByTestId("question-navigator");
    const q2 = within(nav).getByRole("button", { name: /question 2/i });
    // Swatch status follows the priority order: flagged wins over answered.
    expect(q2).toHaveAttribute("data-status", "flagged");
    // data-flagged is set because it's flagged.
    expect(q2).toHaveAttribute("data-flagged", "true");
    // Glyph: the component uses ⚑ whenever flagged (per code: `flagged ? "⚑" : STATUS_GLYPH[status]`).
    expect(q2.textContent).toContain("⚑");
    // aria-label should mention both "flagged" and "answered".
    const label = q2.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/flagged/i);
    expect(label).toMatch(/answered/i);
  });

  it("prioritises 'revealed' over 'flagged' when both are set, and exposes both in the aria-label", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(5, 0));
    // Q4 (id=4): revealed AND flagged.
    store.setState((s) => ({
      answers: {
        ...s.answers,
        4: { selected: [], flagged: true, revealed: true, timeSpentMs: 0 },
      },
    }));

    renderNavigator(store);

    const nav = screen.getByTestId("question-navigator");
    const q4 = within(nav).getByRole("button", { name: /question 4/i });
    // Swatch status: revealed wins.
    expect(q4).toHaveAttribute("data-status", "revealed");
    // data-flagged is still set because the question IS flagged.
    expect(q4).toHaveAttribute("data-flagged", "true");
    // aria-label should mention both "revealed" and "flagged".
    const label = q4.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/revealed/i);
    expect(label).toMatch(/flagged/i);
  });

  it("renders the legend with all five swatch types (current, answered, flagged, revealed, unanswered)", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(5, 0));

    renderNavigator(store);

    // The legend is the second <ul> inside the <nav aria-label="Question navigator">.
    // The first <ul> is the navigator itself (data-testid="question-navigator").
    const nav = screen.getByRole("navigation", { name: /question navigator/i });
    const lists = within(nav).getAllByRole("list");
    expect(lists.length).toBeGreaterThanOrEqual(2);

    // The legend is the last list within the nav.
    const legend = lists[lists.length - 1];
    const legendText = legend.textContent ?? "";
    expect(legendText).toMatch(/current/);
    expect(legendText).toMatch(/answered/);
    expect(legendText).toMatch(/flagged/);
    expect(legendText).toMatch(/revealed/);
    expect(legendText).toMatch(/unanswered/);
  });
});
