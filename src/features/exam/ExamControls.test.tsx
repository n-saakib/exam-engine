/**
 * <SubmitOrGiveUpButton> label-flip tests. Verifies the button's label and
 * dialog copy branch on `selected.length` for the current question.
 *
 * Critically, the button never opens the exam-submit dialog and never
 * finalises the exam — finalisation is the responsibility of the dedicated
 * Submit exam button (`SubmitOrNextButton`). A single click on "Submit
 * answer" commits the question's answer immediately, on every question
 * (including the last one).
 *
 * The store action `commit` is mocked at the apiClient layer so we don't have
 * to wait on a real PATCH.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";
import { createExamStore } from "@/store/examStore";
import type { LiveSession, LiveQuestion } from "@/domain/types";

const patch = vi.fn();
const post = vi.fn();

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: (...args: unknown[]) => post(...args),
    patch: (...args: unknown[]) => patch(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

import { SubmitOrGiveUpButton } from "./ExamControls";

function makeQuestion(id: number): LiveQuestion {
  return {
    id,
    order: id - 1,
    questionType: "single",
    questionText: `Q${id}?`,
    options: { A: "a", B: "b", C: "c", D: "d" },
    answer: { selected: [], flagged: false, committed: false, gaveUp: false, timeSpentMs: 0 },
  };
}

function makeDTO(numQuestions: number, currentIndex = 0): LiveSession {
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

beforeEach(() => {
  vi.clearAllMocks();
  // `commit` triggers a forced PATCH; resolve immediately so await resolves.
  patch.mockResolvedValue({});
});

describe("<SubmitOrGiveUpButton>", () => {
  it('labels as "Give up" when no options are selected', () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeDTO(3));
    render(
      <ToastProvider>
        <GlobalDialogsProvider>
          <SubmitOrGiveUpButton store={store} />
        </GlobalDialogsProvider>
      </ToastProvider>,
    );
    expect(
      screen.getByRole("button", { name: /^Give up$/i }),
    ).toBeInTheDocument();
  });

  it('labels as "Submit answer" when ≥1 option is selected (not on last question)', () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeDTO(3, 0));
    store.getState().select(1, "A");
    render(
      <ToastProvider>
        <GlobalDialogsProvider>
          <SubmitOrGiveUpButton store={store} />
        </GlobalDialogsProvider>
      </ToastProvider>,
    );
    expect(
      screen.getByRole("button", { name: /^Submit answer$/i }),
    ).toBeInTheDocument();
  });

  it('still labels as "Submit answer" on the last question with a selection', () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeDTO(2, 1)); // last question
    store.getState().select(2, "B");
    render(
      <ToastProvider>
        <GlobalDialogsProvider>
          <SubmitOrGiveUpButton store={store} />
        </GlobalDialogsProvider>
      </ToastProvider>,
    );
    expect(
      screen.getByRole("button", { name: /^Submit answer$/i }),
    ).toBeInTheDocument();
  });

  it("commits immediately on the last question with a selection, without opening any dialog", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeDTO(2, 1)); // last question
    store.getState().select(2, "B");
    render(
      <ToastProvider>
        <GlobalDialogsProvider>
          <SubmitOrGiveUpButton store={store} />
        </GlobalDialogsProvider>
      </ToastProvider>,
    );

    // One click commits. No confirmation dialog — finalising the exam is the
    // Submit exam button's job, not this one.
    fireEvent.click(screen.getByRole("button", { name: /^Submit answer$/i }));

    await waitFor(() => {
      expect(patch).toHaveBeenCalled();
    });
    // No dialog should have appeared.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("commits immediately when not on the last question, without opening any dialog", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeDTO(3, 0));
    store.getState().select(1, "A");
    render(
      <ToastProvider>
        <GlobalDialogsProvider>
          <SubmitOrGiveUpButton store={store} />
        </GlobalDialogsProvider>
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Submit answer$/i }));
    await waitFor(() => {
      expect(patch).toHaveBeenCalled();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it('shows the "Give up on this question?" dialog when nothing is selected', async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeDTO(3));
    render(
      <ToastProvider>
        <GlobalDialogsProvider>
          <SubmitOrGiveUpButton store={store} />
        </GlobalDialogsProvider>
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Give up$/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/Give up on this question\?/i);
  });
});
