/**
 * Component tests for the F4 exam UI. Drives a real factory ExamStore (apiClient
 * mocked) and asserts navigator colour/aria states, flag-count updates, give-up
 * reveal, progressive-reveal expander, timer pause, and the submit dialog
 * counts + submit→navigate.
 */

import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { LiveSession } from "@/domain/types";
import { apiClient } from "@/lib/apiClient";
import { createExamStore, type ExamStore } from "@/store/examStore";

import { QuestionNavigator } from "./QuestionNavigator";
import { ProgressBar } from "./ProgressBar";
import { QuestionPanel } from "./QuestionPanel";
import { ExamTimer } from "./ExamTimer";
import { SubmitExamDialog } from "./SubmitExamDialog";
import { RevealedDetail } from "./RevealedDetail";

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

// GlobalDialogs + Toast are needed by some children.
import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const patch = vi.mocked(apiClient.patch);
const post = vi.mocked(apiClient.post);

function fixture(): LiveSession {
  return {
    id: "sess-1",
    status: "in_progress",
    quesPath: "p",
    domainLabel: "Cloud / AWS",
    setTitle: "Set",
    difficulty: "Easy",
    mode: "full",
    totalQuestions: 3,
    currentIndex: 0,
    timer: { enabled: true, limitMs: 60_000, elapsedMs: 0, expired: false },
    questions: [1, 2, 3].map((id) => ({
      id,
      order: id - 1,
      questionType: "single" as const,
      questionText: `Question ${id}?`,
      options: { A: "Apple", B: "Banana", C: "Cherry", D: "Date" },
      answer: {
        selected: [],
        flagged: false,
        revealed: false,
        timeSpentMs: 0,
      },
    })),
    createdAt: "x",
    startedAt: "x",
    updatedAt: "x",
  };
}

function makeStore(): ExamStore {
  const store = createExamStore();
  store.getState().loadFromDTO(fixture());
  return store;
}

function wrap(ui: React.ReactNode) {
  return render(
    <ToastProvider>
      <GlobalDialogsProvider>{ui}</GlobalDialogsProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  patch.mockResolvedValue(fixture());
  post.mockResolvedValue({} as never);
});

describe("<QuestionNavigator>", () => {
  it("colour-codes + aria-labels answered / flagged / current / unanswered", () => {
    const store = makeStore();
    store.getState().select(2, "A"); // answer Q2
    store.getState().toggleFlag(3); // flag Q3

    wrap(<QuestionNavigator store={store} />);

    // Q1 is current.
    const q1 = screen.getByRole("button", { name: /Question 1, current/i });
    expect(q1).toHaveAttribute("data-status", "current");
    expect(q1).toHaveAttribute("aria-current", "true");

    // Q2 answered.
    const q2 = screen.getByRole("button", { name: /Question 2, answered/i });
    expect(q2).toHaveAttribute("data-status", "answered");

    // Q3 flagged — colour is not the only signal (label + glyph).
    const q3 = screen.getByRole("button", { name: /Question 3, flagged/i });
    expect(q3).toHaveAttribute("data-flagged", "true");
  });

  it("jumps to a question on click", () => {
    const store = makeStore();
    wrap(<QuestionNavigator store={store} />);
    fireEvent.click(screen.getByRole("button", { name: /Question 3/i }));
    expect(store.getState().currentIndex).toBe(2);
  });
});

describe("<ProgressBar>", () => {
  it("updates % answered and flagged count as the store changes", () => {
    const store = makeStore();
    const { rerender } = wrap(<ProgressBar store={store} />);
    expect(screen.getByText(/0% answered/)).toBeInTheDocument();

    act(() => {
      store.getState().select(1, "A");
      store.getState().toggleFlag(2);
    });
    rerender(
      <ToastProvider>
        <GlobalDialogsProvider>
          <ProgressBar store={store} />
        </GlobalDialogsProvider>
      </ToastProvider>,
    );

    expect(screen.getByText(/33% answered/)).toBeInTheDocument();
    expect(screen.getByText(/1 flagged/)).toBeInTheDocument();
  });
});

describe("<QuestionPanel> options", () => {
  it("renders a checkbox group (ADR-13: every question is checkboxes) and records an appended selection", () => {
    const store = makeStore();
    wrap(<QuestionPanel store={store} progressiveReveal={false} />);

    const optionGroup = screen.getByTestId("option-list");
    const checkboxes = within(optionGroup).getAllByRole("checkbox");
    expect(checkboxes.length).toBe(4);
    fireEvent.click(checkboxes[0]); // A
    expect(store.getState().answers[1].selected).toEqual(["A"]);
    expect(checkboxes[0]).toHaveAttribute("aria-checked", "true");
    // A second click appends (not replaces) — multi-select semantics.
    fireEvent.click(checkboxes[1]); // B
    expect(store.getState().answers[1].selected).toEqual(["A", "B"]);
  });

  it("shows per-option correctness styling after reveal", async () => {
    const store = makeStore();
    const revealed = fixture();
    revealed.questions[0] = {
      ...revealed.questions[0],
      answer: { ...revealed.questions[0].answer, selected: ["A"], revealed: true },
      // ADR-13: correctAnswer is now an array.
      correctAnswer: ["C"],
      explanations: {
        C: { description: "right", reason: "because" },
        A: { description: "nope", reason: "wrong" },
      },
      Tips: "tip",
    };
    patch.mockResolvedValue(revealed);

    store.getState().select(1, "A");
    await act(async () => {
      await store.getState().reveal(1);
    });

    wrap(<QuestionPanel store={store} progressiveReveal={false} />);
    const correct = screen.getByRole("checkbox", { name: /Cherry/ });
    expect(correct).toHaveAttribute("data-correct", "true");
    const wrong = screen.getByRole("checkbox", { name: /Apple/ });
    expect(wrong).toHaveAttribute("data-incorrect", "true");
  });
});

describe("<RevealedDetail> progressive reveal", () => {
  const revealedQ = () => {
    const q = fixture().questions[0];
    return {
      ...q,
      answer: { ...q.answer, revealed: true },
      // ADR-13: correctAnswer is now an array.
      correctAnswer: ["C"],
      explanations: {
        C: { description: "Cherry", reason: "it is correct" },
        A: { description: "Apple", reason: "it is wrong" },
      },
      Tips: "Remember C",
    };
  };

  it("hides explanations behind an expander when progressive reveal is on", () => {
    wrap(<RevealedDetail question={revealedQ()} progressive />);
    // Correct answer is shown immediately.
    expect(screen.getByText(/Correct answer: C/)).toBeInTheDocument();
    // Explanations hidden until expanded.
    expect(screen.queryByText(/it is correct/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show explanations/i }));
    expect(screen.getByText(/it is correct/)).toBeInTheDocument();
    expect(screen.getByText(/Remember C/)).toBeInTheDocument();
  });

  it("shows explanations inline when progressive reveal is off", () => {
    wrap(<RevealedDetail question={revealedQ()} progressive={false} />);
    expect(screen.getByText(/it is correct/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /show explanations/i }),
    ).not.toBeInTheDocument();
  });
});

describe("<ExamTimer>", () => {
  it("stops ticking when the store is paused", async () => {
    vi.useFakeTimers();
    const store = makeStore();
    wrap(<ExamTimer store={store} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const afterTwo = store.getState().timer.elapsedMs;
    expect(afterTwo).toBeGreaterThanOrEqual(2000);

    await act(async () => {
      await store.getState().pause();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    // No further accumulation after pause.
    expect(store.getState().timer.elapsedMs).toBe(afterTwo);
    vi.useRealTimers();
  });
});

describe("<SubmitExamDialog>", () => {
  it("shows unanswered + flagged counts and submits → onSubmitted(id)", async () => {
    const store = makeStore();
    store.getState().select(1, "A"); // 1 answered, 2 unanswered
    store.getState().toggleFlag(2);

    const onSubmitted = vi.fn();
    wrap(
      <SubmitExamDialog
        store={store}
        open
        onOpenChange={vi.fn()}
        onSubmitted={onSubmitted}
      />,
    );

    // Counts.
    expect(screen.getByText("2")).toBeInTheDocument(); // unanswered
    // Submit.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit exam/i }));
    });
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        "/sessions/sess-1/submit",
        expect.objectContaining({ json: expect.any(Object) }),
      );
      expect(onSubmitted).toHaveBeenCalledWith("sess-1");
    });
  });
});
