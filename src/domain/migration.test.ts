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
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { validateQuestionSet } from "@/domain/schemas";

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

/**
 * Schema violations (C6) — synthetic fixtures in a temp dir, run through the
 * same `validateQuestionSet` that the production validator uses. The migration
 * test above only walks real `Exams` JSON files (recursively); this block
 * makes sure the detector ALSO catches the three remaining gaps the migration
 * spec called out (unknown questionType, missing correctAnswer,
 * correctAnswer-not-subset).
 */
describe("schema violations — synthetic fixtures (C6)", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-c6-"));
  });

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  /** Run the production validator against one synthetic JSON file. */
  function validateSynthetic(
    fileName: string,
    payload: unknown,
  ): { ok: boolean; diagnostics: Array<{ severity: string; message: string }> } {
    const file = path.join(tmpDir, fileName);
    fs.writeFileSync(file, JSON.stringify(payload), "utf8");
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return validateQuestionSet(raw);
  }

  const baseQuestion = {
    id: 1,
    questionText: "Q?",
    options: { A: "a", B: "b", C: "c", D: "d" },
    correctAnswer: ["A"],
    explanations: {
      A: { description: "d", reason: "r" },
      B: { description: "d", reason: "r" },
      C: { description: "d", reason: "r" },
      D: { description: "d", reason: "r" },
    },
  };

  const baseSet = {
    setId: "synth",
    setTitle: "Synthetic",
    difficulty: "easy",
    questions: [baseQuestion],
  };

  it("reports an unknown questionType (e.g. 'essay')", () => {
    const result = validateSynthetic("unknown-type.json", {
      ...baseSet,
      questions: [{ ...baseQuestion, questionType: "essay" }],
    });
    // Hard error: "essay" is not in the QuestionTypeSchema enum.
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.severity === "error" &&
          /Invalid enum value|essay/.test(d.message),
      ),
    ).toBe(true);
  });

  it("reports a missing correctAnswer", () => {
    const result = validateSynthetic("missing-answer.json", {
      ...baseSet,
      questions: [{ ...baseQuestion, correctAnswer: undefined }],
    });
    // Hard error: correctAnswer is required. zod's union gives a generic
    // "Invalid input" message on the field; we accept any error that names
    // the `correctAnswer` path.
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (d: { severity: string; path?: string; message: string }) =>
          d.severity === "error" &&
          (d.path === "questions.0.correctAnswer" ||
            /correctAnswer|Required|Invalid input/i.test(d.message)),
      ),
    ).toBe(true);
  });

  it("reports a correctAnswer key that is not a subset of the options keys", () => {
    const result = validateSynthetic("not-subset.json", {
      ...baseSet,
      questions: [
        {
          ...baseQuestion,
          options: { A: "a", B: "b" },
          correctAnswer: ["Z"],
        },
      ],
    });
    // Hard error: "Z" is not a key in {A,B}.
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.severity === "error" && /correctAnswer "Z"/.test(d.message),
      ),
    ).toBe(true);
  });
});
