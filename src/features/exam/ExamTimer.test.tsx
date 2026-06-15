/**
 * <ExamTimer> tests. The component subscribes to a zustand store and drives
 * a 1 Hz tick via setInterval. We seed the store with `loadFromDTO`, then
 * advance the timer and assert the visible time string.
 *
 * Verifies:
 *   - Renders "0:00" on a fresh in_progress session.
 *   - Ticks every second when running.
 *   - Stops at limitMs (timer.expired = true).
 *   - Stops ticking once `running` is false.
 */

import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";
import { createExamStore, type ExamStore } from "@/store/examStore";
import type { LiveSession, LiveQuestion } from "@/domain/types";

vi.mock("@/lib/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import { ExamTimer } from "./ExamTimer";

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

function makeSession(timer: {
  enabled: boolean;
  limitMs?: number | null;
  elapsedMs: number;
  expired?: boolean;
}): LiveSession {
  return {
    id: "s1",
    status: "in_progress",
    quesPath: "p",
    domainLabel: "d",
    setTitle: "s",
    difficulty: "Easy",
    mode: "full",
    totalQuestions: 1,
    currentIndex: 0,
    timer: {
      enabled: timer.enabled,
      limitMs: timer.limitMs ?? null,
      elapsedMs: timer.elapsedMs,
      expired: timer.expired ?? false,
    },
    questions: [makeQuestion(1)],
    createdAt: "x",
    startedAt: "x",
    updatedAt: "x",
  };
}

function renderTimer(store: ExamStore) {
  return render(
    <ToastProvider>
      <GlobalDialogsProvider>
        <ExamTimer store={store} />
      </GlobalDialogsProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("<ExamTimer> — initial render", () => {
  it("renders the remaining time (limit - elapsed) on a fresh timed session", () => {
    // Contract: a 60s-timed session with 0 elapsed shows the remaining
    // time, not the elapsed time. "1:00" = 60 seconds remaining.
    const store = createExamStore();
    store.getState().loadFromDTO(
      makeSession({ enabled: true, limitMs: 60_000, elapsedMs: 0 }),
    );

    renderTimer(store);

    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("1:00");
  });

  it("renders '0:00' on an untimed session (enabled=false) at elapsedMs 0", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(
      makeSession({ enabled: false, limitMs: null, elapsedMs: 0 }),
    );

    renderTimer(store);

    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("0:00");
  });
});

describe("<ExamTimer> — ticking", () => {
  it("decrements the visible time after advancing fake timers by 1 second", () => {
    vi.useFakeTimers();

    const store = createExamStore();
    store.getState().loadFromDTO(
      makeSession({ enabled: true, limitMs: 60_000, elapsedMs: 0 }),
    );

    renderTimer(store);

    expect(screen.getByRole("timer")).toHaveTextContent("1:00");

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("timer")).toHaveTextContent("0:59");
  });

  it("fires multiple ticks over 5 seconds", () => {
    vi.useFakeTimers();

    const store = createExamStore();
    store.getState().loadFromDTO(
      makeSession({ enabled: true, limitMs: 60_000, elapsedMs: 0 }),
    );

    renderTimer(store);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // 60_000 - 5_000 = 55_000 ms = "0:55"
    expect(screen.getByRole("timer")).toHaveTextContent("0:55");
  });
});

describe("<ExamTimer> — expiry and pause", () => {
  it("clamps to '0:00' and shows expired styling once elapsedMs reaches the limit", () => {
    // The store's tick() will set expired=true and stop running once we
    // exceed the limit. We bypass the interval by directly calling tick().
    const store = createExamStore();
    store.getState().loadFromDTO(
      makeSession({ enabled: true, limitMs: 60_000, elapsedMs: 59_500 }),
    );

    renderTimer(store);

    // Manually push past the limit (simulates the 1Hz tick catching up).
    act(() => {
      store.getState().tick(1_000);
    });

    expect(screen.getByRole("timer")).toHaveTextContent("0:00");
    expect(store.getState().timer.expired).toBe(true);
  });

  it("stops ticking once running is false (no further decrement after pause)", () => {
    vi.useFakeTimers();

    const store = createExamStore();
    store.getState().loadFromDTO(
      makeSession({ enabled: true, limitMs: 60_000, elapsedMs: 0 }),
    );

    renderTimer(store);

    // Pause the timer — set running:false via the dedicated action.
    act(() => {
      store.getState().pause();
    });

    expect(screen.getByRole("timer")).toHaveTextContent("1:00");

    // Advance timers; the paused timer should NOT decrement.
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByRole("timer")).toHaveTextContent("1:00");
  });
});
