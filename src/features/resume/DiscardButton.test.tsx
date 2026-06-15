/**
 * <DiscardButton> tests. The component lives in PausedExamRow.tsx and is
 * exported individually so it can be tested in isolation. It:
 *   1. Opens a global confirm dialog on click.
 *   2. On confirm, optimistically removes the row from the
 *      `["sessions", "in_progress"]` cache and DELETE /api/sessions/:id.
 *   3. On error, restores the row and shows a danger toast.
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";
import type { SessionListRow, SessionList } from "@/domain/types";

const mockDelete = vi.fn();
const mockGet = vi.fn();

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

import { DiscardButton } from "./PausedExamRow";

function makeSession(overrides: Partial<SessionListRow> = {}): SessionListRow {
  return {
    id: "sess-1",
    status: "in_progress",
    domainLabel: "Cloud / AWS / SAA / Easy",
    setTitle: "IAM & EC2 Easy Set 1",
    difficulty: "Easy",
    percentAnswered: 40,
    answeredCount: 4,
    totalQuestions: 10,
    timeElapsedMs: 252_000,
    pausedAt: "2026-06-11T10:32:00.000Z",
    createdAt: "2026-06-11T10:00:00.000Z",
    ...overrides,
  };
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <GlobalDialogsProvider>{children}</GlobalDialogsProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<DiscardButton>", () => {
  it("opens a confirm dialog when clicked", async () => {
    const session = makeSession();
    render(<DiscardButton session={session} />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByRole("button", { name: /discard exam/i }));

    // Global dialog title is rendered.
    expect(await screen.findByText("Discard exam?")).toBeInTheDocument();
  });

  it("calls DELETE and removes the row from the in-progress list on confirm", async () => {
    const session = makeSession({ id: "sess-to-discard" });
    mockDelete.mockResolvedValue(undefined);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ["sessions", "in_progress"] as const;
    const initialList: SessionList = {
      items: [session, makeSession({ id: "sess-other", setTitle: "Other Set" })],
      total: 2,
    };
    qc.setQueryData(key, initialList);

    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <GlobalDialogsProvider>
            <DiscardButton session={session} />
          </GlobalDialogsProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /discard exam/i }));

    // Confirm in the dialog.
    const confirmBtn = await screen.findByRole("button", { name: "Discard" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/sessions/sess-to-discard");
    });

    // The cached list should no longer contain the discarded session.
    const updated = qc.getQueryData<SessionList>(key);
    expect(updated?.items.find((s) => s.id === "sess-to-discard")).toBeUndefined();
  });

  it("restores the row and shows a danger toast when DELETE fails", async () => {
    const session = makeSession({ id: "sess-err" });
    mockDelete.mockRejectedValue(new Error("network down"));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ["sessions", "in_progress"] as const;
    const initialList: SessionList = { items: [session], total: 1 };
    qc.setQueryData(key, initialList);

    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <GlobalDialogsProvider>
            <DiscardButton session={session} />
          </GlobalDialogsProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /discard exam/i }));

    const confirmBtn = await screen.findByRole("button", { name: "Discard" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    // After the error rolls back, the row should be back in the cache.
    await waitFor(() => {
      const updated = qc.getQueryData<SessionList>(key);
      expect(updated?.items.find((s) => s.id === "sess-err")).toBeDefined();
    });

    // And a danger toast with the failure title should be visible.
    expect(await screen.findByText("Failed to discard")).toBeInTheDocument();
  });
});
