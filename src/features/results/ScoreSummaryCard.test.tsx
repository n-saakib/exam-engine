/**
 * Component tests for ScoreSummaryCard.
 *
 * These tests guard:
 *   - The header (setTitle, domainLabel, difficulty pill) renders.
 *   - The score percentage colour-codes by threshold (>=80 / >=50 / <50).
 *   - The score span has the right aria-label.
 *   - The four-way breakdown renders the 4 values with the right colours.
 *   - The "X of Y correct" subtext renders.
 *   - The time-taken formatter (`formatMs`) for the documented cases.
 *   - The "of <n> limit" suffix only appears when `timerLimitMs` is non-null.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Results } from "@/domain/types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock apiClient so the component's transitive imports don't blow up in
// isolation (matches QuestionReviewCard.test.tsx pattern).
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

async function renderCard(results: Results) {
  const { ScoreSummaryCard } = await import("./ScoreSummaryCard");
  return render(<ScoreSummaryCard results={results} />);
}

// ── Fixtures / factories ──────────────────────────────────────────────────────

/**
 * Minimal `Results` factory — only the fields the component actually reads
 * (everything else is filled in with empty/safe defaults so the test reads
 * top-to-bottom).
 */
function makeResults(overrides: Partial<Results> = {}): Results {
  const base: Results = {
    id: "session-1",
    status: "completed",
    domainLabel: "AWS Solutions Architect",
    setTitle: "SAA-C03 Practice Set 1",
    difficulty: "Medium",
    mode: "full",
    summary: {
      scorePercent: 80,
      correct: 8,
      incorrect: 1,
      revealed: 0,
      unanswered: 1,
      total: 10,
      timeTakenMs: 0,
      timerLimitMs: null,
    },
    isBookmarked: false,
    note: null,
    completedAt: "2026-06-16T00:00:00.000Z",
    questions: [],
  };

  // Allow per-field overrides via dot-path-ish shorthand for `summary` is
  // intentionally NOT done to keep the test self-documenting; callers pass a
  // full `summary` if they want to override it.
  return {
    ...base,
    ...overrides,
    summary: { ...base.summary, ...(overrides.summary ?? {}) },
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("<ScoreSummaryCard>", () => {
  // ── Header ─────────────────────────────────────────────────────────────────
  it("renders the setTitle, domainLabel, and difficulty pill", async () => {
    await renderCard(
      makeResults({
        setTitle: "Cloud Practitioner Fundamentals",
        domainLabel: "AWS Cloud Practitioner",
        difficulty: "Easy",
      }),
    );

    const section = screen.getByLabelText("Score summary");
    expect(section).toBeTruthy();

    // setTitle is the H2 inside the header
    expect(within(section).getByRole("heading", { name: "Cloud Practitioner Fundamentals" })).toBeTruthy();
    // domainLabel is the muted subhead
    expect(within(section).getByText("AWS Cloud Practitioner")).toBeTruthy();
    // difficulty is rendered as a pill
    expect(within(section).getByText("Easy")).toBeTruthy();
  });

  // ── Score percentage colour-coding ─────────────────────────────────────────
  describe("score percentage colour-coding", () => {
    const cases: Array<{ scorePercent: number; expectedClass: string; notExpectedClass?: string }> = [
      { scorePercent: 100, expectedClass: "text-correct" },
      { scorePercent: 80, expectedClass: "text-correct" },
      { scorePercent: 75, expectedClass: "text-warning", notExpectedClass: "text-correct" },
      { scorePercent: 50, expectedClass: "text-warning", notExpectedClass: "text-correct" },
      { scorePercent: 25, expectedClass: "text-incorrect" },
      { scorePercent: 0, expectedClass: "text-incorrect" },
    ];

    for (const { scorePercent, expectedClass, notExpectedClass } of cases) {
      it(`scorePercent=${scorePercent} → has class "${expectedClass}"`, async () => {
        await renderCard(
          makeResults({
            summary: {
              scorePercent,
              correct: 0,
              incorrect: 0,
              revealed: 0,
              unanswered: 0,
              total: 10,
              timeTakenMs: 0,
              timerLimitMs: null,
            },
          }),
        );

        const scoreSpan = screen.getByLabelText(`Score: ${scorePercent} percent`);
        expect(scoreSpan).toBeTruthy();
        expect(scoreSpan.className).toContain(expectedClass);

        if (notExpectedClass) {
          expect(scoreSpan.className).not.toContain(notExpectedClass);
        }
      });
    }
  });

  // ── Score span aria-label ──────────────────────────────────────────────────
  it("renders the score span with aria-label='Score: <n> percent'", async () => {
    await renderCard(makeResults({ summary: { ...makeResults().summary, scorePercent: 67 } }));
    const scoreSpan = screen.getByLabelText("Score: 67 percent");
    expect(scoreSpan).toBeTruthy();
    expect(scoreSpan.textContent).toBe("67%");
  });

  // ── "X of Y correct" subtext ──────────────────────────────────────────────
  it("renders the 'X of Y correct' subtext", async () => {
    await renderCard(
      makeResults({
        summary: {
          scorePercent: 75,
          correct: 6,
          incorrect: 1,
          revealed: 0,
          unanswered: 1,
          total: 8,
          timeTakenMs: 0,
          timerLimitMs: null,
        },
      }),
    );

    const section = screen.getByLabelText("Score summary");
    expect(within(section).getByText("6 of 8 correct")).toBeTruthy();
  });

  // ── Four-way breakdown ─────────────────────────────────────────────────────
  it("renders the four-way breakdown with the right values and colours", async () => {
    await renderCard(
      makeResults({
        summary: {
          scorePercent: 60,
          correct: 6,
          incorrect: 2,
          revealed: 1,
          unanswered: 1,
          total: 10,
          timeTakenMs: 0,
          timerLimitMs: null,
        },
      }),
    );

    const list = screen.getByLabelText("Question breakdown");
    expect(list).toBeTruthy();
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);

    // Labels (in order: Correct / Incorrect / Revealed / Skipped).
    expect(within(items[0]).getByText("Correct")).toBeTruthy();
    expect(within(items[1]).getByText("Incorrect")).toBeTruthy();
    expect(within(items[2]).getByText("Revealed")).toBeTruthy();
    expect(within(items[3]).getByText("Skipped")).toBeTruthy();

    // Values
    expect(within(items[0]).getByText("6")).toBeTruthy();
    expect(within(items[1]).getByText("2")).toBeTruthy();
    expect(within(items[2]).getByText("1")).toBeTruthy();
    expect(within(items[3]).getByText("1")).toBeTruthy();

    // Colours
    const correctValueSpan = within(items[0]).getByText("6");
    const incorrectValueSpan = within(items[1]).getByText("2");
    const revealedValueSpan = within(items[2]).getByText("1");
    const skippedValueSpan = within(items[3]).getByText("1");

    expect(correctValueSpan.className).toContain("text-correct");
    expect(incorrectValueSpan.className).toContain("text-incorrect");
    expect(revealedValueSpan.className).toContain("text-revealed");
    expect(skippedValueSpan.className).toContain("text-muted");
  });

  // ── Time taken formatting ──────────────────────────────────────────────────
  describe("time taken formatting", () => {
    const cases: Array<{ timeTakenMs: number; expected: string }> = [
      { timeTakenMs: 65_000, expected: "1m 5s" },
      { timeTakenMs: 3_600_000, expected: "1h 0m 0s" },
      { timeTakenMs: 30_000, expected: "30s" },
      { timeTakenMs: 0, expected: "0s" },
    ];

    for (const { timeTakenMs, expected } of cases) {
      it(`formatMs(${timeTakenMs}) → "${expected}"`, async () => {
        await renderCard(
          makeResults({
            summary: {
              scorePercent: 0,
              correct: 0,
              incorrect: 0,
              revealed: 0,
              unanswered: 0,
              total: 0,
              timeTakenMs,
              timerLimitMs: null,
            },
          }),
        );

        const section = screen.getByLabelText("Score summary");
        // The strong inside the "Time taken:" line holds the formatted string.
        const strong = within(section).getByText(expected);
        expect(strong).toBeTruthy();
        expect(strong.tagName.toLowerCase()).toBe("strong");
        // Also make sure the "Time taken:" label is present.
        expect(within(section).getByText(/Time taken:/)).toBeTruthy();
      });
    }
  });

  // ── Timer limit suffix ─────────────────────────────────────────────────────
  describe("timer limit suffix", () => {
    it("does not render the 'of <n> limit' text when timerLimitMs is null", async () => {
      await renderCard(
        makeResults({
          summary: {
            scorePercent: 50,
            correct: 5,
            incorrect: 5,
            revealed: 0,
            unanswered: 0,
            total: 10,
            timeTakenMs: 60_000,
            timerLimitMs: null,
          },
        }),
      );

      const section = screen.getByLabelText("Score summary");
      // The formatted time should be visible (1m 0s) but no "of ... limit".
      expect(within(section).getByText("1m 0s")).toBeTruthy();
      expect(within(section).queryByText(/limit/)).toBeNull();
    });

    it("does not render the 'of <n> limit' text when timerLimitMs is undefined", async () => {
      await renderCard(
        makeResults({
          summary: {
            scorePercent: 50,
            correct: 5,
            incorrect: 5,
            revealed: 0,
            unanswered: 0,
            total: 10,
            timeTakenMs: 60_000,
            // Cast: the schema says nullable; undefined is treated identically
            // by the component's `!= null` guard.
            timerLimitMs: undefined as unknown as null,
          },
        }),
      );

      const section = screen.getByLabelText("Score summary");
      expect(within(section).getByText("1m 0s")).toBeTruthy();
      expect(within(section).queryByText(/limit/)).toBeNull();
    });

    it("renders 'of 10m 0s limit' when timerLimitMs is 600_000", async () => {
      await renderCard(
        makeResults({
          summary: {
            scorePercent: 50,
            correct: 5,
            incorrect: 5,
            revealed: 0,
            unanswered: 0,
            total: 10,
            timeTakenMs: 60_000,
            timerLimitMs: 600_000,
          },
        }),
      );

      const section = screen.getByLabelText("Score summary");
      // The component builds a single <span> with
      //   "Time taken: 1m 0s of 10m 0s limit"
      // (time taken is wrapped in <strong>, the limit text is plain).
      const timeLine = within(section).getByText(/Time taken:/);
      expect(timeLine).toBeTruthy();
      expect(timeLine.textContent).toContain("1m 0s");
      expect(timeLine.textContent).toContain("of 10m 0s limit");
      // The "1m 0s" portion is rendered as <strong>.
      const strong = within(timeLine).getByText("1m 0s");
      expect(strong.tagName.toLowerCase()).toBe("strong");
    });
  });
});
