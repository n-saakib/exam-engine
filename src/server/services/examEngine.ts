import "server-only";

import { randomUUID } from "node:crypto";

import type {
  CreateSessionBody,
  PatchSessionBody,
  LiveSession,
  Results,
  Settings,
} from "@/domain/types";
import type { Question, QuestionSet, SnapshotQuestion } from "@/domain/schemas";
import { AppError } from "@/server/http/errors";
import { createSeededRng, generateSeed } from "@/server/services/seededRng";
import { gradeSession } from "@/server/services/scoreCalculator";
import { safeParseArray } from "@/server/util/jsonSafe";
import { toLiveSession, toResults } from "@/server/services/sessionMapper";
import type { SessionRepo, SessionRow } from "@/server/data/repos/sessionRepo";
import type { AnswerRepo } from "@/server/data/repos/answerRepo";
import type { CompletionRepo } from "@/server/data/repos/completionRepo";
import type { SetCatalogService } from "@/server/services/setCatalog";
import type { PathResolver } from "@/server/services/pathResolver";

/** Default per-set time budget when timed but no explicit/derived limit is set. */
const DEFAULT_TIMER_MINUTES = 20;

/** Question types the engine can play (ADR-13). `ordered` and `freetext`
 *  remain catalogue-only and are 422-rejected at create time. The per-type
 *  length sanity (single → 1 key, multi → ≥1 key) is enforced by
 *  `QuestionSchema.superRefine` at JSON-load time. */
const SUPPORTED_QUESTION_TYPES = ["single", "multi"] as const;
type SupportedQuestionType = (typeof SUPPORTED_QUESTION_TYPES)[number];
const isSupportedQuestionType = (t: string): t is SupportedQuestionType =>
  (SUPPORTED_QUESTION_TYPES as readonly string[]).includes(t);

/**
 * Engine input for create — `mode` may be omitted (defaults to "full"). Accepts
 * the schema INPUT type so it works whether the caller passes a parsed body
 * (where `.default()` has already filled `mode`) or a raw object in tests.
 */
type CreateSessionInput = Omit<CreateSessionBody, "mode"> & {
  mode?: "full";
};

/** Options for retake — mirrors the POST /sessions/:id/retake body. */
export interface RetakeInput {
  scope: "all" | "incorrect";
  options?: {
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    timerEnabled?: boolean;
    timerMinutes?: number | null;
  };
}

export interface ExamEngineDeps {
  sessionRepo: SessionRepo;
  answerRepo: AnswerRepo;
  completionRepo: CompletionRepo;
  setCatalog: SetCatalogService;
  pathResolver: PathResolver;
  /** Settings provider (create-time defaults); injected so it's testable. */
  getSettings: () => Settings;
}

/**
 * ExamEngine — orchestrates the exam lifecycle (F4-T1, T6–T13). It owns no SQL
 * (repos do) and computes no score (ScoreCalculator does); it wires set loading,
 * shuffling, snapshotting, persistence, the answers-hidden DTO, and grading.
 */
export function createExamEngine(deps: ExamEngineDeps) {
  const {
    sessionRepo,
    answerRepo,
    completionRepo,
    setCatalog,
    pathResolver,
    getSettings,
  } = deps;

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Load a session row or throw SESSION_NOT_FOUND. */
  function requireSession(id: string): SessionRow {
    const row = sessionRepo.getById(id);
    if (!row) {
      throw new AppError("SESSION_NOT_FOUND", `No session with id: ${id}`, 404);
    }
    return row;
  }

  /** Resolve a human domain label for a quesPath via the navigation tree. */
  function domainLabelFor(quesPath: string): string {
    try {
      const leaf = pathResolver.leaves.find((l) => l.quesPath === quesPath);
      if (leaf) return leaf.domainLabel;
    } catch {
      // exam-paths.json missing/invalid — fall back to the raw path.
    }
    return quesPath;
  }

  /**
   * Build the ordered, self-contained snapshot from a set (02 §5). Applies the
   * seeded question shuffle and (optionally) per-question option shuffle. The
   * `correctAnswer`/`explanations`/`Tips` ARE stored here — the mapper hides them.
   */
  function buildSnapshot(
    set: QuestionSet,
    opts: { shuffleQuestions: boolean; shuffleOptions: boolean; seed: string },
  ): SnapshotQuestion[] {
    const rng = createSeededRng(opts.seed);

    const ordered: Question[] = opts.shuffleQuestions
      ? rng.shuffle(set.questions)
      : [...set.questions];

    return ordered.map((q, idx) => {
      const optionKeys = Object.keys(q.options);
      const snap: SnapshotQuestion = {
        id: q.id,
        order: idx + 1,
        questionType: q.questionType,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        ...(q.explanations ? { explanations: q.explanations } : {}),
        ...(q.Tips !== undefined ? { Tips: q.Tips } : {}),
      };
      if (opts.shuffleOptions) {
        // Per-question deterministic option order. Derive a per-question seed so
        // options don't all permute identically.
        const optRng = createSeededRng(`${opts.seed}:q${q.id}`);
        snap.optionOrder = optRng.shuffle(optionKeys);
      } else {
        snap.optionOrder = optionKeys;
      }
      return snap;
    });
  }

  /** Resolve the timer config from options → settings → derived default. */
  function resolveTimer(
    options: CreateSessionBody["options"],
    settings: Settings,
  ): { enabled: boolean; limitMs: number | null } {
    const enabled = options?.timerEnabled ?? settings.timer_enabled;
    if (!enabled) return { enabled: false, limitMs: null };

    // Explicit override (minutes) wins; then the settings default; then a derived
    // floor. A timed session MUST carry a limit (DB CHECK enforces this too).
    const minutes =
      options?.timerMinutes ??
      settings.timer_default_minutes ??
      DEFAULT_TIMER_MINUTES;
    return { enabled: true, limitMs: Math.round(minutes * 60_000) };
  }

  // ── public API ───────────────────────────────────────────────────────────

  return {
    /**
     * Create a new in-progress session (F4-T1). Resolves the set via F3, refuses
     * unsupported question types (422), snapshots the questions, computes the
     * timer, and persists the session + blank answer rows in ONE transaction.
     * Returns the answers-hidden live DTO.
     */
    createSession(body: CreateSessionInput): LiveSession {
      const settings = getSettings();

      // Resolve the set: explicit setId ⇒ loadSet; else pick the next unattempted
      // (throws SETS_EXHAUSTED when all completed, PATH_NOT_FOUND when none exist).
      // NOTE: the route handler is responsible for the path-traversal-shaped
      // pre-check; the engine itself trusts its inputs to be a valid
      // quesPath / setId (the deeper sandbox is enforced at the path resolver
      // and `setCatalog.loadSet` layer).
      let set: QuestionSet;
      let setId: string;
      if (body.setId) {
        set = setCatalog.loadSet(body.setId);
        setId = set.setId;
      } else {
        const picked = setCatalog.pickNextUnattempted(body.quesPath);
        set = setCatalog.loadSet(picked.file_path);
        setId = set.setId;
      }

      // Unsupported question type → 422. `single` and `multi` are both supported
      // (see ADR-13 unified-array-shape migration); `ordered` and `freetext` are
      // still catalogue-only. The per-type length sanity (single → 1 key, multi
      // → ≥1 key) is enforced by `QuestionSchema.superRefine` at JSON-load time.
      const setType = set.questionType ?? "single";
      const hasUnsupported =
        !isSupportedQuestionType(setType) ||
        set.questions.some((q) => !isSupportedQuestionType(q.questionType));
      if (hasUnsupported) {
        throw new AppError(
          "UNSUPPORTED_QUESTION_TYPE",
          `Set "${set.setTitle}" declares a question type that is not yet supported`,
          422,
        );
      }

      const seed = body.options?.seed ?? generateSeed();
      const shuffleQuestions =
        body.options?.shuffleQuestions ?? settings.shuffle_questions;
      const shuffleOptions =
        body.options?.shuffleOptions ?? settings.shuffle_options;

      const snapshot = buildSnapshot(set, {
        shuffleQuestions,
        shuffleOptions,
        seed,
      });

      const timer = resolveTimer(body.options, settings);
      const id = randomUUID();
      const now = new Date().toISOString();

      // Persist the session + seed blank answers in ONE transaction (atomicity:
      // a session never exists without its answer rows).
      const create = sessionRepo.db.transaction(() => {
        sessionRepo.insert({
          id,
          quesPath: body.quesPath,
          domainLabel: domainLabelFor(body.quesPath),
          setId,
          setTitle: set.setTitle,
          difficulty: set.difficulty,
          questionSnapshot: JSON.stringify(snapshot),
          totalQuestions: snapshot.length,
          timerEnabled: timer.enabled,
          timerLimitMs: timer.limitMs,
          shuffleSeed: seed,
          mode: body.mode ?? "full",
          originSessionId: null,
          createdAt: now,
        });
        answerRepo.insertBlanks(
          id,
          snapshot.map((q) => q.id),
        );
      });
      create();

      return this.getSession(id);
    },

    /** Fetch the live (answers-hidden) DTO for a session. */
    getSession(id: string): LiveSession {
      const row = requireSession(id);
      const answers = answerRepo.getBySession(id);
      return toLiveSession(row, answers);
    },

    /**
     * Apply an autosave patch (F4-T9). Updates navigation, the absolute (clamped)
     * timer, and a single per-question answer. Only valid while in_progress
     * (409 SESSION_NOT_IN_PROGRESS otherwise). `revealed:true` is monotonic.
     * Returns the updated live DTO (a just-revealed question now carries its data).
     */
    applyUpdate(id: string, patch: PatchSessionBody): LiveSession {
      const row = requireSession(id);
      if (row.status !== "in_progress") {
        throw new AppError(
          "SESSION_NOT_IN_PROGRESS",
          `Session ${id} is ${row.status}, not in_progress`,
          409,
        );
      }

      const sessionPatch: Parameters<SessionRepo["patch"]>[1] = {};
      if (patch.currentIndex !== undefined) {
        sessionPatch.currentIndex = patch.currentIndex;
      }
      if (patch.elapsedMs !== undefined) {
        // C2: validate the value is a finite, non-negative integer. Reject
        // NaN / Infinity / negative / fractional inputs (C2) and any
        // regression below the stored value (timer integrity).
        if (
          !Number.isFinite(patch.elapsedMs) ||
          patch.elapsedMs < 0 ||
          !Number.isInteger(patch.elapsedMs)
        ) {
          throw new AppError(
            "VALIDATION_ERROR",
            `elapsedMs must be a non-negative finite integer: ${patch.elapsedMs}`,
            400,
            { field: "elapsedMs", value: patch.elapsedMs },
          );
        }
        // Server-clamped to [0, limit] when timed (09 §7.1). Idempotent on
        // retry: same absolute value ⇒ same stored value.
        let elapsed = patch.elapsedMs;
        if (row.timer_enabled === 1 && row.timer_limit_ms != null) {
          elapsed = Math.min(elapsed, row.timer_limit_ms);
        }
        // Monotonic: reject a value that regresses below the stored elapsed.
        // The client's local timer can be reset (browser reload, time skew),
        // but the server's view is the source of truth and only goes forward.
        if (elapsed < row.time_elapsed_ms) {
          throw new AppError(
            "VALIDATION_ERROR",
            `elapsedMs regression: stored ${row.time_elapsed_ms}, got ${elapsed}`,
            400,
            { field: "elapsedMs", stored: row.time_elapsed_ms, got: elapsed },
          );
        }
        sessionPatch.timeElapsedMs = elapsed;
      }

      const work = sessionRepo.db.transaction(() => {
        // Always bump updated_at (keeps the session-list "pausedAt" fresh).
        sessionRepo.patch(id, sessionPatch);

        if (patch.answer) {
          const a = patch.answer;
          const existing = answerRepo.getOne(id, a.questionId);
          const alreadyRevealed = existing?.is_revealed === 1;

          answerRepo.upsert(id, a.questionId, {
            ...(a.selected !== undefined ? { selected: a.selected } : {}),
            ...(a.flagged !== undefined ? { flagged: a.flagged } : {}),
            // Monotonic reveal: never un-reveal. Only write `true`.
            ...(a.revealed === true || alreadyRevealed
              ? { revealed: true }
              : {}),
            ...(a.timeSpentMs !== undefined
              ? { timeSpentMs: a.timeSpentMs }
              : {}),
          });
        }
      });
      work();

      return this.getSession(id);
    },

    /**
     * Submit & grade (F4-T12). Grades the snapshot via ScoreCalculator, writes the
     * score fields + per-answer is_correct, sets status=completed, records the
     * set_completion, and returns the answers-shown results DTO. 409 if already
     * completed/discarded.
     */
    submit(id: string, finalElapsedMs?: number): Results {
      const row = requireSession(id);
      if (row.status === "completed") {
        throw new AppError(
          "SESSION_ALREADY_COMPLETED",
          `Session ${id} is already completed`,
          409,
        );
      }
      if (row.status !== "in_progress") {
        throw new AppError(
          "SESSION_NOT_IN_PROGRESS",
          `Session ${id} is ${row.status}, not in_progress`,
          409,
        );
      }

      const snapshot = JSON.parse(row.question_snapshot) as SnapshotQuestion[];
      const answers = answerRepo.getBySession(id);

      const graded = gradeSession(
        snapshot,
        answers.map((a) => ({
          questionId: a.question_id,
          selected: safeParseArray(a.selected_options),
          revealed: a.is_revealed === 1,
        })),
      );

      // Clamp a provided final elapsed exactly like autosave.
      let elapsed = row.time_elapsed_ms;
      if (finalElapsedMs !== undefined) {
        elapsed = Math.max(0, finalElapsedMs);
        if (row.timer_enabled === 1 && row.timer_limit_ms != null) {
          elapsed = Math.min(elapsed, row.timer_limit_ms);
        }
      }
      const now = new Date().toISOString();

      const finalize = sessionRepo.db.transaction(() => {
        sessionRepo.patch(id, {
          status: "completed",
          timeElapsedMs: elapsed,
          scorePercent: graded.totals.scorePercent,
          correctCount: graded.totals.correct,
          incorrectCount: graded.totals.incorrect,
          revealedCount: graded.totals.revealed,
          unansweredCount: graded.totals.unanswered,
          completedAt: now,
        });
        for (const r of graded.perQuestion) {
          // Persist correctness (null isCorrect ⇒ treat as not-correct for the flag).
          answerRepo.setCorrect(id, r.questionId, r.isCorrect === true);
        }
        // Repeat-avoidance: mark this set complete for the path (F3-T8).
        completionRepo.record(row.ques_path, row.set_id, id);
      });
      finalize();

      const updated = requireSession(id);
      return toResults(updated, answerRepo.getBySession(id));
    },

    /** Read the graded results DTO for a session (results/history surface). */
    getResults(id: string): Results {
      const row = requireSession(id);
      return toResults(row, answerRepo.getBySession(id));
    },

    /**
     * Create a retake session (F5-T3, F5-T4).
     *
     * - `scope: "all"` → re-uses the origin snapshot unchanged (all questions fresh).
     * - `scope: "incorrect"` → filters the origin snapshot to keep only questions
     *   whose session_answers.is_correct = 0 OR is_revealed = 1 (incorrect+revealed).
     *   Throws 409 when no qualifying questions exist.
     *
     * The new session records `origin_session_id = originId` and the appropriate
     * `mode` ("retake_all" | "retake_incorrect"). Works from the stored snapshot
     * so it is immune to file changes (ADR-4).
     */
    retake(originId: string, input: RetakeInput): LiveSession {
      const origin = requireSession(originId);
      const originAnswers = answerRepo.getBySession(originId);

      // Index origin answers by question id for O(1) lookup.
      const answerById = new Map<number, typeof originAnswers[number]>();
      for (const a of originAnswers) answerById.set(a.question_id, a);

      const originSnapshot = JSON.parse(origin.question_snapshot) as SnapshotQuestion[];

      let snapshot: SnapshotQuestion[];
      const mode: "retake_all" | "retake_incorrect" = input.scope === "all"
        ? "retake_all"
        : "retake_incorrect";

      if (input.scope === "all") {
        // Re-use all questions from the origin snapshot, reset `order` in case the
        // origin was already a filtered retake.
        snapshot = originSnapshot.map((q, idx) => ({ ...q, order: idx + 1 }));
      } else {
        // Keep only questions that are incorrect (is_correct = 0, not revealed, had a
        // selection) or revealed (is_revealed = 1). Unanswered questions (is_correct = 0
        // but selected_options = '[]') are excluded — the learner skipped them. A
        // question with no answer row is excluded.
        const qualifying = originSnapshot.filter((q) => {
          const ans = answerById.get(q.id);
          if (!ans) return false;
          const isRevealed = ans.is_revealed === 1;
          if (isRevealed) return true;
          // Incorrect: graded wrong (is_correct = 0) AND the learner actually answered
          // (selected_options is not empty). Unanswered get is_correct=0 but should not
          // appear in a "retake incorrect" set.
          const selected = safeParseArray(ans.selected_options);
          const isIncorrect = ans.is_correct === 0 && selected.length > 0;
          return isIncorrect;
        });

        if (qualifying.length === 0) {
          throw new AppError(
            "SETS_EXHAUSTED",
            "No incorrect or revealed questions to retake in this session",
            409,
          );
        }

        snapshot = qualifying.map((q, idx) => ({ ...q, order: idx + 1 }));
      }

      // Apply optional option shuffle (question shuffle is skipped since the
      // snapshot is already in the origin's order or the qualifying subset order;
      // callers may add shuffleQuestions support here in a future iteration).
      const settings = getSettings();
      const seed = generateSeed();
      const shuffleOptions =
        input.options?.shuffleOptions ?? settings.shuffle_options;

      if (shuffleOptions) {
        snapshot = snapshot.map((q) => {
          const optRng = createSeededRng(`${seed}:q${q.id}`);
          return { ...q, optionOrder: optRng.shuffle(Object.keys(q.options)) };
        });
      }

      const timerEnabled =
        input.options?.timerEnabled ?? origin.timer_enabled === 1;
      let timerLimitMs: number | null = null;
      if (timerEnabled) {
        if (input.options?.timerMinutes !== undefined && input.options.timerMinutes !== null) {
          timerLimitMs = Math.round(input.options.timerMinutes * 60_000);
        } else if (origin.timer_limit_ms != null) {
          // Scale the limit proportionally to the subset size.
          const ratio = snapshot.length / origin.total_questions;
          timerLimitMs = Math.round(origin.timer_limit_ms * ratio);
        } else {
          timerLimitMs = Math.round(DEFAULT_TIMER_MINUTES * 60_000);
        }
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      const create = sessionRepo.db.transaction(() => {
        sessionRepo.insert({
          id,
          quesPath: origin.ques_path,
          domainLabel: origin.domain_label,
          setId: origin.set_id,
          setTitle: origin.set_title,
          difficulty: origin.difficulty,
          questionSnapshot: JSON.stringify(snapshot),
          totalQuestions: snapshot.length,
          timerEnabled,
          timerLimitMs,
          shuffleSeed: seed,
          mode,
          originSessionId: originId,
          createdAt: now,
        });
        answerRepo.insertBlanks(
          id,
          snapshot.map((q) => q.id),
        );
      });
      create();

      return this.getSession(id);
    },

    /**
     * Discard an in-progress session (F4-T13). Soft-discard: marks the session
     * `status = 'discarded'` (preserving the row for history) and does NOT
     * record it in `set_completion`. This:
     *   - Removes it from the in-progress gate on the home page
     *     (`inProgressCount` filters by `status = 'in_progress'`).
     *   - Allows the user to start a new exam for the same set from `/`.
     *   - Keeps the row in the history endpoint so the user can see what they
     *     abandoned (it is excluded from the standard completed-session history
     *     query by the `status = 'completed'` filter in sessionRepo.listCompleted).
     *
     * Answers are cascade-deleted via FK so the discarded row is lean.
     *
     * 409 if already completed (history has its own delete).
     */
    discard(id: string): void {
      const row = requireSession(id);
      if (row.status === "completed") {
        throw new AppError(
          "SESSION_ALREADY_COMPLETED",
          `Session ${id} is completed; discard is only for in-progress sessions`,
          409,
        );
      }
      if (row.status === "discarded") {
        // Idempotent — silently no-op.
        return;
      }
      // Soft-discard: flip status, cascade-delete answers so the row is lean.
      const now = new Date().toISOString();
      sessionRepo.db.transaction(() => {
        sessionRepo.patch(id, {
          status: "discarded",
          completedAt: now, // wall-clock when the user gave up
        });
        // Delete per-question answer rows via cascade; do it explicitly here so
        // the discarded session does not inflate storage with stale answers.
        sessionRepo.db
          .prepare("DELETE FROM session_answers WHERE session_id = ?")
          .run(id);
      })();
    },
  };
}

export type ExamEngine = ReturnType<typeof createExamEngine>;
