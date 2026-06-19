/**
 * Component tests for F5 ResultsScreen + sub-components (F5 testing plan).
 * Covers: filters, BookmarkToggle optimistic update + rollback, NoteEditor save,
 * RetakeMenu button states and navigation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/Toast";
import type { Results } from "@/domain/types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock next/navigation before any imports that transitively use it.
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useParams: () => ({}),
}));

// Mock apiClient so tests are network-free.
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

// ── Test fixtures ─────────────────────────────────────────────────────────────

const MOCK_RESULTS: Results = {
  id: "sess-1",
  status: "completed",
  domainLabel: "Cloud / AWS / SAA / Easy",
  setTitle: "IAM & EC2 Easy Set 1",
  difficulty: "Easy",
  mode: "full",
  summary: {
    scorePercent: 50,
    correct: 2,
    incorrect: 1,
    gaveUp: 1,
    flagged: 1,
    total: 4,
    timeTakenMs: 120000,
    timerLimitMs: 600000,
  },
  isBookmarked: false,
  note: null,
  completedAt: "2026-06-11T10:00:00.000Z",
  questions: [
    {
      id: 1,
      order: 1,
      questionType: "single",
      questionText: "What does IAM stand for?",
      options: { A: "Internet Access Management", B: "Identity and Access Management", C: "Integrated Account Manager", D: "Internal Auth Module" },
      correctAnswer: "B",
      yourAnswer: ["B"],
      gaveUp: false,
      outcome: "correct",
      flagged: false,
      explanations: {
        A: { description: "Wrong", reason: "Not the right expansion" },
        B: { description: "Right", reason: "IAM stands for Identity and Access Management" },
        C: { description: "Wrong", reason: "Made up" },
        D: { description: "Wrong", reason: "Made up" },
      },
      Tips: "IAM = Identity and Access Management",
    },
    {
      id: 2,
      order: 2,
      questionType: "single",
      questionText: "Which EC2 type is cheapest?",
      options: { A: "On-Demand", B: "Reserved", C: "Spot", D: "Dedicated" },
      correctAnswer: "C",
      yourAnswer: ["A"],
      gaveUp: false,
      outcome: "incorrect",
      flagged: true,
      explanations: {
        A: { description: "On-Demand", reason: "More expensive than Spot" },
        B: { description: "Reserved", reason: "Cheaper than On-Demand but not cheapest" },
        C: { description: "Spot", reason: "Spot instances are cheapest" },
        D: { description: "Dedicated", reason: "Most expensive" },
      },
    },
    {
      id: 3,
      order: 3,
      questionType: "single",
      questionText: "What is S3?",
      options: { A: "Compute", B: "Database", C: "Storage", D: "Networking" },
      correctAnswer: "C",
      yourAnswer: [],
      gaveUp: false,
      outcome: "gave_up",
      flagged: false,
      explanations: {
        A: { description: "Compute", reason: "That is EC2" },
        B: { description: "Database", reason: "That is RDS" },
        C: { description: "Storage", reason: "S3 is Simple Storage Service" },
        D: { description: "Networking", reason: "That is VPC" },
      },
    },
    {
      id: 4,
      order: 4,
      questionType: "single",
      questionText: "What is VPC?",
      options: { A: "Virtual Private Cloud", B: "Virtual Public Cloud", C: "Virtual Protocol Controller", D: "Virtual Port Config" },
      correctAnswer: "A",
      yourAnswer: ["A"],
      gaveUp: false,
      outcome: "correct",
      flagged: false,
      explanations: {
        A: { description: "Right", reason: "VPC = Virtual Private Cloud" },
        B: { description: "Wrong", reason: "Public doesn't apply here" },
        C: { description: "Wrong", reason: "Made up" },
        D: { description: "Wrong", reason: "Made up" },
      },
    },
  ],
};

// ── Render helpers ────────────────────────────────────────────────────────────

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

// Lazy-import to avoid hoisting issues with vi.mock.
async function renderResultsScreen(
  sessionId = "sess-1",
  mode: "post-exam" | "from-history" = "post-exam",
) {
  const { ResultsScreen } = await import("./ResultsScreen");
  const { Wrapper } = createWrapper();
  return render(
    <Wrapper>
      <ResultsScreen sessionId={sessionId} mode={mode} />
    </Wrapper>,
  );
}

// ── Test suite ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: GET /results returns MOCK_RESULTS.
  mockGet.mockResolvedValue(MOCK_RESULTS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
// ResultsScreen — basic render
// ────────────────────────────────────────────────────────────────────────────
describe("<ResultsScreen>", () => {
  it("renders score summary after loading", async () => {
    await renderResultsScreen();

    // Wait for the spinner to disappear and the score to appear.
    expect(await screen.findByText(/50%/)).toBeTruthy();
    expect(screen.getByText("IAM & EC2 Easy Set 1")).toBeTruthy();
  });

  it("shows post-exam header in post-exam mode", async () => {
    await renderResultsScreen("sess-1", "post-exam");
    await screen.findByText(/50%/);
    expect(screen.getByText("Your Results")).toBeTruthy();
    // No "Back to history" in post-exam mode.
    expect(screen.queryByText("Back to history")).toBeNull();
  });

  it("shows from-history header and back button in from-history mode", async () => {
    await renderResultsScreen("sess-1", "from-history");
    await screen.findByText(/50%/);
    expect(screen.getByText("Review")).toBeTruthy();
    expect(screen.getByLabelText("Back to history")).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DetailFilterBar — client-side filtering
// ────────────────────────────────────────────────────────────────────────────
describe("<DetailFilterBar> — filtering", () => {
  it("shows All questions by default (4)", async () => {
    await renderResultsScreen();
    await screen.findByText(/50%/);

    // All 4 questions visible.
    expect(screen.getByText("What does IAM stand for?")).toBeTruthy();
    expect(screen.getByText("Which EC2 type is cheapest?")).toBeTruthy();
    expect(screen.getByText("What is S3?")).toBeTruthy();
    expect(screen.getByText("What is VPC?")).toBeTruthy();
  });

  it("Incorrect filter shows only the 1 incorrect question", async () => {
    await renderResultsScreen();
    await screen.findByText(/50%/);

    const incorrectTab = screen.getByRole("tab", { name: /incorrect/i });
    fireEvent.click(incorrectTab);

    expect(screen.getByText("Which EC2 type is cheapest?")).toBeTruthy();
    expect(screen.queryByText("What does IAM stand for?")).toBeNull();
    expect(screen.queryByText("What is VPC?")).toBeNull();
  });

  it("Correct filter shows only the 2 correct questions (q1 IAM, q4 VPC)", async () => {
    await renderResultsScreen();
    await screen.findByText(/50%/);

    const correctTab = screen.getByRole("tab", { name: /^correct/i });
    fireEvent.click(correctTab);

    expect(screen.getByText("What is VPC?")).toBeTruthy();
    expect(screen.getByText("What does IAM stand for?")).toBeTruthy();
    expect(screen.queryByText("Which EC2 type is cheapest?")).toBeNull();
    expect(screen.queryByText("What is S3?")).toBeNull();
  });

  it("Gave up filter shows the gave-up question (q3 was a blank-at-submit)", async () => {
    await renderResultsScreen();
    await screen.findByText(/50%/);

    const gaveUpTab = screen.getByRole("tab", { name: /gave up/i });
    fireEvent.click(gaveUpTab);

    expect(screen.getByText("What is S3?")).toBeTruthy();
    expect(screen.queryByText("What does IAM stand for?")).toBeNull();
    expect(screen.queryByText("What is VPC?")).toBeNull();
  });

  it("Flagged filter shows only the 1 flagged question", async () => {
    await renderResultsScreen();
    await screen.findByText(/50%/);

    const flaggedTab = screen.getByRole("tab", { name: /flagged/i });
    fireEvent.click(flaggedTab);

    // Only q2 is flagged.
    expect(screen.getByText("Which EC2 type is cheapest?")).toBeTruthy();
    expect(screen.queryByText("What does IAM stand for?")).toBeNull();
  });

  it("switching back to All restores all questions", async () => {
    await renderResultsScreen();
    await screen.findByText(/50%/);

    fireEvent.click(screen.getByRole("tab", { name: /incorrect/i }));
    fireEvent.click(screen.getByRole("tab", { name: /all/i }));

    expect(screen.getByText("What does IAM stand for?")).toBeTruthy();
    expect(screen.getByText("What is VPC?")).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BookmarkToggle — optimistic update + rollback
// ────────────────────────────────────────────────────────────────────────────
describe("<BookmarkToggle>", () => {
  it("calls PATCH review with isBookmarked: true on click", async () => {
    mockPatch.mockResolvedValueOnce({ id: "sess-1", isBookmarked: true, note: null });
    await renderResultsScreen();
    await screen.findByText(/50%/);

    const btn = screen.getByRole("button", { name: /bookmark this session/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "/sessions/sess-1/review",
      expect.objectContaining({ json: { isBookmarked: true } }),
    );
  });

  it("rolls back optimistic update on error", async () => {
    mockPatch.mockRejectedValueOnce(new Error("network error"));

    // Pre-seed the cache so rollback works.
    const { queryClient: qc, Wrapper: W } = createWrapper();
    const { ResultsScreen } = await import("./ResultsScreen");
    const { queryKeys } = await import("@/lib/queryKeys");

    qc.setQueryData(queryKeys.results("sess-1"), MOCK_RESULTS);

    render(
      <W>
        <ResultsScreen sessionId="sess-1" mode="post-exam" />
      </W>,
    );

    await screen.findByText(/50%/);

    const btn = screen.getByRole("button", { name: /bookmark this session/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    // After rollback the button label should remain "Bookmark" (not bookmarked).
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /bookmark this session/i })).toBeTruthy();
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// RetakeMenu — button states and navigation
// ────────────────────────────────────────────────────────────────────────────
describe("<RetakeMenu>", () => {
  it("Retake incorrect only is enabled when there are incorrect/gave-up questions", async () => {
    // MOCK_RESULTS has incorrect=1 (q2 wrong) and gaveUp=1 (q3 blank) so the
    // button is enabled.
    await renderResultsScreen();
    await screen.findByText(/50%/);

    const btn = screen.getByRole("button", { name: /retake only the incorrect/i });
    expect(btn).not.toBeDisabled();
  });

  it("Retake incorrect only is disabled when no incorrect/gave-up (score = 100%)", async () => {
    const allCorrect: Results = {
      ...MOCK_RESULTS,
      summary: {
        ...MOCK_RESULTS.summary,
        scorePercent: 100,
        correct: 4,
        incorrect: 0,
        gaveUp: 0,
      },
    };
    mockGet.mockResolvedValueOnce(allCorrect);
    await renderResultsScreen();
    await screen.findByText(/100%/);

    const btn = screen.getByRole("button", { name: /retake only the incorrect/i });
    expect(btn).toBeDisabled();
  });

  it("clicking Retake all calls POST retake with scope=all and navigates", async () => {
    const newSession = { id: "new-sess", status: "in_progress", questions: [] };
    mockPost.mockResolvedValueOnce(newSession);

    await renderResultsScreen();
    await screen.findByText(/50%/);

    const btn = screen.getByRole("button", { name: /retake all questions/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/sessions/sess-1/retake",
      expect.objectContaining({ json: { scope: "all" } }),
    );
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/exam/new-sess");
    });
  });

  it("clicking Retake incorrect only calls POST retake with scope=incorrect and navigates", async () => {
    const newSession = { id: "retake-sess", status: "in_progress", questions: [] };
    mockPost.mockResolvedValueOnce(newSession);

    await renderResultsScreen();
    await screen.findByText(/50%/);

    const btn = screen.getByRole("button", { name: /retake only the incorrect/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/sessions/sess-1/retake",
      expect.objectContaining({ json: { scope: "incorrect" } }),
    );
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/exam/retake-sess");
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// NoteEditor — save behaviour
// ────────────────────────────────────────────────────────────────────────────
describe("<NoteEditor>", () => {
  it("calls PATCH review after the debounce delay elapses", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPatch.mockResolvedValue({ id: "sess-1", isBookmarked: false, note: "study note" });

    await act(async () => {
      await renderResultsScreen();
    });
    await screen.findByText(/50%/);

    const textarea = screen.getByRole("textbox", { name: /note/i });
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "study note" } });
    });

    // Advance past the 600ms debounce.
    await act(async () => {
      vi.advanceTimersByTime(700);
      // Flush pending microtasks (promise resolution).
      await Promise.resolve();
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "/sessions/sess-1/review",
      expect.objectContaining({ json: { note: "study note" } }),
    );

    vi.useRealTimers();
  }, 10_000);
});
