/**
 * <SubmitOrGiveUpButton> label-flip tests. Verifies the button's label and
 * dialog copy branch on `selected.length` for the current question, and that
 * `onLastSubmit` fires only when ≥1 option is selected AND the question is the
 * last one.
 *
 * The store action `reveal` is mocked at the apiClient layer so we don't have
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
    answer: { selected: [], flagged: false, revealed: false, timeSpentMs: 0 },
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
  // `reveal` triggers a forced PATCH; resolve immediately so await resolves.
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

  it('labels as "Submit" when ≥1 option is selected (not on last question)', () => {
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
      screen.getByRole("button", { name: /^Submit$/i }),
    ).toBeInTheDocument();
  });

  it('still labels as "Submit" on the last question with a selection', () => {
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
      screen.getByRole("button", { name: /^Submit$/i }),
    ).toBeInTheDocument();
  });

  it("calls reveal on confirm and fires onLastSubmit on the last question", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeDTO(2, 1)); // last question
    store.getState().select(2, "B");
    const onLastSubmit = vi.fn();
    render(
      <ToastProvider>
        <GlobalDialogsProvider>
          <SubmitOrGiveUpButton store={store} onLastSubmit={onLastSubmit} />
        </GlobalDialogsProvider>
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Submit$/i }));
    const dialog = await screen.findByRole("dialog");
    // New copy: "Submit and reveal the answer?"
    expect(dialog).toHaveTextContent(/Submit and reveal the answer\?/i);
    // Confirm
    fireEvent.click(screen.getByRole("button", { name: /^Submit$/i }));

    await waitFor(() => {
      expect(patch).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onLastSubmit).toHaveBeenCalledTimes(1);
    });
  });

  it("does NOT fire onLastSubmit when not on the last question", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeDTO(3, 0));
    store.getState().select(1, "A");
    const onLastSubmit = vi.fn();
    render(
      <ToastProvider>
        <GlobalDialogsProvider>
          <SubmitOrGiveUpButton store={store} onLastSubmit={onLastSubmit} />
        </GlobalDialogsProvider>
      </ToastProvider>,
    );
    // Not on the last question → no dialog; one click commits the answer.
    fireEvent.click(screen.getByRole("button", { name: /^Submit$/i }));
    await waitFor(() => {
      expect(patch).toHaveBeenCalled();
    });
    // Give the .then() a microtask to run.
    await waitFor(() => {
      expect(onLastSubmit).not.toHaveBeenCalled();
    });
  });

  it('shows the original "Reveal the answer?" dialog when nothing is selected', async () => {
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
    expect(dialog).toHaveTextContent(/Reveal the answer\?/i);
  });
});
