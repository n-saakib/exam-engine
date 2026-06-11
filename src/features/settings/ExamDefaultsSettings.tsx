"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useToast } from "@/components/Toast";
import type { SettingsPatch } from "@/domain/types";

/**
 * Exam defaults section: timer on/off + default minutes, show-count-before-start,
 * shuffle questions/options, progressive reveal. Each change persists immediately
 * via PATCH /api/settings and drives F4 session creation.
 *
 * Rather than maintaining a local mirror of all settings (which requires a
 * useEffect + setState sync and triggers lint warnings), we read the authoritative
 * value from React Query and only hold an uncontrolled draft for the timer-minutes
 * text field (which needs blur-save semantics).
 */
export function ExamDefaultsSettings() {
  const { data: settings } = useSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();
  const { toast } = useToast();

  // Timer-minutes draft: tracks the text-field value until blur.
  // Seeded from settings on first load via the controlled-uncontrolled dance below.
  const [timerMinutesDraft, setTimerMinutesDraft] = useState<string | undefined>(
    undefined,
  );

  // Derive displayed values from settings (with defaults while loading).
  const timerEnabled = settings?.timer_enabled ?? true;
  const showCount = settings?.show_count_before_start ?? true;
  const shuffleQuestions = settings?.shuffle_questions ?? false;
  const shuffleOptions = settings?.shuffle_options ?? false;
  const progressiveReveal = settings?.progressive_reveal ?? true;

  // Timer minutes: use the draft while the field is being edited, fall back to
  // the persisted value once settings load.
  const timerMinutesDisplay =
    timerMinutesDraft !== undefined
      ? timerMinutesDraft
      : settings?.timer_default_minutes != null
        ? String(settings.timer_default_minutes)
        : "";

  function save(patch: SettingsPatch) {
    updateSettings(patch, {
      onSuccess: () => {
        toast({ title: "Settings saved", variant: "success" });
      },
      onError: (err) => {
        toast({ title: "Failed to save", description: err.message, variant: "danger" });
      },
    });
  }

  function handleToggle(key: keyof SettingsPatch, current: boolean) {
    save({ [key]: !current });
  }

  function handleTimerMinutesBlur() {
    const raw = (timerMinutesDraft ?? "").trim();
    setTimerMinutesDraft(undefined); // clear draft so field reverts to settings value

    if (raw === "") {
      save({ timer_default_minutes: null });
      return;
    }
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      // Invalid input — discard draft, field reverts to last saved value
      return;
    }
    save({ timer_default_minutes: n });
  }

  return (
    <Card className="mt-6">
      <h2 className="text-base font-semibold text-fg">Exam Defaults</h2>
      <p className="mt-1 text-sm text-muted">
        Default settings applied when starting a new exam (can be overridden per session).
      </p>

      <fieldset disabled={isPending} className="mt-4 space-y-5">
        <legend className="sr-only">Exam default settings</legend>

        {/* Timer on/off */}
        <ToggleRow
          id="timer-enabled"
          label="Enable timer by default"
          description="New exams will start with a countdown timer."
          checked={timerEnabled}
          onChange={() => handleToggle("timer_enabled", timerEnabled)}
        />

        {/* Timer default minutes */}
        {timerEnabled && (
          <div className="ml-6">
            <label htmlFor="timer-minutes" className="block text-sm font-medium text-fg">
              Default minutes
            </label>
            <p className="mt-0.5 text-xs text-muted">
              Leave blank to derive from question count. Minimum 1.
            </p>
            <input
              id="timer-minutes"
              type="number"
              min="1"
              step="1"
              value={timerMinutesDisplay}
              onChange={(e) => setTimerMinutesDraft(e.target.value)}
              onBlur={handleTimerMinutesBlur}
              className="mt-2 w-28 rounded-card border border-border bg-bg px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="blank = auto"
            />
          </div>
        )}

        {/* Show count before start */}
        <ToggleRow
          id="show-count"
          label="Show question count before starting"
          description="Display the number of questions on the pre-exam screen."
          checked={showCount}
          onChange={() => handleToggle("show_count_before_start", showCount)}
        />

        {/* Shuffle questions */}
        <ToggleRow
          id="shuffle-questions"
          label="Shuffle question order"
          description="Randomise the question order for each new session."
          checked={shuffleQuestions}
          onChange={() => handleToggle("shuffle_questions", shuffleQuestions)}
        />

        {/* Shuffle options */}
        <ToggleRow
          id="shuffle-options"
          label="Shuffle answer options"
          description="Randomise the order of multiple-choice options."
          checked={shuffleOptions}
          onChange={() => handleToggle("shuffle_options", shuffleOptions)}
        />

        {/* Progressive reveal */}
        <ToggleRow
          id="progressive-reveal"
          label="Progressive reveal"
          description="Reveal the correct answer and explanation when submitting each question."
          checked={progressiveReveal}
          onChange={() => handleToggle("progressive_reveal", progressiveReveal)}
        />
      </fieldset>

      {isPending && (
        <p className="mt-2 text-xs text-muted" role="status" aria-live="polite">
          Saving...
        </p>
      )}
    </Card>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface ToggleRowProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}

function ToggleRow({ id, label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">
        <button
          id={id}
          role="switch"
          aria-checked={checked}
          onClick={onChange}
          className={[
            "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2",
            checked ? "bg-brand" : "bg-muted/30",
          ].join(" ")}
          aria-labelledby={`${id}-label`}
          aria-describedby={description ? `${id}-desc` : undefined}
          type="button"
        >
          <span className="sr-only">{label}</span>
          <span
            aria-hidden="true"
            className={[
              "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
              checked ? "translate-x-4" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </div>
      <div>
        <label id={`${id}-label`} htmlFor={id} className="text-sm font-medium text-fg cursor-pointer">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-xs text-muted mt-0.5">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
