/**
 * <SubmitExamDialog> tests. The dialog is the confirm-finish step before
 * POSTing the submit. The store's `submit()` is mocked at the apiClient
 * layer so the dialog can complete without a real network.
 *
 * Verifies:
 *   - Clicking "Submit exam" calls onSubmitted; clicking "Keep going" does not.
 *   - Pressing Escape closes the dialog (Radix ESC handling → onOpenChange(false)).
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";
import { createExamStore, type ExamStore } from "@/store/examStore";
import type { LiveSession, LiveQuestion } from "@/domain/types";

const post = vi.fn();

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: (...args: unknown[]) => post(...args),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

import { SubmitExamDialog } from "./SubmitExamDialog";

function makeQuestion(id: number): LiveQuestion {
  return {
    id,
    order: id - 1,
    questionType: "single",
    questionText: `Q${id}?`,
    options: { A: "a", B: "b" },
    answer: { selected: [], flagged: false, committed: false, gaveUp: false, timeSpentMs: 0 },
  };
}

function makeSession(numQuestions = 3): LiveSession {
  return {
    id: "s1",
    status: "in_progress",
    quesPath: "p",
    domainLabel: "d",
    setTitle: "s",
    difficulty: "Easy",
    mode: "full",
    totalQuestions: numQuestions,
    currentIndex: 0,
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
  // The store's submit() POSTs to /sessions/:id/submit. Provide a fake new
  // session id so the onSuccess path can call onSubmitted("s1").
  post.mockResolvedValue({ id: "s1" });
});

function renderDialog(
  store: ExamStore,
  onSubmitted = vi.fn(),
  onOpenChange = vi.fn(),
) {
  return render(
    <ToastProvider>
      <GlobalDialogsProvider>
        <SubmitExamDialog
          store={store}
          open={true}
          onOpenChange={onOpenChange}
          onSubmitted={onSubmitted}
        />
      </GlobalDialogsProvider>
    </ToastProvider>,
  );
}

describe("<SubmitExamDialog> — confirmation gating", () => {
  it("does NOT call onSubmitted when the user clicks 'Keep going' (cancel)", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(3));
    const onSubmitted = vi.fn();
    const onOpenChange = vi.fn();

    renderDialog(store, onSubmitted, onOpenChange);

    const cancelBtn = screen.getByRole("button", { name: /keep going/i });
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(onSubmitted).not.toHaveBeenCalled();
    // The dialog should request to close.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onSubmitted with the session id when the user clicks 'Submit exam'", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(3));
    const onSubmitted = vi.fn();
    const onOpenChange = vi.fn();

    renderDialog(store, onSubmitted, onOpenChange);

    const submitBtn = screen.getByRole("button", { name: /submit exam/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledWith("s1");
    });
  });
});

describe("<SubmitExamDialog> — Escape key", () => {
  it("closes the dialog when Escape is pressed", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(makeSession(3));
    const onOpenChange = vi.fn();

    renderDialog(store, vi.fn(), onOpenChange);

    // The dialog content is mounted; press Escape on the dialog title to
    // trigger Radix's onEscapeKeyDown → onOpenChange(false).
    const title = screen.getByText(/finish exam\?/i);
    const dialog = title.closest("[role='dialog']") ?? title;
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
