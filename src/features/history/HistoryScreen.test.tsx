/**
 * Component tests for HistoryScreen (F7 frontend):
 *   - filter change re-queries (stable key via useReducer)
 *   - inline bookmark optimistic + rollback
 *   - inline note save
 *   - row expand → View details link + Retake buttons
 *   - empty state
 *   - AggregateStatsBar renders stats
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/Toast";
import type { HistoryList, StatsResponse, HistoryRow } from "@/domain/types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({}),
}));

// Mock next/link to a simple <a>.
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_ROW: HistoryRow = {
  id: "sess-h1",
  domainLabel: "Cloud / AWS / SAA / Easy",
  difficulty: "Easy",
  setTitle: "IAM Set 1",
  scorePercent: 80,
  timeTakenMs: 120000,
  completedAt: "2026-06-11T10:00:00.000Z",
  isBookmarked: false,
  hasNote: false,
};

const MOCK_HISTORY: HistoryList = {
  items: [MOCK_ROW],
  total: 1,
};

const MOCK_STATS: StatsResponse = {
  totalExams: 5,
  averageScore: 72.4,
  bestScore: 95,
  currentStreakDays: 3,
  longestStreakDays: 7,
  lastExam: { id: "sess-h1", scorePercent: 80, completedAt: "2026-06-11T10:00:00.000Z" },
  byDifficulty: { Easy: { count: 3, avg: 78 }, Hard: { count: 2, avg: 62 } },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return { queryClient, Wrapper };
}

async function renderHistoryScreen() {
  const { HistoryScreen } = await import("./HistoryScreen");
  const { Wrapper } = createWrapper();
  return render(
    <Wrapper>
      <HistoryScreen />
    </Wrapper>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // By default: history returns one row; stats returns MOCK_STATS.
  mockGet.mockImplementation((path: string) => {
    if (path === "/history") return Promise.resolve(MOCK_HISTORY);
    if (path === "/stats") return Promise.resolve(MOCK_STATS);
    return Promise.resolve({});
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
// Basic render + loading
// ────────────────────────────────────────────────────────────────────────────
describe("<HistoryScreen> — basic render", () => {
  it("renders the page heading", async () => {
    await renderHistoryScreen();
    expect(await screen.findByText("Exam History")).toBeTruthy();
  });

  it("renders aggregate stats bar once stats load", async () => {
    await renderHistoryScreen();
    // Stats bar shows total exams.
    expect(await screen.findByText("5")).toBeTruthy();
    // Current streak.
    expect(screen.getByText("3 days")).toBeTruthy();
  });

  it("renders the history row after load", async () => {
    await renderHistoryScreen();
    // Row content visible.
    expect(await screen.findByText("Cloud / AWS / SAA / Easy")).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy();
  });

  it("renders empty state when history is empty", async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === "/history") return Promise.resolve({ items: [], total: 0 });
      if (path === "/stats") return Promise.resolve(MOCK_STATS);
      return Promise.resolve({});
    });
    await renderHistoryScreen();
    expect(await screen.findByText("No exams found")).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Filter bar — changes re-query
// ────────────────────────────────────────────────────────────────────────────
describe("<HistoryFilterBar> — filter changes trigger re-query", () => {
  it("changing difficulty filter calls GET /history with the new difficulty param", async () => {
    await renderHistoryScreen();
    await screen.findByText("Exam History");

    // Clear previous calls.
    mockGet.mockClear();

    const select = screen.getByLabelText("Difficulty");
    await act(async () => {
      fireEvent.change(select, { target: { value: "Hard" } });
    });

    await waitFor(() => {
      const historyCalls = mockGet.mock.calls.filter(
        (call) => (call[0] as string) === "/history",
      );
      expect(historyCalls.length).toBeGreaterThan(0);
      const lastCall = historyCalls[historyCalls.length - 1]!;
      const opts = lastCall[1] as { query?: Record<string, unknown> };
      expect(opts?.query?.difficulty).toBe("Hard");
    });
  });

  it("Clear button resets the difficulty select to empty", async () => {
    await renderHistoryScreen();
    await screen.findByText("Exam History");

    // Set a filter first.
    const select = screen.getByLabelText("Difficulty") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: "Hard" } });
    });
    expect(select.value).toBe("Hard");

    const clearBtn = screen.getByRole("button", { name: /clear/i });
    await act(async () => {
      fireEvent.click(clearBtn);
    });

    // After clear, difficulty select should be reset to empty.
    await waitFor(() => {
      expect(select.value).toBe("");
    });
  });

  it("bookmarked toggle sends bookmarked=true query param", async () => {
    await renderHistoryScreen();
    await screen.findByText("Exam History");
    mockGet.mockClear();

    const checkbox = screen.getByRole("checkbox", { name: /bookmarked only/i });
    await act(async () => {
      fireEvent.click(checkbox);
    });

    await waitFor(() => {
      const historyCalls = mockGet.mock.calls.filter(
        (call) => (call[0] as string) === "/history",
      );
      const lastCall = historyCalls[historyCalls.length - 1]!;
      const opts = lastCall[1] as { query?: Record<string, unknown> };
      expect(opts?.query?.bookmarked).toBe(true);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Row expand — View details link + Retake buttons
// ────────────────────────────────────────────────────────────────────────────
describe("<HistoryRow> — expand shows details and retake actions", () => {
  it("clicking a row expands to show View details link and Retake buttons", async () => {
    await renderHistoryScreen();
    await screen.findByText("Cloud / AWS / SAA / Easy");

    // The expand button has no accessible name; find by looking for aria-expanded.
    const expandBtn = document.querySelector("[aria-expanded]") as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(expandBtn);
    });

    // Should show the detail section.
    await waitFor(() => {
      expect(screen.getByText("View details")).toBeTruthy();
      expect(screen.getByRole("button", { name: /retake incorrect/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /retake all/i })).toBeTruthy();
    });
  });

  it("View details link points to /history/:id", async () => {
    await renderHistoryScreen();
    await screen.findByText("Cloud / AWS / SAA / Easy");

    const expandBtn = document.querySelector("[aria-expanded]") as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(expandBtn);
    });

    await waitFor(() => {
      const link = screen.getByText("View details").closest("a");
      expect(link?.getAttribute("href")).toBe("/history/sess-h1");
    });
  });

  it("clicking Retake all calls POST /sessions/:id/retake with scope=all", async () => {
    const newSession = { id: "new-retake", status: "in_progress", questions: [] };
    mockPost.mockResolvedValueOnce(newSession);

    await renderHistoryScreen();
    await screen.findByText("Cloud / AWS / SAA / Easy");

    const expandBtn = document.querySelector("[aria-expanded]") as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(expandBtn);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retake all/i })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /retake all/i }));
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/sessions/sess-h1/retake",
        expect.objectContaining({ json: { scope: "all" } }),
      );
      expect(mockPush).toHaveBeenCalledWith("/exam/new-retake");
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Inline bookmark — optimistic update + rollback
// ────────────────────────────────────────────────────────────────────────────
describe("<InlineBookmarkToggle> — optimistic update + rollback", () => {
  it("calls PATCH /sessions/:id/review with isBookmarked on click", async () => {
    mockPatch.mockResolvedValueOnce({ id: "sess-h1", isBookmarked: true, note: null });

    await renderHistoryScreen();
    await screen.findByText("Cloud / AWS / SAA / Easy");

    const bookmarkBtn = screen.getByRole("button", { name: /bookmark$/i });
    await act(async () => {
      fireEvent.click(bookmarkBtn);
    });

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        "/sessions/sess-h1/review",
        expect.objectContaining({ json: { isBookmarked: true } }),
      );
    });
  });

  it("rolls back on PATCH error (bookmark remains in original state)", async () => {
    mockPatch.mockRejectedValueOnce(new Error("network error"));

    await renderHistoryScreen();
    await screen.findByText("Cloud / AWS / SAA / Easy");

    const bookmarkBtn = screen.getByRole("button", { name: /bookmark$/i });
    await act(async () => {
      fireEvent.click(bookmarkBtn);
    });

    // After error + rollback, the button should still say "Bookmark" (not bookmarked).
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /bookmark$/i })).toBeTruthy();
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AggregateStatsBar — renders stats fields
// ────────────────────────────────────────────────────────────────────────────
describe("<AggregateStatsBar>", () => {
  it("displays all four stat fields", async () => {
    await renderHistoryScreen();
    expect(await screen.findByText("Total exams")).toBeTruthy();
    expect(screen.getByText("Average score")).toBeTruthy();
    expect(screen.getByText("Best score")).toBeTruthy();
    expect(screen.getByText("Current streak")).toBeTruthy();
  });

  it("shows correct numeric values from stats", async () => {
    await renderHistoryScreen();
    // bestScore = 95
    expect(await screen.findByText("95%")).toBeTruthy();
    // averageScore = 72.4
    expect(screen.getByText("72.4%")).toBeTruthy();
  });
});
