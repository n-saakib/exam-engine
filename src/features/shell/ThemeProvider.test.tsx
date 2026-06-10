import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ThemeProvider } from "./ThemeProvider";

// ─── Mock useSettings so the ThemeProvider doesn't hit the real API ───────────
vi.mock("@/hooks/useSettings", () => ({
  useSettings: vi.fn(),
  useUpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import { useSettings } from "@/hooks/useSettings";
import type { Settings } from "@/domain/types";

const BASE_SETTINGS: Settings = {
  exams_root: "./Exams",
  source_mode: "filesystem",
  timer_enabled: true,
  timer_default_minutes: null,
  show_count_before_start: true,
  shuffle_questions: false,
  shuffle_options: false,
  progressive_reveal: true,
  theme: "light",
  last_selected_path: [],
  schema_version_seen: 0,
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset data-theme before each test.
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  it("sets data-theme=light on <html> when theme is 'light'", async () => {
    (useSettings as Mock).mockReturnValue({
      data: { ...BASE_SETTINGS, theme: "light" },
    });

    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  it("sets data-theme=dark on <html> when theme is 'dark'", async () => {
    (useSettings as Mock).mockReturnValue({
      data: { ...BASE_SETTINGS, theme: "dark" },
    });

    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  it("mirrors the theme to localStorage when settings load", async () => {
    (useSettings as Mock).mockReturnValue({
      data: { ...BASE_SETTINGS, theme: "dark" },
    });

    render(
      <ThemeProvider>
        <div data-testid="child">content</div>
      </ThemeProvider>,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(localStorage.getItem("theme")).toBe("dark");
    });
  });

  it("resolves 'system' to the OS preference (mocked as light in setup)", async () => {
    // The setup.client.ts stub returns matches=false, so system → light.
    (useSettings as Mock).mockReturnValue({
      data: { ...BASE_SETTINGS, theme: "system" },
    });

    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  it("renders children", () => {
    (useSettings as Mock).mockReturnValue({
      data: { ...BASE_SETTINGS, theme: "light" },
    });

    render(
      <ThemeProvider>
        <div data-testid="child">hello</div>
      </ThemeProvider>,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
