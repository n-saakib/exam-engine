import { z } from "zod";

import {
  DifficultySchema,
  QuestionTypeSchema,
  ExplanationSchema,
} from "@/domain/schemas";

/**
 * API DTO contracts as zod schemas → types via `z.infer<>` (09 §7.7). These are
 * the wire shapes the apiClient and Route Handlers agree on. Imported by BOTH
 * client and server; this module is type/contract only (no `server-only`).
 *
 * Re-export the core domain types so callers have one import site.
 */
export type { Difficulty, QuestionType } from "@/domain/schemas";
export {
  QuestionSetSchema,
  QuestionSchema,
  ExamPathsSchema,
  ExamPathNodeSchema,
} from "@/domain/schemas";
export type {
  QuestionSet,
  Question,
  ExamPaths,
  ExamPathNode,
} from "@/domain/schemas";

// ───────────────────────────────────────────────────────────────────────────
// Shared enums
// ───────────────────────────────────────────────────────────────────────────

export const SessionStatusSchema = z.enum(["in_progress", "completed", "discarded"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionModeSchema = z.enum(["full", "retake_all", "retake_incorrect"]);
export type SessionMode = z.infer<typeof SessionModeSchema>;

export const ConfidenceSchema = z.enum(["easy", "medium", "hard"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const OutcomeSchema = z.enum(["correct", "incorrect", "revealed", "unanswered"]);
export type Outcome = z.infer<typeof OutcomeSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Health (03 §2 / F0)
// ───────────────────────────────────────────────────────────────────────────

export const HealthSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  schemaVersion: z.number().int(),
  examsRoot: z.string(),
  setsIndexed: z.number().int(),
});
export type Health = z.infer<typeof HealthSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Timer (03 §4.1)
// ───────────────────────────────────────────────────────────────────────────

export const TimerSchema = z.object({
  enabled: z.boolean(),
  limitMs: z.number().int().nullable().optional(),
  elapsedMs: z.number().int(),
  expired: z.boolean().optional(),
});
export type Timer = z.infer<typeof TimerSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Live session DTO (answers hidden) — 03 §4.1
// ───────────────────────────────────────────────────────────────────────────

/** Per-question answer state carried in the live DTO. */
export const LiveAnswerSchema = z.object({
  selected: z.array(z.string()),
  flagged: z.boolean(),
  revealed: z.boolean(),
  confidence: ConfidenceSchema.nullable(),
  timeSpentMs: z.number().int(),
});
export type LiveAnswer = z.infer<typeof LiveAnswerSchema>;

/**
 * A question as seen during an exam. `correctAnswer`/`explanations`/`Tips` are
 * present ONLY when `answer.revealed === true` (the server attaches them then).
 */
export const LiveQuestionSchema = z.object({
  id: z.number().int(),
  order: z.number().int(),
  questionType: QuestionTypeSchema,
  questionText: z.string(),
  options: z.record(z.string(), z.string()),
  optionOrder: z.array(z.string()).optional(),
  answer: LiveAnswerSchema,
  // Only present post-reveal:
  correctAnswer: z.union([z.string(), z.array(z.string())]).optional(),
  explanations: z.record(z.string(), ExplanationSchema).optional(),
  Tips: z.string().optional(),
});
export type LiveQuestion = z.infer<typeof LiveQuestionSchema>;

export const LiveSessionSchema = z.object({
  id: z.string(),
  status: SessionStatusSchema,
  quesPath: z.string(),
  domainLabel: z.string(),
  setTitle: z.string(),
  difficulty: DifficultySchema,
  mode: SessionModeSchema,
  totalQuestions: z.number().int(),
  currentIndex: z.number().int(),
  timer: TimerSchema,
  questions: z.array(LiveQuestionSchema),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type LiveSession = z.infer<typeof LiveSessionSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Results DTO (answers shown) — 03 §5.1
// ───────────────────────────────────────────────────────────────────────────

export const ResultsSummarySchema = z.object({
  scorePercent: z.number(),
  correct: z.number().int(),
  incorrect: z.number().int(),
  revealed: z.number().int(),
  unanswered: z.number().int(),
  total: z.number().int(),
  timeTakenMs: z.number().int(),
  timerLimitMs: z.number().int().nullable(),
});
export type ResultsSummary = z.infer<typeof ResultsSummarySchema>;

export const ResultsQuestionSchema = z.object({
  id: z.number().int(),
  order: z.number().int(),
  questionType: QuestionTypeSchema,
  questionText: z.string(),
  options: z.record(z.string(), z.string()),
  correctAnswer: z.union([z.string(), z.array(z.string())]),
  yourAnswer: z.array(z.string()),
  outcome: OutcomeSchema,
  flagged: z.boolean(),
  confidence: ConfidenceSchema.nullable(),
  explanations: z.record(z.string(), ExplanationSchema),
  Tips: z.string().optional(),
});
export type ResultsQuestion = z.infer<typeof ResultsQuestionSchema>;

export const ResultsSchema = z.object({
  id: z.string(),
  status: SessionStatusSchema,
  domainLabel: z.string(),
  setTitle: z.string(),
  difficulty: DifficultySchema,
  mode: SessionModeSchema,
  summary: ResultsSummarySchema,
  isBookmarked: z.boolean(),
  note: z.string().nullable(),
  completedAt: z.string().nullable(),
  questions: z.array(ResultsQuestionSchema),
});
export type Results = z.infer<typeof ResultsSchema>;

// ───────────────────────────────────────────────────────────────────────────
// History row — 03 §6
// ───────────────────────────────────────────────────────────────────────────

export const HistoryRowSchema = z.object({
  id: z.string(),
  domainLabel: z.string(),
  difficulty: DifficultySchema,
  setTitle: z.string(),
  scorePercent: z.number(),
  timeTakenMs: z.number().int(),
  completedAt: z.string(),
  isBookmarked: z.boolean(),
  hasNote: z.boolean(),
});
export type HistoryRow = z.infer<typeof HistoryRowSchema>;

export const HistoryListSchema = z.object({
  items: z.array(HistoryRowSchema),
  total: z.number().int(),
});
export type HistoryList = z.infer<typeof HistoryListSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Session-list row — 09 §8
// ───────────────────────────────────────────────────────────────────────────

export const SessionListRowSchema = z.object({
  id: z.string(),
  status: SessionStatusSchema,
  domainLabel: z.string(),
  setTitle: z.string(),
  difficulty: DifficultySchema,
  percentAnswered: z.number(),
  answeredCount: z.number().int(),
  totalQuestions: z.number().int(),
  timeElapsedMs: z.number().int(),
  pausedAt: z.string(),
  createdAt: z.string(),
});
export type SessionListRow = z.infer<typeof SessionListRowSchema>;

export const SessionListSchema = z.object({
  items: z.array(SessionListRowSchema),
  total: z.number().int(),
});
export type SessionList = z.infer<typeof SessionListSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Settings — 02 §4
// ───────────────────────────────────────────────────────────────────────────

export const ThemeSchema = z.enum(["system", "light", "dark"]);
export type Theme = z.infer<typeof ThemeSchema>;

export const SettingsSchema = z.object({
  exams_root: z.string(),
  source_mode: z.enum(["filesystem", "upload"]),
  timer_enabled: z.boolean(),
  timer_default_minutes: z.number().nullable(),
  show_count_before_start: z.boolean(),
  shuffle_questions: z.boolean(),
  shuffle_options: z.boolean(),
  progressive_reveal: z.boolean(),
  theme: ThemeSchema,
  last_selected_path: z.array(z.string()),
  schema_version_seen: z.number().int(),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** PATCH /api/settings accepts a partial object (only provided keys updated). */
export const SettingsPatchSchema = SettingsSchema.partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

// ───────────────────────────────────────────────────────────────────────────
// GET /api/exam-paths — 03 §3 (F2)
// ───────────────────────────────────────────────────────────────────────────

/**
 * One leaf in the flat `leaves[]` array returned by `GET /api/exam-paths`.
 * Carries path-counts from the SetCatalog service + a path-safety flag.
 */
export const LeafSummarySchema = z.object({
  quesPath: z.string(),
  domainLabel: z.string(),
  icon: z.string().optional(),
  /** true when quesPath resolves safely under the exams root */
  safe: z.boolean(),
  totalSets: z.number().int(),
  completedSets: z.number().int(),
  remainingSets: z.number().int(),
  exhausted: z.boolean(),
});
export type LeafSummary = z.infer<typeof LeafSummarySchema>;

/**
 * Full response shape for `GET /api/exam-paths`.
 * `tree` is the raw navigation tree; `leaves` is the flat enriched list.
 */
export const ExamPathsResponseSchema = z.object({
  tree: z.record(z.unknown()),
  leaves: z.array(LeafSummarySchema),
});
export type ExamPathsResponse = z.infer<typeof ExamPathsResponseSchema>;
