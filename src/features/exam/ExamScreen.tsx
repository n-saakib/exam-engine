"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Spinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { useExamSession } from "@/hooks/useExamSession";
import { useSettings } from "@/hooks/useSettings";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useExamStore, type ExamStore } from "@/store/examStore";

import { ProgressBar } from "./ProgressBar";
import { ExamTimer } from "./ExamTimer";
import { QuestionPanel } from "./QuestionPanel";
import { QuestionNavigator } from "./QuestionNavigator";
import { SubmitExamDialog } from "./SubmitExamDialog";
import {
  FlagButton,
  GiveUpButton,
  PauseButton,
  PrevButton,
  SubmitOrNextButton,
} from "./ExamControls";

/**
 * The exam screen (F4-T15). Fetches the session ONCE via React Query, hydrates
 * the Zustand store (authoritative thereafter), and composes the core loop.
 *
 *   - Guard: status !== 'in_progress' ⇒ redirect to /results/:id.
 *   - beforeunload + sendBeacon/keepalive flush on hard tab-close (09 §7.3).
 *   - Route-leave flush: App Router exposes no official blocking-navigation
 *     API, and autosave already makes leaving safe, so we force a flush on
 *     unmount (covers in-app navigation) while `beforeunload` covers full-page
 *     reloads/closes. (A confirm-before-leave prompt can layer on later via a
 *     wrapped <Link>; the data-safety flush is the load-bearing part.)
 *   - Auto-submit on timer expiry (default; 09 §7.1).
 *
 * `store` is injectable for tests; defaults to the live singleton.
 */
export function ExamScreen({
  sessionId,
  store = useExamStore,
}: {
  sessionId: string;
  store?: ExamStore;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const settingsQuery = useSettings();
  const progressiveReveal = settingsQuery.data?.progressive_reveal ?? false;

  const { data, isLoading, isError, error } = useExamSession(sessionId);

  const loadFromDTO = store((s) => s.loadFromDTO);
  const status = store((s) => s.status);
  const storeSessionId = store((s) => s.sessionId);
  const submitted = store((s) => s.submitted);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const submittingRef = useRef(false);

  // ── Hydrate the store once per fetched session ───────────────────────────
  useEffect(() => {
    if (data && data.id === sessionId && storeSessionId !== data.id) {
      loadFromDTO(data);
    }
  }, [data, sessionId, storeSessionId, loadFromDTO]);

  // ── Guard: non-in-progress sessions redirect to results ──────────────────
  useEffect(() => {
    if (data && data.status !== "in_progress") {
      router.replace(`/results/${sessionId}`);
    }
  }, [data, sessionId, router]);

  // ── beforeunload flush (hard tab-close) ──────────────────────────────────
  useEffect(() => {
    const teardown = store.getState().registerUnloadFlush();
    return teardown;
  }, [store]);

  // ── Flush pending autosave on unmount (route-leave safety) ───────────────
  useEffect(() => {
    return () => {
      void store.getState().flushNow();
    };
  }, [store]);

  // ── Focus the question heading on navigation (a11y, 08 §6) ────────────────
  const currentIndex = store((s) => s.currentIndex);
  useEffect(() => {
    headingRef.current?.focus();
  }, [currentIndex]);

  // ── Submit (shared by dialog + expiry auto-submit) ───────────────────────
  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      try {
        const id = await store.getState().submit();
        if (auto) {
          toast({
            title: "Time's up",
            description: "Your exam was submitted automatically.",
            variant: "warning",
          });
        }
        router.replace(`/results/${id}`);
      } catch {
        submittingRef.current = false;
        toast({
          title: "Submit failed",
          description: "Could not submit the exam. Please try again.",
          variant: "danger",
        });
      }
    },
    [store, router, toast],
  );

  const onExpire = useCallback(() => {
    void doSubmit(true);
  }, [doSubmit]);

  // After the submit dialog resolves successfully, navigate.
  const onSubmitted = useCallback(
    (id: string) => {
      router.replace(`/results/${id}`);
    },
    [router],
  );

  // ── Keyboard shortcuts (seam) ────────────────────────────────────────────
  useKeyboardShortcuts(
    {
      onNext: () => {
        const s = store.getState();
        s.goTo(s.currentIndex + 1);
      },
      onPrev: () => {
        const s = store.getState();
        s.goTo(s.currentIndex - 1);
      },
      onFlag: () => {
        const s = store.getState();
        const q = s.questions[s.currentIndex];
        if (q) s.toggleFlag(q.id);
      },
      onGiveUp: () => {
        const s = store.getState();
        const q = s.questions[s.currentIndex];
        if (q && !s.answers[q.id]?.revealed) void s.reveal(q.id);
      },
      onSelectIndex: (index) => {
        const s = store.getState();
        const q = s.questions[s.currentIndex];
        if (!q) return;
        const keys =
          q.optionOrder && q.optionOrder.length > 0
            ? q.optionOrder.filter((k) => k in q.options)
            : Object.keys(q.options);
        const key = keys[index];
        if (key) s.select(q.id, key);
      },
      onAdvance: () => {
        const s = store.getState();
        if (s.currentIndex >= s.questions.length - 1) setSubmitOpen(true);
        else s.goTo(s.currentIndex + 1);
      },
    },
    !!storeSessionId && status === "in_progress",
  );

  // ── Render states ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          title="Couldn't load this exam"
          description={error instanceof Error ? error.message : "Unknown error."}
        />
      </div>
    );
  }

  // While redirecting a non-in-progress session, render nothing.
  if (data && data.status !== "in_progress") {
    return null;
  }

  if (!storeSessionId || submitted) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <ProgressBar store={store} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ExamTimer store={store} onExpire={onExpire} />
          <div className="flex items-center gap-2">
            <PauseButton store={store} onPaused={() => router.push("/resume")} />
            <GiveUpButton store={store} />
          </div>
        </div>
      </header>

      <QuestionPanel
        ref={headingRef}
        store={store}
        progressiveReveal={progressiveReveal}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <PrevButton store={store} />
        <div className="flex items-center gap-2">
          <FlagButton store={store} />
          <SubmitOrNextButton store={store} onRequestSubmit={() => setSubmitOpen(true)} />
        </div>
      </div>

      <QuestionNavigator store={store} />

      <SubmitExamDialog
        store={store}
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        onSubmitted={onSubmitted}
      />
    </div>
  );
}
