import "server-only";

import type { StatsResponse } from "@/domain/types";
import type { CompletedFilters, SessionRepo } from "@/server/data/repos/sessionRepo";

/**
 * StatsService — aggregates history stats over a filtered set of completed sessions.
 *
 * Streak math rules (F7 spec):
 *   - Uses UTC day boundaries (YYYY-MM-DD slices of completedAt).
 *   - Multiple exams on the same UTC day = one day counted.
 *   - A gap (missing calendar day) breaks the current streak.
 *   - currentStreakDays = consecutive day chain ending on the most recent day in the
 *     filtered set (NOT necessarily today, since filters may exclude recent sessions).
 *   - longestStreakDays = longest consecutive chain anywhere in the dataset.
 */

export interface StatsService {
  aggregate(filters: CompletedFilters): StatsResponse;
}

export function createStatsService(sessionRepo: SessionRepo): StatsService {
  return {
    aggregate(filters: CompletedFilters): StatsResponse {
      const rows = sessionRepo.listCompletedForStats(filters);

      if (rows.length === 0) {
        return {
          totalExams: 0,
          averageScore: 0,
          bestScore: 0,
          currentStreakDays: 0,
          longestStreakDays: 0,
          lastExam: null,
          byDifficulty: {},
        };
      }

      const totalExams = rows.length;

      // Compute average and best score.
      let scoreSum = 0;
      let bestScore = 0;
      for (const r of rows) {
        scoreSum += r.score_percent;
        if (r.score_percent > bestScore) bestScore = r.score_percent;
      }
      const averageScore = Math.round((scoreSum / totalExams) * 10) / 10;

      // byDifficulty: count + avg per difficulty label.
      const diffMap: Record<string, { scoreSum: number; count: number }> = {};
      for (const r of rows) {
        const diff = r.difficulty;
        if (!diffMap[diff]) diffMap[diff] = { scoreSum: 0, count: 0 };
        diffMap[diff]!.scoreSum += r.score_percent;
        diffMap[diff]!.count += 1;
      }
      const byDifficulty: StatsResponse["byDifficulty"] = {};
      for (const [diff, agg] of Object.entries(diffMap)) {
        byDifficulty[diff] = {
          count: agg.count,
          avg: Math.round((agg.scoreSum / agg.count) * 10) / 10,
        };
      }

      // lastExam: the most recently completed session in the filtered set.
      // rows is sorted ASC by completed_at, so the last element is the newest.
      const lastRow = rows[rows.length - 1]!;
      const lastExam: StatsResponse["lastExam"] = {
        id: lastRow.id,
        scorePercent: lastRow.score_percent,
        completedAt: lastRow.completed_at,
      };

      // ── Streak calculation ────────────────────────────────────────────────
      // Collect unique UTC days (YYYY-MM-DD) across all rows, sort ascending.
      const daySet = new Set<string>();
      for (const r of rows) {
        // completedAt is ISO-8601 UTC — take the date portion.
        const day = r.completed_at.slice(0, 10);
        daySet.add(day);
      }
      const days = Array.from(daySet).sort(); // ascending

      let longestStreakDays = 0;
      let currentStreakDays = 0;

      if (days.length > 0) {
        // Walk the sorted unique days, counting consecutive calendar-day chains.
        let streakLen = 1;
        let longestSoFar = 1;

        for (let i = 1; i < days.length; i++) {
          const prev = days[i - 1]!;
          const curr = days[i]!;
          const diffDays = utcDayDiff(prev, curr);
          if (diffDays === 1) {
            // Consecutive day — extend streak.
            streakLen += 1;
            if (streakLen > longestSoFar) longestSoFar = streakLen;
          } else {
            // Gap — reset streak.
            streakLen = 1;
          }
        }
        longestStreakDays = longestSoFar;

        // currentStreakDays = the streak that ends at the last day in the
        // filtered set (walk backwards).
        let cur = 1;
        for (let i = days.length - 1; i >= 1; i--) {
          const prev = days[i - 1]!;
          const curr = days[i]!;
          const diffDays = utcDayDiff(prev, curr);
          if (diffDays === 1) {
            cur += 1;
          } else {
            break;
          }
        }
        currentStreakDays = cur;
      }

      return {
        totalExams,
        averageScore,
        bestScore,
        currentStreakDays,
        longestStreakDays,
        lastExam,
        byDifficulty,
      };
    },
  };
}

/**
 * Compute the number of calendar days between two YYYY-MM-DD strings.
 * Both are UTC midnight, so arithmetic is clean.
 */
function utcDayDiff(a: string, b: string): number {
  const msA = Date.UTC(
    parseInt(a.slice(0, 4), 10),
    parseInt(a.slice(5, 7), 10) - 1,
    parseInt(a.slice(8, 10), 10),
  );
  const msB = Date.UTC(
    parseInt(b.slice(0, 4), 10),
    parseInt(b.slice(5, 7), 10) - 1,
    parseInt(b.slice(8, 10), 10),
  );
  return Math.round((msB - msA) / 86_400_000);
}
