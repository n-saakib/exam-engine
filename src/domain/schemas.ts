import { z } from "zod";

/**
 * Shared zod schemas — the single source of truth for both server and client
 * (09 §7.7). DTO types in `types.ts` are `z.infer<>` of these; do not hand-write
 * parallel interfaces.
 *
 * This module is client-safe (no `server-only`, no fs/db) so the typed apiClient
 * and React components can import the schemas/types directly.
 */

// ───────────────────────────────────────────────────────────────────────────
// Question set (Exams/**/*.json) — data model 02 §1
// ───────────────────────────────────────────────────────────────────────────

/** Difficulty, normalised to canonical casing (accepts case-insensitive input). */
export const DifficultySchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.enum(["easy", "medium", "hard", "mock"]))
  .transform((d) => (d.charAt(0).toUpperCase() + d.slice(1)) as Difficulty);

export type Difficulty = "Easy" | "Medium" | "Hard" | "Mock";

/** Supported question types. MVP grades only `single`; others are catalogued-but-flagged. */
export const QuestionTypeSchema = z
  .enum(["single", "multi", "ordered", "freetext"])
  .default("single");

export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/** A single A–Z uppercase option key. */
const OptionKeySchema = z.string().regex(/^[A-Z]$/, "option key must be a single A–Z letter");

/** Per-option explanation. */
export const ExplanationSchema = z.object({
  description: z.string(),
  reason: z.string(),
});

/**
 * A question. Hard-error rules (02 §1.2) are enforced here; the missing-explanation
 * rule is a WARNING and is handled by `validateQuestionSet`, not this schema.
 * `correctAnswer` is validated against the option keys with `superRefine`.
 */
export const QuestionSchema = z
  .object({
    id: z.number().int(),
    questionType: QuestionTypeSchema,
    questionText: z.string().min(1, "questionText must be non-empty"),
    options: z
      .record(OptionKeySchema, z.string())
      .refine((o) => Object.keys(o).length >= 2, "options must have at least 2 keys")
      .refine((o) => Object.keys(o).length <= 6, "options must have at most 6 keys"),
    // single → string; multi → non-empty array of distinct keys. Cross-checked below.
    correctAnswer: z.union([z.string(), z.array(z.string()).nonempty()]),
    explanations: z.record(OptionKeySchema, ExplanationSchema).optional(),
    // Existing files use capital "Tips" — preserve exactly (02 §1.2 note).
    Tips: z.string().optional(),
  })
  .superRefine((q, ctx) => {
    const keys = new Set(Object.keys(q.options));
    if (q.questionType === "single") {
      if (typeof q.correctAnswer !== "string") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctAnswer"],
          message: "single-type correctAnswer must be a string option key",
        });
      } else if (!keys.has(q.correctAnswer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctAnswer"],
          message: `correctAnswer "${q.correctAnswer}" is not one of the option keys`,
        });
      }
    } else if (q.questionType === "multi") {
      if (!Array.isArray(q.correctAnswer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctAnswer"],
          message: "multi-type correctAnswer must be an array of option keys",
        });
      } else {
        const distinct = new Set(q.correctAnswer);
        if (distinct.size !== q.correctAnswer.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["correctAnswer"],
            message: "multi-type correctAnswer must have distinct keys",
          });
        }
        for (const k of q.correctAnswer) {
          if (!keys.has(k)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["correctAnswer"],
              message: `correctAnswer "${k}" is not one of the option keys`,
            });
          }
        }
      }
    }
  });

export type Question = z.infer<typeof QuestionSchema>;

/**
 * A question set file. `setId`/`setTitle` non-empty; `difficulty` normalised;
 * `questions` non-empty with ids unique within the set (checked in superRefine).
 */
export const QuestionSetSchema = z
  .object({
    setId: z.string().min(1, "setId must be non-empty"),
    setTitle: z.string().min(1, "setTitle must be non-empty"),
    difficulty: DifficultySchema,
    questionType: QuestionTypeSchema.optional(),
    questions: z.array(QuestionSchema).nonempty("questions must be a non-empty array"),
  })
  .superRefine((set, ctx) => {
    const seen = new Set<number>();
    set.questions.forEach((q, idx) => {
      if (seen.has(q.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", idx, "id"],
          message: `duplicate question id ${q.id} (must be unique within the set)`,
        });
      }
      seen.add(q.id);
    });
  });

export type QuestionSet = z.infer<typeof QuestionSetSchema>;

// ───────────────────────────────────────────────────────────────────────────
// exam-paths.json (navigation tree) — data model 02 §2
// ───────────────────────────────────────────────────────────────────────────

/** Reserved keys at any node; every OTHER key is a child node. */
export const RESERVED_NODE_KEYS = ["label", "title", "quesPath", "icon", "version"] as const;

/**
 * Recursive node grammar. A node carries optional reserved fields and an open map
 * of child nodes under arbitrary keys. A leaf has `quesPath` (and no children);
 * structural rules ("non-leaf needs a child", "leaf needs quesPath") are checked
 * by `validateExamPaths`, which can attach them as warnings vs errors.
 *
 * `version` is an optional top-level integer (unknown-version fallback lives in
 * PathResolver, F2).
 */
export interface ExamPathNode {
  label?: string;
  title?: string;
  quesPath?: string;
  icon?: string;
  version?: number;
  [childKey: string]: ExamPathNode | string | number | undefined;
}

export const ExamPathNodeSchema: z.ZodType<ExamPathNode> = z.lazy(() =>
  z
    .object({
      label: z.string().optional(),
      title: z.string().optional(),
      quesPath: z.string().optional(),
      icon: z.string().optional(),
      version: z.number().int().optional(),
    })
    .catchall(z.union([ExamPathNodeSchema, z.string(), z.number()])),
);

/** Root of exam-paths.json: must have a `label` and ≥1 child node (02 §2.2). */
export const ExamPathsSchema = ExamPathNodeSchema;

export type ExamPaths = ExamPathNode;

/** Is this object value a child node (vs a reserved scalar field)? */
export function isChildNode(value: unknown): value is ExamPathNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Collect the child-node entries of a node (everything that isn't a reserved key). */
export function childNodes(node: ExamPathNode): Array<[string, ExamPathNode]> {
  const out: Array<[string, ExamPathNode]> = [];
  for (const [key, value] of Object.entries(node)) {
    if ((RESERVED_NODE_KEYS as readonly string[]).includes(key)) continue;
    if (isChildNode(value)) out.push([key, value]);
  }
  return out;
}

/** A node is a leaf iff it declares a `quesPath`. */
export function isLeaf(node: ExamPathNode): boolean {
  return typeof node.quesPath === "string";
}

// ───────────────────────────────────────────────────────────────────────────
// Layered validation (hard errors vs warnings) — 02 §1.2
// ───────────────────────────────────────────────────────────────────────────

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  path?: string;
  message: string;
}

export interface QuestionSetValidation {
  /** The parsed set when there were no hard errors; otherwise null. */
  data: QuestionSet | null;
  /** Hard errors (exclude the file from the catalogue) + warnings (annotate it). */
  diagnostics: Diagnostic[];
  /** Convenience: true iff no `severity: 'error'` diagnostics. */
  ok: boolean;
}

/**
 * Layered validation for a question-set file:
 *   - Hard errors (schema failures) → `severity: 'error'`, `data: null`.
 *   - Missing explanation keys, or an unsupported `questionType`, → `'warning'`;
 *     the file still parses and is returned in `data`.
 */
export function validateQuestionSet(raw: unknown): QuestionSetValidation {
  const parsed = QuestionSetSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      data: null,
      ok: false,
      diagnostics: parsed.error.issues.map((i) => ({
        severity: "error",
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }

  const set = parsed.data;
  const diagnostics: Diagnostic[] = [];

  set.questions.forEach((q, idx) => {
    // Warning: missing explanations for one or more option keys (engine falls back).
    const optionKeys = Object.keys(q.options);
    const explKeys = new Set(Object.keys(q.explanations ?? {}));
    const missing = optionKeys.filter((k) => !explKeys.has(k));
    if (missing.length > 0) {
      diagnostics.push({
        severity: "warning",
        path: `questions.${idx}.explanations`,
        message: `missing explanations for option(s): ${missing.join(", ")}`,
      });
    }
    // Warning: a non-`single` question type is catalogued but "engine pending" (02 §1.1).
    if (q.questionType !== "single") {
      diagnostics.push({
        severity: "warning",
        path: `questions.${idx}.questionType`,
        message: `unsupported question type "${q.questionType}" — engine pending`,
      });
    }
  });

  return { data: set, ok: true, diagnostics };
}
