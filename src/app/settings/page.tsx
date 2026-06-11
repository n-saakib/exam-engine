"use client";

import { SourceSettings } from "@/features/settings/SourceSettings";
import { ExamDefaultsSettings } from "@/features/settings/ExamDefaultsSettings";
import { DataManagement } from "@/features/settings/DataManagement";
import { CatalogDiagnostics } from "@/features/settings/CatalogDiagnostics";
import { AppearanceSettings } from "@/features/settings/AppearanceSettings";

/**
 * Settings screen (F8). Sections:
 * 1. Source Settings   — Exams root path + filesystem/upload mode + rescan
 * 2. Exam Defaults     — timer, shuffle, show-count, progressive-reveal
 * 3. Data Management   — export + reset flows (all behind confirm dialogs)
 * 4. Catalog Diagnostics — problem files list + rescan
 * 5. Appearance        — theme selector (F1 ThemeSwitcher integrated here)
 */
export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold text-fg">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Configure question sources, exam defaults, and manage your data.
      </p>

      <SourceSettings />
      <ExamDefaultsSettings />
      <DataManagement />
      <CatalogDiagnostics />
      <AppearanceSettings />
    </div>
  );
}
