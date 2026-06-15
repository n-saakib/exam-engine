/**
 * Schema strictness tests (C6 / MEDIUM-32 guardrails).
 *
 * These tests pin the contracts the schemas are *supposed* to enforce. Where
 * the current schema is permissive and lets a bad shape through, the
 * corresponding test will fail. That's the desired red — it documents the
 * future fix and prevents accidental relaxation.
 *
 * Red-test policy: any failing case here is a known/intended failure. The
 * test name embeds the contract ("…must be rejected") so the gap is obvious
 * in CI output. Production code MUST NOT be patched to make these green
 * without also tightening the corresponding schema and the
 * `validate --strict-correct-answer` script in lockstep.
 */
import { describe, expect, it } from "vitest";

import {
  QuestionSetSchema,
  validateQuestionSet,
  type Question,
} from "@/domain/schemas";

/** A baseline good question shape (single-type, 4 options, 1 correct). */
const goodSingle = {
  id: 1,
  questionType: "single",
  questionText: "Pick one",
  options: { A: "alpha", B: "beta", C: "gamma", D: "delta" },
  correctAnswer: ["A"],
  explanations: {
    A: { description: "d", reason: "r" },
    B: { description: "d", reason: "r" },
    C: { description: "d", reason: "r" },
    D: { description: "d", reason: "r" },
  },
};

const goodSet = {
  setId: "strict-1",
  setTitle: "Strictness Suite",
  difficulty: "easy",
  questions: [goodSingle],
};

describe("QuestionSetSchema strictness (C6 guardrails)", () => {
  it("rejects an unknown questionType such as 'essay'", () => {
    const bad = {
      ...goodSet,
      questions: [{ ...goodSingle, questionType: "essay" }],
    };
    const result = QuestionSetSchema.safeParse(bad);
    // QuestionTypeSchema is z.enum(["single", "multi", "ordered", "freetext"]),
    // so "essay" must be rejected. If this fails, the enum was widened.
    expect(result.success).toBe(false);
  });

  it("rejects single-type correctAnswer of length 2 (multi-shaped value)", () => {
    // The per-type length sanity is enforced in the superRefine branch:
    //   if (q.questionType === "single" && normalised.length !== 1) { … }
    // so { single, ["A","B"] } MUST be rejected.
    const bad = {
      ...goodSet,
      questions: [{ ...goodSingle, correctAnswer: ["A", "B"] }],
    };
    const result = QuestionSetSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message).join(" | ");
      expect(msgs).toMatch(/single-type/);
    }
  });

  it("accepts single-type correctAnswer of length 1", () => {
    // Companion to the previous case — locks the happy path in place.
    const result = QuestionSetSchema.safeParse(goodSet);
    expect(result.success).toBe(true);
  });

  it("accepts option keys up to Z (any single uppercase A–Z letter)", () => {
    // The OptionKeySchema regex is /^[A-Z]$/, so A..Z are ALL valid keys
    // (the existing refine caps count at >= 2 and <= 6). Z must be accepted
    // and the full set must parse successfully.
    const zQuestion: Question = {
      ...goodSingle,
      options: { A: "a", Z: "z" },
      correctAnswer: ["A"],
      explanations: {
        A: { description: "d", reason: "r" },
        Z: { description: "d", reason: "r" },
      },
    };
    const ok = { ...goodSet, questions: [zQuestion] };
    expect(QuestionSetSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects option keys outside A–Z (lowercase 'a', digit '1', 'AA')", () => {
    // The regex rejects "a" (lowercase), "1" (digit), "AA" (two letters).
    for (const badKey of ["a", "1", "AA", "aA"]) {
      const bad = {
        ...goodSet,
        questions: [
          {
            ...goodSingle,
            options: { A: "a", [badKey]: "x" } as Record<string, string>,
            correctAnswer: ["A"],
          },
        ],
      };
      const result = QuestionSetSchema.safeParse(bad);
      expect(result.success, `expected key "${badKey}" to be rejected`).toBe(false);
    }
  });

  it("rejects a non-positive question id (0 and -1)", () => {
    // The schema currently uses z.number().int(); MEDIUM-32 wants positive.
    // This is a RED test: it pins the missing constraint.
    for (const badId of [0, -1]) {
      const bad = {
        ...goodSet,
        questions: [{ ...goodSingle, id: badId }],
      };
      const result = QuestionSetSchema.safeParse(bad);
      expect(result.success, `expected id=${badId} to be rejected`).toBe(false);
    }
  });

  it("rejects a correctAnswer key that is not a member of the options set", () => {
    // The superRefine walks every normalised correctAnswer key and adds an
    // issue when the key isn't in the options map. "Z" is not in {A,B,C,D}.
    const bad = {
      ...goodSet,
      questions: [
        {
          ...goodSingle,
          options: { A: "a", B: "b" },
          correctAnswer: ["Z"],
        },
      ],
    };
    const result = validateQuestionSet(bad);
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(
      result.diagnostics.some(
        (d) =>
          d.severity === "error" && d.message.includes("correctAnswer \"Z\""),
      ),
    ).toBe(true);
  });
});
