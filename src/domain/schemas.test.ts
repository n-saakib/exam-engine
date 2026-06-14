import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ExamPathsSchema,
  validateQuestionSet,
  childNodes,
  isLeaf,
  type ExamPathNode,
} from "@/domain/schemas";

describe("question set schema", () => {
  const goodSet = {
    setId: "abc",
    setTitle: "Sample",
    difficulty: "easy", // lower-case → normalised to "Easy"
    questions: [
      {
        id: 1,
        questionText: "Q1?",
        options: { A: "a", B: "b", C: "c", D: "d" },
        // ADR-13: unified array shape.
        correctAnswer: ["B"],
        explanations: {
          A: { description: "x", reason: "y" },
          B: { description: "x", reason: "y" },
          C: { description: "x", reason: "y" },
          D: { description: "x", reason: "y" },
        },
        Tips: "tip",
      },
    ],
  };

  it("accepts a valid single-type set and normalises difficulty", () => {
    const result = validateQuestionSet(goodSet);
    expect(result.ok).toBe(true);
    expect(result.data?.difficulty).toBe("Easy");
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("defaults questionType to 'single' when absent", () => {
    const result = validateQuestionSet(goodSet);
    expect(result.data?.questions[0].questionType).toBe("single");
  });

  it("hard-errors when correctAnswer is not an option key", () => {
    const bad = {
      ...goodSet,
      questions: [{ ...goodSet.questions[0], correctAnswer: ["Z"] }],
    };
    const result = validateQuestionSet(bad);
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("hard-errors on fewer than 2 options", () => {
    const bad = {
      ...goodSet,
      questions: [{ ...goodSet.questions[0], options: { A: "a" }, correctAnswer: ["A"] }],
    };
    expect(validateQuestionSet(bad).ok).toBe(false);
  });

  it("hard-errors on duplicate question ids within a set", () => {
    const bad = {
      ...goodSet,
      questions: [goodSet.questions[0], { ...goodSet.questions[0] }],
    };
    expect(validateQuestionSet(bad).ok).toBe(false);
  });

  it("hard-errors on a single-type question whose correctAnswer has more than 1 key", () => {
    const bad = {
      ...goodSet,
      questions: [{ ...goodSet.questions[0], correctAnswer: ["A", "B"] }],
    };
    const result = validateQuestionSet(bad);
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some((d) => d.severity === "error" && d.message.includes("single-type")),
    ).toBe(true);
  });

  it("warns (not errors) on missing explanation keys", () => {
    const set = {
      ...goodSet,
      questions: [{ ...goodSet.questions[0], explanations: { A: { description: "x", reason: "y" } } }],
    };
    const result = validateQuestionSet(set);
    expect(result.ok).toBe(true);
    expect(result.diagnostics.some((d) => d.severity === "warning")).toBe(true);
  });

  it("accepts a multi-type question with no warning (engine + grader support it)", () => {
    const set = {
      ...goodSet,
      questions: [
        {
          ...goodSet.questions[0],
          questionType: "multi",
          correctAnswer: ["A", "B"],
        },
      ],
    };
    const result = validateQuestionSet(set);
    expect(result.ok).toBe(true);
    expect(result.diagnostics.some((d) => d.severity === "warning")).toBe(false);
  });

  it("rejects the `ordered` question type as unsupported (warning, not error)", () => {
    const set = {
      ...goodSet,
      questions: [
        {
          ...goodSet.questions[0],
          questionType: "ordered",
          correctAnswer: ["A", "B", "C"],
        },
      ],
    };
    const result = validateQuestionSet(set);
    expect(result.ok).toBe(true);
    expect(
      result.diagnostics.some(
        (d) => d.severity === "warning" && d.message.includes("unsupported question type"),
      ),
    ).toBe(true);
  });

  it("accepts the legacy string-shaped correctAnswer (backward-compat shim)", () => {
    const set = {
      ...goodSet,
      questions: [{ ...goodSet.questions[0], correctAnswer: "B" }],
    };
    const result = validateQuestionSet(set);
    // Permissive: the schema still accepts the string for historical JSON
    // files and snapshots (see ADR-13).
    expect(result.ok).toBe(true);
  });
});

describe("exam-paths.json (real file, 09 §7.7)", () => {
  const file = path.resolve(process.cwd(), "exam-paths.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as ExamPathNode;

  it("the real exam-paths.json parses against the schema", () => {
    const result = ExamPathsSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("has version 1 and a labelled root with children", () => {
    expect(raw.version).toBe(1);
    expect(typeof raw.label).toBe("string");
    expect(childNodes(raw).length).toBeGreaterThanOrEqual(1);
  });

  it("reaches leaves with quesPath via the child-node grammar", () => {
    const leaves: ExamPathNode[] = [];
    const walk = (node: ExamPathNode) => {
      if (isLeaf(node)) leaves.push(node);
      for (const [, child] of childNodes(node)) walk(child);
    };
    walk(raw);
    expect(leaves.length).toBeGreaterThanOrEqual(4);
    for (const leaf of leaves) {
      expect(typeof leaf.quesPath).toBe("string");
      expect(typeof leaf.title).toBe("string");
    }
  });
});
