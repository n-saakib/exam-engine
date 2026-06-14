/**
 * Post-migration invariant: every `correctAnswer` under `Exams/` (recursively,
 * every `*.json`) MUST be a non-empty array of distinct A-Z option keys.
 * `single`-type questions must have length 1; `multi`-type must have length >= 2.
 *
 * This is the durable guardrail against future drift. Re-runs `npm run validate
 * -- --strict-correct-answer` for free (the validator is a strict superset of
 * these checks).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function findJsonFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findJsonFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

const EXAMS_ROOT = path.resolve(process.cwd(), "Exams");

describe("Exams/**/*.json — ADR-13 unified array shape", () => {
  const files = findJsonFiles(EXAMS_ROOT).sort();

  it("at least one question set is present (sanity)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const questions: Array<{
      id: number;
      questionType?: string;
      correctAnswer?: unknown;
      options?: Record<string, unknown>;
    }> = Array.isArray(raw?.questions) ? raw.questions : [];

    describe(rel, () => {
      for (const q of questions) {
        it(`q${q.id}: correctAnswer is a non-empty array of distinct option keys`, () => {
          expect(Array.isArray(q.correctAnswer)).toBe(true);
          const ca = q.correctAnswer as unknown[];
          expect(ca.length).toBeGreaterThanOrEqual(1);
          // All entries are A-Z letters.
          for (const k of ca) {
            expect(typeof k).toBe("string");
            expect(k).toMatch(/^[A-Z]$/);
          }
          // Distinctness.
          expect(new Set(ca).size).toBe(ca.length);
          // Membership in the question's options.
          if (q.options) {
            for (const k of ca) {
              expect(Object.prototype.hasOwnProperty.call(q.options, k as string)).toBe(
                true,
              );
            }
          }
        });
        if (q.questionType === "single") {
          it(`q${q.id}: single-type has exactly 1 correct key`, () => {
            expect((q.correctAnswer as unknown[]).length).toBe(1);
          });
        }
        if (q.questionType === "multi") {
          it(`q${q.id}: multi-type has at least 2 correct keys`, () => {
            expect((q.correctAnswer as unknown[]).length).toBeGreaterThanOrEqual(2);
          });
        }
      }
    });
  }
});
