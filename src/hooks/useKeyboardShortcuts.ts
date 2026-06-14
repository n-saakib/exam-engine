"use client";

import { useEffect } from "react";

/**
 * Exam keyboard shortcuts (04 §9 / F4-T26). This wires the seam now; the full
 * discoverable cheat-sheet ships per the roadmap. Scoped to the exam screen:
 * mount it from <ExamScreen> and pass handlers built from store actions.
 *
 *   1–4 / A–D : select option by position
 *   Enter     : next / submit (onAdvance)
 *   N / P     : next / previous question
 *   F         : flag current question
 *   G         : give up (no selection) / submit (with selection)
 *
 * Keystrokes are ignored while focus is in an editable field so they never
 * hijack typing.
 */
export interface ExamShortcutHandlers {
  /** Select the option at this zero-based position in the displayed order. */
  onSelectIndex?: (index: number) => void;
  onNext?: () => void;
  onPrev?: () => void;
  onAdvance?: () => void; // Enter → next/submit
  onFlag?: () => void;
  onGiveUp?: () => void;
}

const LETTER_INDEX: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 };

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts(
  handlers: ExamShortcutHandlers,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      const key = e.key;
      const lower = key.toLowerCase();

      // 1–6 select by number
      if (/^[1-6]$/.test(key)) {
        handlers.onSelectIndex?.(Number(key) - 1);
        return;
      }
      // A–F select by letter (avoid clobbering F=flag: letters only select when
      // they map to an option index; F still flags via the explicit branch below
      // when there is no select handler). We prioritise option-letters A–E for
      // selection and reserve F/G/N/P for actions.
      if (lower === "f") {
        handlers.onFlag?.();
        return;
      }
      if (lower === "g") {
        handlers.onGiveUp?.();
        return;
      }
      if (lower === "n") {
        handlers.onNext?.();
        return;
      }
      if (lower === "p") {
        handlers.onPrev?.();
        return;
      }
      if (lower in LETTER_INDEX && lower !== "f") {
        handlers.onSelectIndex?.(LETTER_INDEX[lower]);
        return;
      }
      if (key === "Enter") {
        handlers.onAdvance?.();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers, enabled]);
}
