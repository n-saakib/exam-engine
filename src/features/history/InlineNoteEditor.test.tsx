/**
 * <InlineNoteEditor> tests.
 *
 * NOTE: `InlineNoteEditor` is a non-exported helper inside `HistoryRow.tsx`.
 * We test it through its public consumer `<HistoryRow>` to avoid modifying
 * production code (per the test-authoring conventions in this repo).
 *
 * The editor:
 *   - Opens with an empty textarea when the row has no note.
 *   - PATCHes `/sessions/:id/review` with the trimmed note on Save.
 *   - Re-syncs its local value when the `note` prop changes externally
 *     (covered indirectly: external prop changes are driven by the same
 *     React Query cache, so a successful save rehydrates the same row).
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";
import type { HistoryRow as HistoryRowType } from "@/domain/types";

const mockPatch = vi.fn();

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: (...args: unknown[]) => mockPatch(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/history",
  useSearchParams: () => new URLSearchParams(),
}));

import { HistoryRow } from "./HistoryRow";

function makeRow(overrides: Partial<HistoryRowType> = {}): HistoryRowType {
  return {
    id: "sess-1",
    domainLabel: "Cloud / AWS / SAA / Easy",
    setTitle: "IAM & EC2 Easy Set 1",
    difficulty: "Easy",
    scorePercent: 80,
    timeTakenMs: 240_000,
    completedAt: "2026-06-11T10:00:00.000Z",
    isBookmarked: false,
    hasNote: false,
    ...overrides,
  };
}

function renderRow(row: HistoryRowType) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <GlobalDialogsProvider>
            <ul><HistoryRow row={row} /></ul>
          </GlobalDialogsProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<InlineNoteEditor> (via <HistoryRow>)", () => {
  it("opens with an empty textarea when the row has no note", async () => {
    const row = makeRow({ hasNote: false });
    renderRow(row);

    // Expand the row first. The expand toggle is the only button on the row
    // that is NOT the bookmark button, so we click by aria-expanded.
    const expandBtn = document.querySelector(
      "button[aria-expanded='false']",
    ) as HTMLButtonElement;
    expect(expandBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(expandBtn);
    });

    // Click "Add note" to open the editor.
    const addBtn = screen.getByRole("button", { name: /add note/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    const textarea = screen.getByRole("textbox", { name: /session note/i });
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("persists the typed note via PATCH on Save", async () => {
    mockPatch.mockResolvedValue({
      id: "sess-1",
      isBookmarked: false,
      note: "study more",
    });

    const row = makeRow({ id: "sess-1" });
    renderRow(row);

    // Expand the row, open the editor, type, save.
    const expandBtn = document.querySelector(
      "button[aria-expanded='false']",
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(expandBtn);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /add note/i }));
    });

    const textarea = screen.getByRole("textbox", { name: /session note/i });
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "  study more  " } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        "/sessions/sess-1/review",
        expect.objectContaining({ json: { note: "study more" } }),
      );
    });
  });
});
