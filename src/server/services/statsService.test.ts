/**
 * Unit tests for StatsService — streak math is the gnarly part, tested exhaustively.
 * Covers: consecutive days, gaps, same-day multiples, current vs longest streak,
 * UTC day boundaries, average/best, byDifficulty, lastExam, empty set.
 */
import { describe, expect, it } from "vitest";
import { createStatsService } from "./statsService";
import type { StatsRow } from "@/server/data/repos/sessionRepo";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRow(
  id: string,
  completedAt: string,
  scorePercent: number,
  difficulty = "Easy",
): StatsRow {
  return { id, score_percent: scorePercent, completed_at: completedAt, difficulty };
}

/** Build a stub session repo from a static list of rows. */
function repoFromRows(rows: StatsRow[]) {
  return {
    listCompletedForStats: () => [...rows],
    // unused stubs (SessionRepo has many more methods):
    insert: () => undefined,
    getById: () => undefined,
    patch: () => undefined,
    deleteById: () => 0,
    listCompleted: () => [],
    countCompleted: () => 0,
    db: null as unknown as import("better-sqlite3").Database,
  } as unknown as Parameters<typeof createStatsService>[0];
}

// ── empty set ─────────────────────────────────────────────────────────────────

describe("StatsService — empty dataset", () => {
  const svc = createStatsService(repoFromRows([]));

  it("returns zeroed stats with null lastExam", () => {
    const result = svc.aggregate({});
    expect(result).toEqual({
      totalExams: 0,
      averageScore: 0,
      bestScore: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
      lastExam: null,
      byDifficulty: {},
    });
  });
});

// ── average / best ────────────────────────────────────────────────────────────

describe("StatsService — average and best score", () => {
  it("computes average and best correctly for a simple set", () => {
    const rows = [
      makeRow("a", "2026-06-01T10:00:00.000Z", 60),
      makeRow("b", "2026-06-02T10:00:00.000Z", 80),
      makeRow("c", "2026-06-03T10:00:00.000Z", 100),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.totalExams).toBe(3);
    expect(result.bestScore).toBe(100);
    // (60+80+100)/3 = 80.0
    expect(result.averageScore).toBe(80);
  });

  it("rounds average to 1 decimal place", () => {
    const rows = [
      makeRow("a", "2026-06-01T10:00:00.000Z", 70),
      makeRow("b", "2026-06-02T10:00:00.000Z", 85),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    // (70+85)/2 = 77.5
    expect(result.averageScore).toBe(77.5);
  });

  it("single exam: best === average === that score", () => {
    const rows = [makeRow("a", "2026-06-01T10:00:00.000Z", 73)];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.bestScore).toBe(73);
    expect(result.averageScore).toBe(73);
  });
});

// ── byDifficulty ──────────────────────────────────────────────────────────────

describe("StatsService — byDifficulty breakdown", () => {
  it("groups by difficulty with correct counts and averages", () => {
    const rows = [
      makeRow("a", "2026-06-01T10:00:00.000Z", 60, "Easy"),
      makeRow("b", "2026-06-02T10:00:00.000Z", 80, "Easy"),
      makeRow("c", "2026-06-03T10:00:00.000Z", 50, "Hard"),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.byDifficulty["Easy"]).toEqual({ count: 2, avg: 70 });
    expect(result.byDifficulty["Hard"]).toEqual({ count: 1, avg: 50 });
  });
});

// ── lastExam ──────────────────────────────────────────────────────────────────

describe("StatsService — lastExam", () => {
  it("returns the most recently completed session", () => {
    const rows = [
      makeRow("early", "2026-06-01T10:00:00.000Z", 60),
      makeRow("later", "2026-06-03T10:00:00.000Z", 80),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.lastExam?.id).toBe("later");
    expect(result.lastExam?.scorePercent).toBe(80);
  });
});

// ── streak math ───────────────────────────────────────────────────────────────

describe("StatsService — streak math (the gnarly part)", () => {
  /**
   * Freeze a "now" UTC date so streak tests are deterministic regardless of when
   * the test suite runs. We set `Date.now` via a stub injected into our utcDayDiff
   * helper — since the service uses UTC slicing from completedAt strings (not
   * today's date), we just need the completedAt dates to encode known days.
   */

  it("single exam = streak of 1 (current and longest)", () => {
    const rows = [makeRow("a", "2026-06-01T10:00:00.000Z", 80)];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.currentStreakDays).toBe(1);
    expect(result.longestStreakDays).toBe(1);
  });

  it("two consecutive days = streak of 2", () => {
    const rows = [
      makeRow("a", "2026-06-01T10:00:00.000Z", 80),
      makeRow("b", "2026-06-02T10:00:00.000Z", 90),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.currentStreakDays).toBe(2);
    expect(result.longestStreakDays).toBe(2);
  });

  it("three consecutive days = streak of 3", () => {
    const rows = [
      makeRow("a", "2026-06-01T00:00:00.000Z", 70),
      makeRow("b", "2026-06-02T00:00:00.000Z", 75),
      makeRow("c", "2026-06-03T00:00:00.000Z", 80),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.currentStreakDays).toBe(3);
    expect(result.longestStreakDays).toBe(3);
  });

  it("gap of 2 days breaks the current streak; longest remains the initial run", () => {
    // Days: 1, 2, 3 (gap of 2), 6 → longest = 3, current = 1
    const rows = [
      makeRow("a", "2026-06-01T10:00:00.000Z", 80),
      makeRow("b", "2026-06-02T10:00:00.000Z", 80),
      makeRow("c", "2026-06-03T10:00:00.000Z", 80),
      makeRow("d", "2026-06-06T10:00:00.000Z", 80),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.longestStreakDays).toBe(3);
    expect(result.currentStreakDays).toBe(1);
  });

  it("gap of 1 day breaks streak — only consecutive calendar days count", () => {
    // Days: 1, 3 (gap on day 2) — each is a streak of 1.
    const rows = [
      makeRow("a", "2026-06-01T10:00:00.000Z", 80),
      makeRow("b", "2026-06-03T10:00:00.000Z", 80),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.longestStreakDays).toBe(1);
    expect(result.currentStreakDays).toBe(1);
  });

  it("multiple exams on the same UTC day count as ONE day in the streak", () => {
    // 3 exams on June 1 + 1 on June 2 = 2 consecutive days, not 4.
    const rows = [
      makeRow("a", "2026-06-01T08:00:00.000Z", 70),
      makeRow("b", "2026-06-01T12:00:00.000Z", 75),
      makeRow("c", "2026-06-01T18:00:00.000Z", 80),
      makeRow("d", "2026-06-02T09:00:00.000Z", 85),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.currentStreakDays).toBe(2);
    expect(result.longestStreakDays).toBe(2);
  });

  it("multiple exams on same day do not inflate streak beyond 1 for that day", () => {
    // Only one day in the set, multiple exams → streak = 1.
    const rows = [
      makeRow("a", "2026-06-05T08:00:00.000Z", 70),
      makeRow("b", "2026-06-05T14:00:00.000Z", 90),
      makeRow("c", "2026-06-05T20:00:00.000Z", 60),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.currentStreakDays).toBe(1);
    expect(result.longestStreakDays).toBe(1);
  });

  it("timezone: UTC day boundary — exam at 23:59 UTC on day N is day N, not day N+1", () => {
    // 2026-06-01T23:59:59Z is still June 1 UTC.
    const rows = [
      makeRow("a", "2026-06-01T23:59:59.000Z", 80),
      makeRow("b", "2026-06-02T00:00:01.000Z", 90),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    // June 1 and June 2 are consecutive — streak of 2.
    expect(result.currentStreakDays).toBe(2);
  });

  it("longest streak is correctly identified when it is not the most recent run", () => {
    // Days: 1,2,3,4 (4-day run) — gap — 8,9 (2-day run that is the MOST RECENT).
    // longestStreak = 4, currentStreak = 2.
    const rows = [
      makeRow("a", "2026-06-01T10:00:00.000Z", 80),
      makeRow("b", "2026-06-02T10:00:00.000Z", 80),
      makeRow("c", "2026-06-03T10:00:00.000Z", 80),
      makeRow("d", "2026-06-04T10:00:00.000Z", 80),
      makeRow("e", "2026-06-08T10:00:00.000Z", 80),
      makeRow("f", "2026-06-09T10:00:00.000Z", 80),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.longestStreakDays).toBe(4);
    expect(result.currentStreakDays).toBe(2);
  });

  it("current streak = longest when the longest streak is also the most recent", () => {
    // Days: 1 (gap) 3,4,5 — the most recent 3-day run IS the longest.
    const rows = [
      makeRow("a", "2026-06-01T10:00:00.000Z", 80),
      makeRow("b", "2026-06-03T10:00:00.000Z", 80),
      makeRow("c", "2026-06-04T10:00:00.000Z", 80),
      makeRow("d", "2026-06-05T10:00:00.000Z", 80),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.longestStreakDays).toBe(3);
    expect(result.currentStreakDays).toBe(3);
  });

  it("interleaved streaks — tracks longest across multiple segments", () => {
    // Two streaks: days 1-3 (3 days), gap, days 5-8 (4 days = longest), gap, day 10.
    const rows = [
      makeRow("a", "2026-06-01T10:00:00.000Z", 80),
      makeRow("b", "2026-06-02T10:00:00.000Z", 80),
      makeRow("c", "2026-06-03T10:00:00.000Z", 80),
      // gap: day 4
      makeRow("d", "2026-06-05T10:00:00.000Z", 80),
      makeRow("e", "2026-06-06T10:00:00.000Z", 80),
      makeRow("f", "2026-06-07T10:00:00.000Z", 80),
      makeRow("g", "2026-06-08T10:00:00.000Z", 80),
      // gap: day 9
      makeRow("h", "2026-06-10T10:00:00.000Z", 80),
    ];
    const svc = createStatsService(repoFromRows(rows));
    const result = svc.aggregate({});
    expect(result.longestStreakDays).toBe(4);
    expect(result.currentStreakDays).toBe(1);
  });
});
