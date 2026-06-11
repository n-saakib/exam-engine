"use client";

import { Card } from "@/components/Card";
import { ThemeSwitcher } from "@/features/shell/ThemeSwitcher";

/**
 * Appearance section: theme selector. Reuses F1's ThemeSwitcher.
 */
export function AppearanceSettings() {
  return (
    <Card className="mt-6">
      <h2 className="text-base font-semibold text-fg">Appearance</h2>
      <p className="mt-1 text-sm text-muted">
        Choose your preferred colour scheme.
      </p>
      <div className="mt-3">
        <ThemeSwitcher />
      </div>
    </Card>
  );
}
