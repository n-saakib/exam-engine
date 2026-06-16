/**
 * <SourceSettings> tests.
 *
 * Cases:
 *   1. Switching `source_mode` from "filesystem" to "upload" invalidates
 *      the `["uploadedSets"]` query.
 *
 * NOTE: the production component currently does NOT invalidate the query
 * when switching modes (it only fires the settings PATCH and a toast).
 * The test will fail until the component is updated to invalidate the
 * query on mode change.
 */

import { render, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";
import type { Settings } from "@/domain/types";

const mockPatch = vi.fn();
const mockGet = vi.fn();

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
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

import { SourceSettings } from "./SourceSettings";

const BASE_SETTINGS: Settings = {
  exams_root: "/home/user/Exams",
  source_mode: "filesystem",
  timer_enabled: true,
  timer_default_minutes: 20,
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
  mockGet.mockResolvedValue({ items: [], total: 0 });
  mockPatch.mockResolvedValue({ ...BASE_SETTINGS, source_mode: "upload" });
});

describe("<SourceSettings>", () => {
  it("invalidates the uploadedSets query when source_mode is switched to 'upload'", async () => {
    const { qc, Wrapper } = makeWrapper();
    qc.setQueryData(["settings"], BASE_SETTINGS);

    // Pre-seed the uploadedSets query so we can spy on its invalidation.
    qc.setQueryData(["uploadedSets"], { items: [], total: 0 });

    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    render(
      <Wrapper>
        <SourceSettings />
      </Wrapper>,
    );

    // Click the "Upload" radio to switch the mode. The input is visually
    // hidden (sr-only), so we look it up by its `value` attribute.
    const uploadRadio = document.querySelector(
      "input[name='source_mode'][value='upload']",
    ) as HTMLInputElement;
    expect(uploadRadio).toBeTruthy();
    await act(async () => {
      fireEvent.click(uploadRadio);
    });

    // PATCH should fire with source_mode: "upload".
    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        "/settings",
        expect.objectContaining({
          json: expect.objectContaining({ source_mode: "upload" }),
        }),
      );
    });

    // The uploadedSets query should have been invalidated.
    const invalidated = invalidateSpy.mock.calls.some((call) => {
      const opts = call[0] as { queryKey?: readonly unknown[] } | undefined;
      const key = opts?.queryKey;
      return Array.isArray(key) && key[0] === "uploadedSets";
    });
    expect(invalidated).toBe(true);
  });
});
