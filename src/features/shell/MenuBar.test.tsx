import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MenuBar } from "./MenuBar";

// ─── Mock next/navigation ────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

// ─── Mock the in-progress count hook ─────────────────────────────────────────
vi.mock("@/hooks/useInProgressCount", () => ({
  useInProgressCount: vi.fn(() => 0),
}));

import { usePathname } from "next/navigation";
import { useInProgressCount } from "@/hooks/useInProgressCount";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("MenuBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (usePathname as Mock).mockReturnValue("/");
    (useInProgressCount as Mock).mockReturnValue(0);
  });

  it("renders all four navigation destinations", () => {
    render(<MenuBar />, { wrapper });

    // Use exact text match to avoid the brand "CertPrep home" link colliding.
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("marks the Home link active (aria-current=page) when pathname is /", () => {
    (usePathname as Mock).mockReturnValue("/");
    render(<MenuBar />, { wrapper });

    // Use exact text match to get the "Home" nav link specifically.
    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink).toHaveAttribute("aria-current", "page");
  });

  it("marks the Resume link active when pathname is /resume", () => {
    (usePathname as Mock).mockReturnValue("/resume");
    render(<MenuBar />, { wrapper });

    const resumeLink = screen.getByRole("link", { name: /resume/i });
    expect(resumeLink).toHaveAttribute("aria-current", "page");
  });

  it("does not show the Resume badge when inProgressCount is 0", () => {
    (useInProgressCount as Mock).mockReturnValue(0);
    render(<MenuBar />, { wrapper });

    // Badge exists via aria-label on the span; with 0 count it should not render.
    expect(
      screen.queryByLabelText(/in-progress exam/i),
    ).not.toBeInTheDocument();
  });

  it("shows the Resume badge with correct count when inProgressCount > 0", () => {
    (useInProgressCount as Mock).mockReturnValue(3);
    render(<MenuBar />, { wrapper });

    const badge = screen.getByLabelText(/3 in-progress exam/i);
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe("3");
  });

  it("caps the badge at 99+ for large counts", () => {
    (useInProgressCount as Mock).mockReturnValue(150);
    render(<MenuBar />, { wrapper });

    const badge = screen.getByLabelText(/150 in-progress exam/i);
    expect(badge.textContent).toBe("99+");
  });

  it("renders inside a <nav> with aria-label", () => {
    render(<MenuBar />, { wrapper });
    expect(
      screen.getByRole("navigation", { name: /main navigation/i }),
    ).toBeInTheDocument();
  });
});
