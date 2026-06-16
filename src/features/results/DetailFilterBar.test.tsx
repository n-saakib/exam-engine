/**
 * Component tests for DetailFilterBar.
 *
 * The DetailFilterBar renders 4 tabs (All / Incorrect / Revealed / Flagged)
 * inside a tablist. Each tab exposes an `aria-selected` flag, a label, and a
 * count badge with a descriptive `aria-label`. The active tab is styled
 * differently from the inactive ones.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ReviewFilter } from "./DetailFilterBar";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock apiClient to keep the component's transitive imports happy in
// isolation (mirrors the pattern used in QuestionReviewCard.test.tsx).
vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

// ── Render helper ─────────────────────────────────────────────────────────────

async function renderBar(
  activeFilter: ReviewFilter,
  onFilterChange: ReturnType<typeof vi.fn>,
  counts: { all: number; incorrect: number; gaveUp: number; revealed: number; flagged: number },
) {
  const { DetailFilterBar } = await import("./DetailFilterBar");
  return render(
    <DetailFilterBar
      activeFilter={activeFilter}
      onFilterChange={onFilterChange}
      counts={counts}
    />,
  );
}

const DEFAULT_COUNTS = {
  all: 12,
  incorrect: 3,
  gaveUp: 1,
  revealed: 4,
  flagged: 2,
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe("<DetailFilterBar>", () => {
  // ── 1. Renders exactly 5 tabs in the correct order ────────────────────────
  it("renders exactly 5 tabs with labels 'All', 'Incorrect', 'Gave up', 'Revealed', 'Flagged' in that order", async () => {
    await renderBar("all", vi.fn(), DEFAULT_COUNTS);

    const tablist = screen.getByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(5);

    expect(tabs[0].textContent).toContain("All");
    expect(tabs[1].textContent).toContain("Incorrect");
    expect(tabs[2].textContent).toContain("Gave up");
    expect(tabs[3].textContent).toContain("Revealed");
    expect(tabs[4].textContent).toContain("Flagged");
  });

  // ── 2. aria-selected reflects the active filter ───────────────────────────
  it("marks only the active tab with aria-selected='true' when activeFilter='all'", async () => {
    await renderBar("all", vi.fn(), DEFAULT_COUNTS);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true"); // All
    expect(tabs[1].getAttribute("aria-selected")).toBe("false"); // Incorrect
    expect(tabs[2].getAttribute("aria-selected")).toBe("false"); // Gave up
    expect(tabs[3].getAttribute("aria-selected")).toBe("false"); // Revealed
    expect(tabs[4].getAttribute("aria-selected")).toBe("false"); // Flagged
  });

  it("marks only the active tab with aria-selected='true' when activeFilter='incorrect'", async () => {
    await renderBar("incorrect", vi.fn(), DEFAULT_COUNTS);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("false"); // All
    expect(tabs[1].getAttribute("aria-selected")).toBe("true"); // Incorrect
    expect(tabs[2].getAttribute("aria-selected")).toBe("false"); // Gave up
    expect(tabs[3].getAttribute("aria-selected")).toBe("false"); // Revealed
    expect(tabs[4].getAttribute("aria-selected")).toBe("false"); // Flagged
  });

  it("marks only the active tab with aria-selected='true' when activeFilter='gave_up'", async () => {
    await renderBar("gave_up", vi.fn(), DEFAULT_COUNTS);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("false"); // All
    expect(tabs[1].getAttribute("aria-selected")).toBe("false"); // Incorrect
    expect(tabs[2].getAttribute("aria-selected")).toBe("true"); // Gave up
    expect(tabs[3].getAttribute("aria-selected")).toBe("false"); // Revealed
    expect(tabs[4].getAttribute("aria-selected")).toBe("false"); // Flagged
  });

  it("marks only the active tab with aria-selected='true' when activeFilter='revealed'", async () => {
    await renderBar("revealed", vi.fn(), DEFAULT_COUNTS);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("false"); // All
    expect(tabs[1].getAttribute("aria-selected")).toBe("false"); // Incorrect
    expect(tabs[2].getAttribute("aria-selected")).toBe("false"); // Gave up
    expect(tabs[3].getAttribute("aria-selected")).toBe("true"); // Revealed
    expect(tabs[4].getAttribute("aria-selected")).toBe("false"); // Flagged
  });

  it("marks only the active tab with aria-selected='true' when activeFilter='flagged'", async () => {
    await renderBar("flagged", vi.fn(), DEFAULT_COUNTS);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("false"); // All
    expect(tabs[1].getAttribute("aria-selected")).toBe("false"); // Incorrect
    expect(tabs[2].getAttribute("aria-selected")).toBe("false"); // Gave up
    expect(tabs[3].getAttribute("aria-selected")).toBe("false"); // Revealed
    expect(tabs[4].getAttribute("aria-selected")).toBe("true"); // Flagged
  });

  // ── 3. Count badges ───────────────────────────────────────────────────────
  it("renders the correct count value in each tab's badge with the right aria-label", async () => {
    const counts = {
      all: 25,
      incorrect: 7,
      gaveUp: 2,
      revealed: 1,
      flagged: 0,
    };
    await renderBar("all", vi.fn(), counts);

    const allBadge = screen.getByLabelText("25 questions");
    expect(allBadge).toBeTruthy();
    expect(allBadge.textContent).toBe("25");

    const incorrectBadge = screen.getByLabelText("7 questions");
    expect(incorrectBadge).toBeTruthy();
    expect(incorrectBadge.textContent).toBe("7");

    const gaveUpBadge = screen.getByLabelText("2 questions");
    expect(gaveUpBadge).toBeTruthy();
    expect(gaveUpBadge.textContent).toBe("2");

    const revealedBadge = screen.getByLabelText("1 questions");
    expect(revealedBadge).toBeTruthy();
    expect(revealedBadge.textContent).toBe("1");

    const flaggedBadge = screen.getByLabelText("0 questions");
    expect(flaggedBadge).toBeTruthy();
    expect(flaggedBadge.textContent).toBe("0");
  });

  it("renders count badges inside their corresponding tab", async () => {
    await renderBar("all", vi.fn(), DEFAULT_COUNTS);

    const allTab = screen.getByRole("tab", { name: /All/i });
    const allBadge = within(allTab).getByLabelText(`${DEFAULT_COUNTS.all} questions`);
    expect(allBadge.textContent).toBe(String(DEFAULT_COUNTS.all));

    const incorrectTab = screen.getByRole("tab", { name: /Incorrect/i });
    const incorrectBadge = within(incorrectTab).getByLabelText(
      `${DEFAULT_COUNTS.incorrect} questions`,
    );
    expect(incorrectBadge.textContent).toBe(String(DEFAULT_COUNTS.incorrect));

    const gaveUpTab = screen.getByRole("tab", { name: /Gave up/i });
    const gaveUpBadge = within(gaveUpTab).getByLabelText(
      `${DEFAULT_COUNTS.gaveUp} questions`,
    );
    expect(gaveUpBadge.textContent).toBe(String(DEFAULT_COUNTS.gaveUp));

    const revealedTab = screen.getByRole("tab", { name: /Revealed/i });
    const revealedBadge = within(revealedTab).getByLabelText(
      `${DEFAULT_COUNTS.revealed} questions`,
    );
    expect(revealedBadge.textContent).toBe(String(DEFAULT_COUNTS.revealed));

    const flaggedTab = screen.getByRole("tab", { name: /Flagged/i });
    const flaggedBadge = within(flaggedTab).getByLabelText(
      `${DEFAULT_COUNTS.flagged} questions`,
    );
    expect(flaggedBadge.textContent).toBe(String(DEFAULT_COUNTS.flagged));
  });

  // ── 4. Clicking a tab calls onFilterChange with the right key ─────────────
  it("calls onFilterChange with 'all' when the All tab is clicked", async () => {
    const onFilterChange = vi.fn();
    await renderBar("incorrect", onFilterChange, DEFAULT_COUNTS);

    fireEvent.click(screen.getByRole("tab", { name: /All/i }));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith("all");
  });

  it("calls onFilterChange with 'incorrect' when the Incorrect tab is clicked", async () => {
    const onFilterChange = vi.fn();
    await renderBar("all", onFilterChange, DEFAULT_COUNTS);

    fireEvent.click(screen.getByRole("tab", { name: /Incorrect/i }));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith("incorrect");
  });

  it("calls onFilterChange with 'gave_up' when the Gave up tab is clicked", async () => {
    const onFilterChange = vi.fn();
    await renderBar("all", onFilterChange, DEFAULT_COUNTS);

    fireEvent.click(screen.getByRole("tab", { name: /Gave up/i }));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith("gave_up");
  });

  it("calls onFilterChange with 'revealed' when the Revealed tab is clicked", async () => {
    const onFilterChange = vi.fn();
    await renderBar("all", onFilterChange, DEFAULT_COUNTS);

    fireEvent.click(screen.getByRole("tab", { name: /Revealed/i }));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith("revealed");
  });

  it("calls onFilterChange with 'flagged' when the Flagged tab is clicked", async () => {
    const onFilterChange = vi.fn();
    await renderBar("all", onFilterChange, DEFAULT_COUNTS);

    fireEvent.click(screen.getByRole("tab", { name: /Flagged/i }));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith("flagged");
  });

  it("calls onFilterChange even when the active tab is clicked", async () => {
    const onFilterChange = vi.fn();
    await renderBar("revealed", onFilterChange, DEFAULT_COUNTS);

    fireEvent.click(screen.getByRole("tab", { name: /Revealed/i }));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith("revealed");
  });

  // ── 5. Tablist wrapper aria-label ─────────────────────────────────────────
  it("renders the tablist wrapper with aria-label='Filter questions by outcome'", async () => {
    await renderBar("all", vi.fn(), DEFAULT_COUNTS);

    const tablist = screen.getByLabelText("Filter questions by outcome");
    expect(tablist).toBeTruthy();
    expect(tablist.getAttribute("role")).toBe("tablist");
  });

  // ── 6. Active vs inactive styling ─────────────────────────────────────────
  it("applies bg-brand to the active tab and bg-surface to inactive tabs", async () => {
    await renderBar("revealed", vi.fn(), DEFAULT_COUNTS);

    const tabs = screen.getAllByRole("tab");

    // Active = revealed (index 3).
    expect(tabs[3].className).toContain("bg-brand");
    expect(tabs[3].className).not.toContain("bg-surface");

    // Inactive tabs.
    for (const idx of [0, 1, 2, 4]) {
      expect(tabs[idx].className, `tab index ${idx} should be inactive`).toContain(
        "bg-surface",
      );
      expect(tabs[idx].className, `tab index ${idx} should not be active`).not.toContain(
        "bg-brand",
      );
    }
  });

  it("applies bg-brand to whichever tab is currently active (per filter value)", async () => {
    const filters: ReviewFilter[] = ["all", "incorrect", "gave_up", "revealed", "flagged"];

    for (const active of filters) {
      const { unmount } = await renderBar(active, vi.fn(), DEFAULT_COUNTS);
      const tabs = screen.getAllByRole("tab");
      const activeIndex = filters.indexOf(active);

      // Exactly one tab should carry the bg-brand class.
      const brandCount = tabs.filter((t) => t.className.includes("bg-brand")).length;
      expect(brandCount, `for active=${active}`).toBe(1);

      // And it must be the right one.
      expect(tabs[activeIndex].className).toContain("bg-brand");

      // Every other tab should carry bg-surface.
      for (let i = 0; i < tabs.length; i++) {
        if (i === activeIndex) continue;
        expect(tabs[i].className).toContain("bg-surface");
      }

      unmount();
    }
  });
});
