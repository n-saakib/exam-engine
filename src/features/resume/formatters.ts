/**
 * Lightweight formatting utilities for the ResumeScreen.
 * No external dependencies — pure functions, testable in isolation.
 */

/**
 * Format elapsed milliseconds as "Xh Ym Zs" (omits zero-value leading units).
 * Examples:
 *   252000  → "4m 12s"
 *   3661000 → "1h 1m 1s"
 *   45000   → "45s"
 */
export function formatElapsedMs(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}

/**
 * Format an ISO date string as a human-readable "paused at" label.
 * Produces a short locale date+time, e.g. "Jun 11, 10:32 AM".
 */
export function formatPausedAt(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
