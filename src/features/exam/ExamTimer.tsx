"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";
import type { ExamStore } from "@/store/examStore";

/**
 * The timer display + tick driver (F4-T21, 09 §7.1). It is the ONLY subscriber
 * to `timer.elapsedMs`, so the 1 Hz tick never re-renders the rest of the
 * screen (08 §6 selector discipline). The client owns the tick; pausing stops
 * it; at expiry (server `expired` or local countdown ≤ 0) it auto-submits.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function ExamTimer({
  store,
  onExpire,
}: {
  store: ExamStore;
  onExpire?: () => void;
}) {
  const enabled = store((s) => s.timer.enabled);
  const limitMs = store((s) => s.timer.limitMs);
  const elapsedMs = store((s) => s.timer.elapsedMs);
  const running = store((s) => s.timer.running);
  const expired = store((s) => s.timer.expired);
  const tick = store((s) => s.tick);

  const expiredFired = useRef(false);

  // 1 Hz tick while running. Cleared on pause/unmount.
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => tick(1000), 1000);
    return () => clearInterval(interval);
  }, [running, tick]);

  // Auto-submit once on expiry.
  useEffect(() => {
    if (expired && !expiredFired.current) {
      expiredFired.current = true;
      onExpire?.();
    }
  }, [expired, onExpire]);

  const timed = enabled && typeof limitMs === "number";
  const remaining = timed ? Math.max(0, (limitMs as number) - elapsedMs) : 0;
  const display = timed ? formatDuration(remaining) : formatDuration(elapsedMs);
  const low = timed && remaining <= 60_000;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-1.5 text-sm font-medium tabular-nums",
        low && "border-incorrect text-incorrect",
        expired && "border-incorrect text-incorrect",
      )}
      role="timer"
      aria-live="off"
      aria-label={
        timed
          ? `Time remaining ${display}${expired ? ", expired" : ""}`
          : `Time elapsed ${display}`
      }
    >
      <span aria-hidden="true">{timed ? "⏳" : "⏱"}</span>
      <span>{display}</span>
      {!running && !expired ? (
        <span className="text-xs text-muted">(paused)</span>
      ) : null}
    </div>
  );
}
