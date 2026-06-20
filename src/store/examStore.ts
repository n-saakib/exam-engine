"use client";

import { create, type StoreApi, type UseBoundStore } from "zustand";

import { apiClient } from "@/lib/apiClient";
import type {
  LiveAnswer,
  LiveQuestion,
  LiveSession,
  PatchAnswer,
  PatchSessionBody,
} from "@/domain/types";

/**
 * The ephemeral exam-session store (04 §8, 09 §7.1/§7.3). It is the single
 * authority for the live exam: React Query fetches the `LiveSession` ONCE, the
 * store hydrates from it, and thereafter the store drives the UI and pushes
 * **debounced autosave** PATCHes back to the server. Nothing on the hot path
 * waits for the network.
 *
 * Autosave model:
 *   - Every mutating action marks fields dirty and schedules a debounced flush
 *     (~400 ms). A flush sends only the changed fields plus the ABSOLUTE
 *     `elapsedMs` (replace semantics — idempotent on retry; 09 §7.1).
 *   - `commit()`, `pause()`, `submit()` and route-leave FORCE an immediate flush
 *     (cancel the pending debounce, fire now). `commit()` additionally merges
 *     the server's returned correct answer / explanations / Tips into the
 *     question, since those are only present post-commit.
 *   - A `beforeunload` handler flushes pending state via `navigator.sendBeacon`
 *     (fallback: `fetch(..., { keepalive: true })`) so a hard tab-close still
 *     persists (09 §7.3).
 *
 * Selector discipline (08 §6): `tick()` mutates only `timer.elapsedMs`; only
 * `<ExamTimer>` subscribes to it, so the 1 Hz tick never re-renders the screen.
 */

export const AUTOSAVE_DEBOUNCE_MS = 400;

/** Per-question answer state, keyed by `question.id` in `answers`. */
export interface AnswerState {
  selected: string[];
  flagged: boolean;
  /**
   * True once the user has committed an answer (submit or give-up). The
   * question's correctAnswer / explanations / Tips become visible on the next
   * flush response. Monotonic: once true it stays true.
   */
  committed: boolean;
  /** True once the user explicitly gives up on this question. */
  gaveUp: boolean;
  timeSpentMs: number;
}

export interface TimerState {
  enabled: boolean;
  limitMs?: number | null;
  elapsedMs: number;
  running: boolean;
  expired: boolean;
}

/** The set of changes awaiting the next flush. `answers` is keyed by qid. */
interface PendingPatch {
  currentIndex?: number;
  elapsedMs?: number;
  answers: Map<number, PatchAnswer>;
}

export interface ExamStoreState {
  sessionId: string | null;
  status: LiveSession["status"] | null;
  questions: LiveQuestion[];
  currentIndex: number;
  answers: Record<number, AnswerState>;
  timer: TimerState;
  /** True once a flush is in flight, exposed for optional UI ("Saving…"). */
  saving: boolean;
  /** True after submit() resolves; consumers navigate to /results/:id. */
  submitted: boolean;

  // ── actions ──────────────────────────────────────────────────────────────
  loadFromDTO(dto: LiveSession): void;
  select(qid: number, option: string): void;
  toggleFlag(qid: number): void;
  commit(qid: number, options?: { gaveUp?: boolean }): Promise<void>;
  goTo(index: number): void;
  tick(deltaMs: number): void;
  pause(): Promise<void>;
  resumeTicking(): void;
  /** Force-flush, POST submit, mark submitted; returns the session id. */
  submit(): Promise<string>;
  /** Cancel debounce + flush now (route-leave). Safe to call when nothing dirty. */
  flushNow(): Promise<void>;
  /** Wire the beforeunload handler; returns a teardown fn. */
  registerUnloadFlush(): () => void;
  /** Test/teardown helper: clear timers + dirty state. */
  reset(): void;
}

export type ExamStore = UseBoundStore<StoreApi<ExamStoreState>>;

function emptyPending(): PendingPatch {
  return { answers: new Map() };
}

function liveAnswerToState(a: LiveAnswer): AnswerState {
  return {
    selected: [...a.selected],
    flagged: a.flagged,
    committed: a.committed,
    gaveUp: a.gaveUp ?? false,
    timeSpentMs: a.timeSpentMs,
  };
}

/**
 * Factory so each exam screen (and each test) gets an isolated store with its
 * own debounce timer + pending buffer. The default export is a process-wide
 * singleton used by the live screen.
 */
export function createExamStore(): ExamStore {
  // Module-private mutable bag — debounce handle + dirty buffer live OUTSIDE
  // React state so they never trigger renders.
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  let pending: PendingPatch = emptyPending();
  let flushChain: Promise<void> = Promise.resolve();

  const store = create<ExamStoreState>((set, get) => {
    /** Merge a per-question patch into the pending buffer (latest wins per field). */
    function queueAnswer(qid: number, patch: Omit<PatchAnswer, "questionId">): void {
      const existing = pending.answers.get(qid) ?? { questionId: qid };
      pending.answers.set(qid, { ...existing, ...patch, questionId: qid });
    }

    function queueIndex(index: number): void {
      pending.currentIndex = index;
    }

    function clearDebounce(): void {
      if (debounceHandle !== null) {
        clearTimeout(debounceHandle);
        debounceHandle = null;
      }
    }

    function scheduleFlush(): void {
      clearDebounce();
      debounceHandle = setTimeout(() => {
        debounceHandle = null;
        void doFlush();
      }, AUTOSAVE_DEBOUNCE_MS);
    }

    /** Drain the pending buffer into a PATCH body. Returns null when nothing to send. */
    function drainBody(): PatchSessionBody[] {
      const { timer } = get();
      const bodies: PatchSessionBody[] = [];
      const base: PatchSessionBody = {};
      let hasBase = false;
      if (pending.currentIndex !== undefined) {
        base.currentIndex = pending.currentIndex;
        hasBase = true;
      }
      // Always report absolute elapsed when the timer is enabled or has ticked.
      if (pending.elapsedMs !== undefined || timer.elapsedMs > 0) {
        base.elapsedMs = timer.elapsedMs;
        hasBase = true;
      }
      // Each PATCH carries a single `answer`; emit one body per dirty question,
      // folding currentIndex/elapsedMs onto the first.
      const answerPatches = [...pending.answers.values()];
      if (answerPatches.length === 0) {
        if (hasBase) bodies.push(base);
        return bodies;
      }
      answerPatches.forEach((answer, i) => {
        if (i === 0 && hasBase) {
          bodies.push({ ...base, answer });
        } else {
          bodies.push({ answer });
        }
      });
      return bodies;
    }

    /** Send all pending changes now. Serialised so PATCHes never overlap. */
    function doFlush(): Promise<void> {
      const sessionId = get().sessionId;
      if (!sessionId) return Promise.resolve();
      const bodies = drainBody();
      pending = emptyPending();
      if (bodies.length === 0) return Promise.resolve();

      set({ saving: true });
      flushChain = flushChain
        .catch(() => undefined)
        .then(async () => {
          for (const body of bodies) {
            const updated = await apiClient.patch<LiveSession>(
              `/sessions/${sessionId}`,
              { json: body },
            );
            mergeServerTimer(updated);
          }
        })
        .catch(() => {
          // Autosave is best-effort; failures are non-fatal (next mutation
          // re-queues). beforeunload covers the hard-close case.
        })
        .finally(() => {
          if (get().sessionId) set({ saving: false });
        });
      return flushChain;
    }

    /**
     * Reconcile server-side timer clamp/expiry WITHOUT stomping the live tick.
     * The client owns the tick (09 §7.1): the server echoes the absolute
     * `elapsedMs` we sent (clamped to the limit). We only adopt the server
     * value when it signals a genuine clamp at the limit (expiry) — never a
     * stale/lower value — so the live countdown keeps running smoothly.
     */
    function mergeServerTimer(updated: LiveSession): void {
      set((s) => {
        const serverExpired = updated.timer.expired ?? false;
        const limit = s.timer.enabled ? s.timer.limitMs ?? null : null;
        const clampToLimit =
          serverExpired && limit !== null && updated.timer.elapsedMs <= limit;
        return {
          timer: {
            ...s.timer,
            expired: serverExpired || s.timer.expired,
            running: serverExpired ? false : s.timer.running,
            elapsedMs: clampToLimit ? updated.timer.elapsedMs : s.timer.elapsedMs,
          },
        };
      });
    }

    return {
      sessionId: null,
      status: null,
      questions: [],
      currentIndex: 0,
      answers: {},
      timer: { enabled: false, limitMs: null, elapsedMs: 0, running: false, expired: false },
      saving: false,
      submitted: false,

      loadFromDTO(dto) {
        clearDebounce();
        pending = emptyPending();
        const answers: Record<number, AnswerState> = {};
        for (const q of dto.questions) {
          answers[q.id] = liveAnswerToState(q.answer);
        }
        set({
          sessionId: dto.id,
          status: dto.status,
          questions: dto.questions,
          currentIndex: dto.currentIndex,
          answers,
          timer: {
            enabled: dto.timer.enabled,
            limitMs: dto.timer.limitMs ?? null,
            elapsedMs: dto.timer.elapsedMs,
            running: dto.status === "in_progress",
            expired: dto.timer.expired ?? false,
          },
          submitted: false,
        });
      },

      select(qid, option) {
        const cur = get().answers[qid];
        if (!cur || cur.committed) return; // locked once committed
        // Multi-select (checkbox) semantics: clicking a selected option removes
        // it; clicking an unselected option appends it. The UI is a checkbox
        // group for BOTH `single` and `multi` question types, and the user is
        // never told which is which (see ADR-13). For a `single`-typed question,
        // picking more than one option will cause the grader to mark it
        // `incorrect` (the set-equality test requires the user's set to equal
        // the singleton correct set) — this is the intended pedagogical
        // behaviour: trains choice elimination.
        const selected = cur.selected.includes(option)
          ? cur.selected.filter((k) => k !== option)
          : [...cur.selected, option];
        set((s) => ({
          answers: { ...s.answers, [qid]: { ...cur, selected } },
        }));
        queueAnswer(qid, { selected });
        scheduleFlush();
      },

      toggleFlag(qid) {
        const cur = get().answers[qid];
        if (!cur) return;
        const flagged = !cur.flagged;
        set((s) => ({ answers: { ...s.answers, [qid]: { ...cur, flagged } } }));
        queueAnswer(qid, { flagged });
        scheduleFlush();
      },

      async commit(qid, options) {
        const cur = get().answers[qid];
        if (!cur || cur.committed) return; // monotonic / irreversible
        // gaveUp is sticky: only set to true here, and only when the caller
        // explicitly opts in via `options.gaveUp`. Once true it stays true.
        const gaveUpRequested = options?.gaveUp === true;
        const nextGaveUp = cur.gaveUp || gaveUpRequested;
        set((s) => ({
          answers: { ...s.answers, [qid]: { ...cur, committed: true, gaveUp: nextGaveUp } },
        }));
        // Cancel pending debounce; fold commit into a forced immediate flush so
        // the server returns this question's correct answer + explanations.
        clearDebounce();
        queueAnswer(qid, { committed: true });
        if (gaveUpRequested && !cur.gaveUp) {
          queueAnswer(qid, { gaveUp: true });
        }
        const sessionId = get().sessionId;
        if (!sessionId) return;
        const bodies = drainBody();
        pending = emptyPending();
        set({ saving: true });
        flushChain = flushChain
          .catch(() => undefined)
          .then(async () => {
            let merged: LiveSession | null = null;
            for (const body of bodies) {
              merged = await apiClient.patch<LiveSession>(`/sessions/${sessionId}`, {
                json: body,
              });
            }
            if (merged) {
              mergeServerTimer(merged);
              // Merge the now-committed question's correct data.
              const fresh = merged.questions.find((q) => q.id === qid);
              if (fresh) {
                set((s) => ({
                  questions: s.questions.map((q) =>
                    q.id === qid
                      ? {
                          ...q,
                          correctAnswer: fresh.correctAnswer,
                          explanations: fresh.explanations,
                          Tips: fresh.Tips,
                        }
                      : q,
                  ),
                }));
              }
            }
          })
          .catch(() => undefined)
          .finally(() => {
            if (get().sessionId) set({ saving: false });
          });
        await flushChain;
      },

      goTo(index) {
        const { questions } = get();
        if (index < 0 || index >= questions.length) return;
        set({ currentIndex: index });
        queueIndex(index);
        scheduleFlush();
      },

      tick(deltaMs) {
        const { timer } = get();
        if (!timer.running) return;
        const next = timer.elapsedMs + deltaMs;
        const limit = timer.enabled ? timer.limitMs ?? null : null;
        if (limit !== null && next >= limit) {
          set({ timer: { ...timer, elapsedMs: limit, running: false, expired: true } });
          return;
        }
        set({ timer: { ...timer, elapsedMs: next } });
        // Elapsed is flushed (absolute) lazily with the next debounce/flush.
        pending.elapsedMs = next;
      },

      async pause() {
        set((s) => ({ timer: { ...s.timer, running: false } }));
        await get().flushNow();
      },

      resumeTicking() {
        set((s) => ({
          timer: { ...s.timer, running: !s.timer.expired },
        }));
      },

      async submit() {
        const sessionId = get().sessionId;
        if (!sessionId) throw new Error("submit() called with no session");
        set((s) => ({ timer: { ...s.timer, running: false } }));
        await get().flushNow();
        await flushChain.catch(() => undefined);
        await apiClient.post(`/sessions/${sessionId}/submit`, {
          json: { elapsedMs: get().timer.elapsedMs },
        });
        set({ submitted: true, status: "completed" });
        return sessionId;
      },

      async flushNow() {
        clearDebounce();
        await doFlush();
        await flushChain.catch(() => undefined);
      },

      registerUnloadFlush() {
        if (typeof window === "undefined") return () => undefined;
        const handler = () => {
          const sessionId = get().sessionId;
          if (!sessionId) return;
          clearDebounce();
          const bodies = drainBody();
          pending = emptyPending();
          if (bodies.length === 0) return;
          const url = `/api/sessions/${sessionId}`;
          for (const body of bodies) {
            const payload = JSON.stringify(body);
            // PATCH via keepalive fetch is the correctness path (the route is
            // PATCH-only; sendBeacon would arrive as POST). sendBeacon is the
            // documented fallback (09 §7.3) for browsers that drop in-flight
            // keepalive fetches during teardown.
            let sent = false;
            try {
              void fetch(url, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: payload,
                keepalive: true,
              }).catch(() => undefined);
              sent = true;
            } catch {
              sent = false;
            }
            if (!sent && typeof navigator !== "undefined" && navigator.sendBeacon) {
              try {
                navigator.sendBeacon(
                  url,
                  new Blob([payload], { type: "application/json" }),
                );
              } catch {
                // best-effort only
              }
            }
          }
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
      },

      reset() {
        clearDebounce();
        pending = emptyPending();
        flushChain = Promise.resolve();
      },
    };
  });

  return store;
}

/** Process-wide singleton consumed by the live <ExamScreen>. */
export const useExamStore: ExamStore = createExamStore();
