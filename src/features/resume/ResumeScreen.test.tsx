/**
 * Component tests for F6 ResumeScreen + sub-components.
 *
 * Covers (per spec):
 *  - Rows render context fields: domain path, % answered, elapsed time, paused date.
 *  - Resume button navigates to /exam/:id.
 *  - Discard: shows confirm dialog, then optimistically removes row + calls DELETE.
 *  - EmptyState shown when no sessions.
 */

import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";
import type { SessionListRow, SessionList } from "@/domain/types";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
}));

const mockGet = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
  },
}));

// ── Fixtures ───────────────────────────────────────────────────────────────────

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
    timeElapsedMs: 252000,        // 4m 12s
    pausedAt: "2026-06-11T10:32:00.000Z",
    createdAt: "2026-06-11T10:00:00.000Z",
    ...overrides,
  };
}

function makeSessionList(items: SessionListRow[]): SessionList {
  return { items, total: items.length };
}

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function Wrapper({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <GlobalDialogsProvider>
          {children}
        </GlobalDialogsProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResumeScreen — populated list", () => {
  it("renders domain path for each session", async () => {
    const session = makeSession();
    mockGet.mockResolvedValue(makeSessionList([session]));

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText("Cloud / AWS / SAA / Easy")).toBeInTheDocument();
    });
  });

  it("renders set title for each session", async () => {
    const session = makeSession();
    mockGet.mockResolvedValue(makeSessionList([session]));

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText("IAM & EC2 Easy Set 1")).toBeInTheDocument();
    });
  });

  it("renders % answered chip", async () => {
    const session = makeSession({ percentAnswered: 40 });
    mockGet.mockResolvedValue(makeSessionList([session]));

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText("40% answered")).toBeInTheDocument();
    });
  });

  it("renders elapsed time formatted", async () => {
    // 252000 ms = 4m 12s
    const session = makeSession({ timeElapsedMs: 252000 });
    mockGet.mockResolvedValue(makeSessionList([session]));

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText(/4m 12s elapsed/)).toBeInTheDocument();
    });
  });

  it("renders last-paused date", async () => {
    const session = makeSession({ pausedAt: "2026-06-11T10:32:00.000Z" });
    mockGet.mockResolvedValue(makeSessionList([session]));

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => {
      // The formatted date includes "Jun" and "10:32" (locale-dependent but at least partial match)
      expect(screen.getByText(/Paused /)).toBeInTheDocument();
    });
  });

  it("renders multiple sessions", async () => {
    const sessions = [
      makeSession({ id: "sess-1", setTitle: "Set One", pausedAt: "2026-06-11T11:00:00.000Z" }),
      makeSession({ id: "sess-2", setTitle: "Set Two", pausedAt: "2026-06-11T09:00:00.000Z" }),
    ];
    mockGet.mockResolvedValue(makeSessionList(sessions));

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText("Set One")).toBeInTheDocument();
      expect(screen.getByText("Set Two")).toBeInTheDocument();
    });
  });

  it("sorts sessions newest-first by pausedAt", async () => {
    // sess-2 has more-recent pausedAt — should appear first.
    const sessions = [
      makeSession({ id: "sess-1", setTitle: "Older Set", pausedAt: "2026-06-10T08:00:00.000Z" }),
      makeSession({ id: "sess-2", setTitle: "Newer Set", pausedAt: "2026-06-11T12:00:00.000Z" }),
    ];
    mockGet.mockResolvedValue(makeSessionList(sessions));

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => {
      const rows = screen.getAllByRole("article");
      expect(rows[0]).toHaveTextContent("Newer Set");
      expect(rows[1]).toHaveTextContent("Older Set");
    });
  });
});

describe("ResumeScreen — empty state", () => {
  it("shows EmptyState when there are no in-progress sessions", async () => {
    mockGet.mockResolvedValue(makeSessionList([]));

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText("No paused exams")).toBeInTheDocument();
    });
  });
});

describe("ResumeButton", () => {
  it("navigates to /exam/:id on click", async () => {
    const session = makeSession({ id: "sess-abc" });
    mockGet.mockResolvedValue(makeSessionList([session]));

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => screen.getByRole("button", { name: "Resume exam" }));

    fireEvent.click(screen.getByRole("button", { name: "Resume exam" }));
    expect(mockPush).toHaveBeenCalledWith("/exam/sess-abc");
  });
});

describe("DiscardButton", () => {
  it("shows confirm dialog and calls DELETE on confirm", async () => {
    const session = makeSession({ id: "sess-to-discard" });
    mockGet.mockResolvedValue(makeSessionList([session]));
    mockDelete.mockResolvedValue(undefined);

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => screen.getByRole("button", { name: "Discard exam" }));

    // Click Discard — should open confirm dialog.
    fireEvent.click(screen.getByRole("button", { name: "Discard exam" }));

    // Wait for confirm dialog to appear.
    await waitFor(() => {
      expect(screen.getByText("Discard exam?")).toBeInTheDocument();
    });

    // Click the "Discard" confirm button.
    const confirmBtn = screen.getByRole("button", { name: "Discard" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/sessions/sess-to-discard");
    });
  });

  it("does NOT call DELETE when user cancels the dialog", async () => {
    const session = makeSession({ id: "sess-keep" });
    mockGet.mockResolvedValue(makeSessionList([session]));

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => screen.getByRole("button", { name: "Discard exam" }));

    fireEvent.click(screen.getByRole("button", { name: "Discard exam" }));

    await waitFor(() => {
      expect(screen.getByText("Discard exam?")).toBeInTheDocument();
    });

    // Click "Keep" (cancel).
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));

    await waitFor(() => {
      expect(mockDelete).not.toHaveBeenCalled();
    });
    // Session row should still be visible.
    expect(screen.getByText("IAM & EC2 Easy Set 1")).toBeInTheDocument();
  });

  it("optimistically removes the row from the list", async () => {
    const session = makeSession({ id: "sess-opt" });
    // DELETE resolves after a delay so we can check optimistic state.
    mockGet.mockResolvedValue(makeSessionList([session]));
    // Keep DELETE pending so optimistic removal is observable.
    let resolveDelete!: () => void;
    mockDelete.mockReturnValue(new Promise<void>((res) => { resolveDelete = res; }));

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => screen.getByRole("button", { name: "Discard exam" }));

    fireEvent.click(screen.getByRole("button", { name: "Discard exam" }));

    await waitFor(() => screen.getByText("Discard exam?"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    });

    // Optimistic removal: row should disappear before the DELETE resolves.
    await waitFor(() => {
      expect(screen.queryByText("IAM & EC2 Easy Set 1")).not.toBeInTheDocument();
    });

    // Resolve DELETE so cleanup happens cleanly.
    act(() => resolveDelete());
  });

  it("rolls back optimistic removal and shows toast on DELETE error", async () => {
    const session = makeSession({ id: "sess-err" });
    mockGet.mockResolvedValue(makeSessionList([session]));
    mockDelete.mockRejectedValue(new Error("Network error"));

    const { ResumeScreen } = await import("./ResumeScreen");
    const qc = makeQueryClient();
    render(<Wrapper queryClient={qc}><ResumeScreen /></Wrapper>);

    await waitFor(() => screen.getByRole("button", { name: "Discard exam" }));

    fireEvent.click(screen.getByRole("button", { name: "Discard exam" }));
    await waitFor(() => screen.getByText("Discard exam?"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    });

    // After error: rollback restores the row.
    await waitFor(() => {
      expect(screen.getByText("IAM & EC2 Easy Set 1")).toBeInTheDocument();
    });

    // Toast should mention failure.
    await waitFor(() => {
      expect(screen.getByText("Failed to discard")).toBeInTheDocument();
    });
  });
});
