/**
 * <RetakeMenu> tests (exported from ResultsActions.tsx; spec calls it
 * "RetakeActions"). The component exposes two buttons:
 *   - "Retake incorrect only" → POST /sessions/:id/retake { scope: "incorrect" }
 *   - "Retake all questions"  → POST /sessions/:id/retake { scope: "all" }
 *
 * The router is mocked so we can also assert navigation, but the spec
 * requires only that onRetake fires with the correct scope.
 */

import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";

const mockPost = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/results/sess-1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

import { RetakeMenu } from "./ResultsActions";

function renderMenu(hasIncorrectOrRevealed = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <GlobalDialogsProvider>
          <RetakeMenu sessionId="sess-1" hasIncorrectOrRevealed={hasIncorrectOrRevealed} />
        </GlobalDialogsProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPost.mockResolvedValue({ id: "new-session-id", status: "in_progress", questions: [] });
});

describe("<RetakeMenu> (alias: RetakeActions)", () => {
  it("calls POST /sessions/:id/retake with scope=incorrect when 'Retake incorrect only' is clicked", async () => {
    renderMenu(true);

    const btn = screen.getByRole("button", { name: /retake only the incorrect/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/sessions/sess-1/retake",
        expect.objectContaining({ json: { scope: "incorrect" } }),
      );
    });
  });

  it("calls POST /sessions/:id/retake with scope=all when 'Retake all questions' is clicked", async () => {
    renderMenu(true);

    const btn = screen.getByRole("button", { name: /retake all questions/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/sessions/sess-1/retake",
        expect.objectContaining({ json: { scope: "all" } }),
      );
    });
  });
});
