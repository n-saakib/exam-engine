/**
 * Minimal className combiner: filters falsy values and joins with spaces.
 * (No clsx/tailwind-merge dependency for the F0 scaffold; can be upgraded later.)
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
