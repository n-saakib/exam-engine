/**
 * <ExamScreen> guard test (F4-T15): a non-in-progress session redirects to
 * /results/:id. The session fetch + settings are mocked; we assert the router
 * is told to replace to the results route.
 */

import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { LiveSession } from "@/domain/types";

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, prefetch: vi.fn() }),
}));

vi.mock("@/hooks/useExamSession");
vi.mock("@/hooks/useSettings");

vi.mock("@/lib/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";
import { createExamStore } from "@/store/examStore";

function completedDTO(): LiveSession {
  return {
    id: "done-1",
    status: "completed",
    quesPath: "p",
    domainLabel: "d",
    setTitle: "s",
    difficulty: "Easy",
    mode: "full",
    totalQuestions: 1,
    currentIndex: 0,
    timer: { enabled: false, elapsedMs: 0 },
    questions: [],
    createdAt: "x",
    startedAt: "x",
    updatedAt: "x",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<ExamScreen> guard", () => {
  it("redirects a completed session to /results/:id", async () => {
    const { useExamSession } = await import("@/hooks/useExamSession");
    const { useSettings } = await import("@/hooks/useSettings");

    vi.mocked(useExamSession).mockReturnValue({
      data: completedDTO(),
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useExamSession>);

    vi.mocked(useSettings).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useSettings>);

    const { ExamScreen } = await import("./ExamScreen");
    render(
      <ToastProvider>
        <GlobalDialogsProvider>
          <ExamScreen sessionId="done-1" store={createExamStore()} />
        </GlobalDialogsProvider>
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/results/done-1");
    });
  });
});
