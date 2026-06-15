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
});
