/**
 * <ExamDefaultsSettings> tests.
 *
 * Cases:
 *   1. Enabling the timer when `timer_default_minutes` is `null` should
 *      seed a sensible numeric default (e.g. 60), not an empty string.
 *   2. Saving persists via PATCH /settings.
 *
 * NOTE: case (1) documents a desired behaviour — the production component
 * currently falls back to "" when the persisted minutes value is null.
 * The test will fail until the component is updated to seed a default.
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";
import type { Settings } from "@/domain/types";

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
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));

import { ExamDefaultsSettings } from "./ExamDefaultsSettings";

const BASE_SETTINGS: Settings = {
  exams_root: "/home/user/Exams",
  source_mode: "filesystem",
  timer_enabled: false,
  timer_default_minutes: null,
  show_count_before_start: true,
  shuffle_questions: false,
  shuffle_options: false,
  progressive_reveal: true,
  theme: "system",
  last_selected_path: [],
  schema_version_seen: 0,
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    qc,
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <GlobalDialogsProvider>{children}</GlobalDialogsProvider>
        </ToastProvider>
      </QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPatch.mockResolvedValue({ ...BASE_SETTINGS, timer_enabled: true });
});

describe("<ExamDefaultsSettings>", () => {
  it("seeds a sensible default minutes value when enabling timer from null", async () => {
    const { qc, Wrapper } = makeWrapper();
    // Settings: timer is OFF, default minutes is null.
    qc.setQueryData(["settings"], BASE_SETTINGS);

    render(
      <Wrapper>
        <ExamDefaultsSettings />
      </Wrapper>,
    );

    // No minutes field while timer is off.
    expect(screen.queryByLabelText(/default minutes/i)).not.toBeInTheDocument();

    // Toggle "Enable timer by default" ON.
    const timerToggle = screen.getByRole("switch", { name: /enable timer/i });
    await act(async () => {
      fireEvent.click(timerToggle);
    });

    // PATCH flips timer_enabled to true.
    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        "/settings",
        expect.objectContaining({
          json: expect.objectContaining({ timer_enabled: true }),
        }),
      );
    });

    // The minutes input should now exist with a non-empty numeric default.
    const minutesInput = screen.getByLabelText(/default minutes/i) as HTMLInputElement;
    expect(minutesInput).toBeInTheDocument();
    // The desired behaviour: a positive numeric default, not "".
    expect(minutesInput.value).not.toBe("");
    const n = Number(minutesInput.value);
    expect(Number.isFinite(n) && n > 0).toBe(true);
  });

  it("persists a change via PATCH /settings when a toggle is clicked", async () => {
    const { qc, Wrapper } = makeWrapper();
    qc.setQueryData(["settings"], BASE_SETTINGS);

    render(
      <Wrapper>
        <ExamDefaultsSettings />
      </Wrapper>,
    );

    const toggle = screen.getByRole("switch", { name: /progressive reveal/i });
    await act(async () => {
      fireEvent.click(toggle);
    });

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        "/settings",
        expect.objectContaining({
          json: expect.objectContaining({ progressive_reveal: false }),
        }),
      );
    });
  });
});
