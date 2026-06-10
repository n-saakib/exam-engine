"use client";

import { Card } from "@/components/Card";
import { ThemeSwitcher } from "@/features/shell/ThemeSwitcher";

/**
 * Settings screen placeholder. The Appearance section (theme) is wired in F1;
 * the rest of the settings UI lands in F8.
 */
export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold text-fg">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        App preferences. Full settings UI lands in F8.
      </p>

      <Card className="mt-6">
        <h2 className="text-base font-semibold text-fg">Appearance</h2>
        <p className="mt-1 text-sm text-muted">
          Choose your preferred colour scheme.
        </p>
        <div className="mt-3">
          <ThemeSwitcher />
        </div>
      </Card>
    </div>
  );
}
