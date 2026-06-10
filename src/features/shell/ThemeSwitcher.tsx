"use client";

import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import type { Theme } from "@/domain/types";

const THEME_OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Theme selector control (F1-T9). Renders three buttons (System / Light / Dark)
 * that persist the choice via PATCH /api/settings. Placed in the SettingsScreen
 * (F8); can also be embedded in the MenuBar as a quick toggle.
 */
export function ThemeSwitcher() {
  const { data: settings } = useSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();
  const current: Theme = settings?.theme ?? "system";

  return (
    <fieldset disabled={isPending}>
      <legend className="sr-only">Theme</legend>
      <div
        className="inline-flex rounded-card border border-border bg-bg p-0.5"
        role="radiogroup"
        aria-label="Theme"
      >
        {THEME_OPTIONS.map(({ value, label }) => (
          <label key={value} className="cursor-pointer">
            <input
              type="radio"
              className="sr-only"
              name="theme"
              value={value}
              checked={current === value}
              onChange={() => updateSettings({ theme: value })}
            />
            <span
              aria-hidden="true"
              className={
                current === value
                  ? "inline-flex items-center rounded-[calc(var(--radius-card)-2px)] bg-brand px-3 py-1 text-xs font-semibold text-brand-fg"
                  : "inline-flex items-center rounded-[calc(var(--radius-card)-2px)] px-3 py-1 text-xs font-medium text-muted hover:text-fg"
              }
            >
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
