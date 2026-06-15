/**
 * JSON helpers that never throw on malformed input.
 *
 * `safeParseArray` is used wherever a column stores a JSON array as a string
 * (e.g. `session_answers.selected_options`, `question_snapshot`) and a single
 * corrupt row would otherwise abort an entire export, results view, or
 * grading operation. Returning `[]` on parse failure matches the contract used
 * by the engine and the export service.
 */

/**
 * Parse a JSON string into a string array. Returns `[]` on:
 *   - any parse error,
 *   - a non-array value (object, number, null, string, undefined),
 *   - empty string.
 *
 * Never throws.
 */
export function safeParseArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}
