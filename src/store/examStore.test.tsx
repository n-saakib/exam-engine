/**
 * ExamStore unit tests (F4-T14 — the crux). Verifies the debounced autosave,
 * forced commit flush + server-data merge, monotonic commit, tick accumulation,
 * pause flush, and submit. The apiClient is mocked; timers are faked so we can
 * assert the debounce precisely.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { LiveSession } from "@/domain/types";
import { apiClient } from "@/lib/apiClient";
import { createExamStore, AUTOSAVE_DEBOUNCE_MS } from "./examStore";

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

const patch = vi.mocked(apiClient.patch);
const post = vi.mocked(apiClient.post);

function fixture(overrides: Partial<LiveSession> = {}): LiveSession {
  return {
    id: "sess-1",
    status: "in_progress",
    quesPath: "Exams/Cloud/AWS/SAA/Easy",
    domainLabel: "Cloud / AWS / SAA / Easy",
    setTitle: "Set 1",
    difficulty: "Easy",
    mode: "full",
    totalQuestions: 2,
    currentIndex: 0,
    timer: { enabled: true, limitMs: 60_000, elapsedMs: 0, expired: false },
    questions: [
      {
        id: 1,
        order: 0,
        questionType: "single",
        questionText: "Q1?",
        options: { A: "a", B: "b", C: "c", D: "d" },
        answer: { selected: [], flagged: false, committed: false, gaveUp: false, timeSpentMs: 0 },
      },
      {
        id: 2,
        order: 1,
        questionType: "single",
        questionText: "Q2?",
        options: { A: "a", B: "b", C: "c", D: "d" },
        answer: { selected: [], flagged: false, committed: false, gaveUp: false, timeSpentMs: 0 },
      },
    ],
    createdAt: "2026-06-10T00:00:00Z",
    startedAt: "2026-06-10T00:00:00Z",
    updatedAt: "2026-06-10T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  patch.mockResolvedValue(fixture());
  post.mockResolvedValue({} as never);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ExamStore — state mutations", () => {
  it("select accumulates (multi-select, checkbox) and toggles off when re-clicked", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(fixture());

    store.getState().select(1, "A");
    expect(store.getState().answers[1].selected).toEqual(["A"]);

    store.getState().select(1, "B"); // append, not replace
    expect(store.getState().answers[1].selected).toEqual(["A", "B"]);

    store.getState().select(1, "A"); // toggle off
    expect(store.getState().answers[1].selected).toEqual(["B"]);

    store.getState().select(1, "B"); // toggle off → empty
    expect(store.getState().answers[1].selected).toEqual([]);
  });

  it("toggleFlag toggles per question", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(fixture());
    store.getState().toggleFlag(1);
    expect(store.getState().answers[1].flagged).toBe(true);
    store.getState().toggleFlag(1);
    expect(store.getState().answers[1].flagged).toBe(false);
  });

  it("tick accumulates elapsedMs while running and stops at the limit (expiry)", () => {
    const store = createExamStore();
    store.getState().loadFromDTO(fixture({ timer: { enabled: true, limitMs: 3000, elapsedMs: 0 } }));
    store.getState().tick(1000);
    store.getState().tick(1000);
    expect(store.getState().timer.elapsedMs).toBe(2000);
    expect(store.getState().timer.expired).toBe(false);
    store.getState().tick(1000); // hits limit
    expect(store.getState().timer.elapsedMs).toBe(3000);
    expect(store.getState().timer.expired).toBe(true);
    expect(store.getState().timer.running).toBe(false);
    store.getState().tick(1000); // no-op once stopped
    expect(store.getState().timer.elapsedMs).toBe(3000);
  });

  it("select is a no-op once the question is committed (locked)", () => {
    const store = createExamStore();
    const dto = fixture();
    dto.questions[0].answer.committed = true;
    store.getState().loadFromDTO(dto);
    store.getState().select(1, "A");
    expect(store.getState().answers[1].selected).toEqual([]);
  });
});

describe("ExamStore — debounced autosave", () => {
  it("debounces mutating actions then PATCHes once with the changed fields + absolute elapsedMs", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(fixture());

    store.getState().tick(1000); // elapsed = 1000
    store.getState().select(1, "A");
    store.getState().select(1, "B"); // appends under multi-select

    expect(patch).not.toHaveBeenCalled(); // still within debounce window

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(patch).toHaveBeenCalledTimes(1);
    const [path, opts] = patch.mock.calls[0];
    expect(path).toBe("/sessions/sess-1");
    expect((opts as { json: Record<string, unknown> }).json).toMatchObject({
      elapsedMs: 1000,
      answer: { questionId: 1, selected: ["A", "B"] },
    });
  });

  it("coalesces multiple actions within the window into a single flush", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(fixture());
    store.getState().select(1, "A");
    store.getState().toggleFlag(1);
    store.getState().goTo(1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(patch).toHaveBeenCalledTimes(1);
    const json = (patch.mock.calls[0][1] as { json: Record<string, unknown> }).json;
    expect(json).toMatchObject({
      currentIndex: 1,
      answer: { questionId: 1, selected: ["A"], flagged: true },
    });
  });

  it("coalesces multiple append-selects into a single flush with the union of selections", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(fixture());
    store.getState().select(1, "A");
    store.getState().select(1, "B");
    store.getState().select(1, "C");
    store.getState().toggleFlag(1);
    store.getState().goTo(1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(patch).toHaveBeenCalledTimes(1);
    const json = (patch.mock.calls[0][1] as { json: Record<string, unknown> }).json;
    expect(json).toMatchObject({
      currentIndex: 1,
      answer: { questionId: 1, selected: ["A", "B", "C"], flagged: true },
    });
  });
});

describe("ExamStore — commit (forced immediate flush + merge)", () => {
  it("commit cancels the pending debounce and fires an immediate PATCH", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(fixture());

    store.getState().select(1, "A"); // schedules a debounce
    expect(patch).not.toHaveBeenCalled();

    const committed = fixture();
    committed.questions[0] = {
      ...committed.questions[0],
      answer: { ...committed.questions[0].answer, selected: ["A"], committed: true },
      // ADR-13: correctAnswer is now an array.
      correctAnswer: ["C"],
      explanations: { C: { description: "right", reason: "because" } },
      Tips: "remember C",
    };
    patch.mockResolvedValue(committed);

    await store.getState().commit(1);

    // Fired immediately (no timer advance needed) and only once.
    expect(patch).toHaveBeenCalledTimes(1);
    const json = (patch.mock.calls[0][1] as { json: Record<string, unknown> }).json;
    expect(json).toMatchObject({ answer: { questionId: 1, committed: true, selected: ["A"] } });

    // No leftover debounce flush.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 2);
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("commit merges the server-returned correct answer + explanations + Tips", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(fixture());

    const committed = fixture();
    committed.questions[0] = {
      ...committed.questions[0],
      answer: { ...committed.questions[0].answer, committed: true },
      // ADR-13: correctAnswer is now an array.
      correctAnswer: ["C"],
      explanations: { C: { description: "right", reason: "because" } },
      Tips: "remember C",
    };
    patch.mockResolvedValue(committed);

    await store.getState().commit(1);

    const q = store.getState().questions[0];
    expect(store.getState().answers[1].committed).toBe(true);
    expect(q.correctAnswer).toEqual(["C"]);
    expect(q.explanations).toEqual({ C: { description: "right", reason: "because" } });
    expect(q.Tips).toBe("remember C");
  });

  it("commit is monotonic — a second commit does not PATCH again", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(fixture());
    await store.getState().commit(1);
    expect(patch).toHaveBeenCalledTimes(1);
    await store.getState().commit(1);
    expect(patch).toHaveBeenCalledTimes(1);
  });
});

describe("ExamStore — pause & submit", () => {
  it("pause stops the timer and flushes pending state immediately", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(fixture());
    store.getState().select(1, "A"); // pending debounce
    await store.getState().pause();
    expect(store.getState().timer.running).toBe(false);
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("submit flushes, POSTs submit with absolute elapsedMs, and marks submitted", async () => {
    const store = createExamStore();
    store.getState().loadFromDTO(fixture());
    store.getState().tick(5000);
    store.getState().select(1, "A");

    const id = await store.getState().submit();

    expect(id).toBe("sess-1");
    expect(patch).toHaveBeenCalled(); // pending flushed first
    expect(post).toHaveBeenCalledWith("/sessions/sess-1/submit", {
      json: { elapsedMs: 5000 },
    });
    expect(store.getState().submitted).toBe(true);
    expect(store.getState().status).toBe("completed");
  });
});

describe("ExamStore — resume hydration", () => {
  it("loadFromDTO restores exact position/answers/flags/commits/elapsed", () => {
    const store = createExamStore();
    const dto = fixture({
      currentIndex: 1,
      timer: { enabled: true, limitMs: 60_000, elapsedMs: 12_000 },
    });
    dto.questions[0].answer = {
      selected: ["B"],
      flagged: true,
      committed: false,
      gaveUp: false,
      timeSpentMs: 4000,
    };
    store.getState().loadFromDTO(dto);

    expect(store.getState().currentIndex).toBe(1);
    expect(store.getState().timer.elapsedMs).toBe(12_000);
    expect(store.getState().timer.running).toBe(true);
    expect(store.getState().answers[1]).toMatchObject({
      selected: ["B"],
      flagged: true,
    });
  });
});
