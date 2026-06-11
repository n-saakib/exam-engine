import "server-only";

import type { Database } from "better-sqlite3";

import type { Settings, SettingsPatch } from "@/domain/types";
import { config } from "@/server/config";

/**
 * Canonical settings defaults (02 §4). Used to seed the response when keys are
 * absent from the DB — `getAll()` merges DB rows on top of these defaults so the
 * client always receives the full Settings object.
 */
export const SETTINGS_DEFAULTS: Settings = {
  exams_root: config.examsRoot,
  source_mode: "filesystem",
  timer_enabled: true,
  timer_default_minutes: null,
  show_count_before_start: true,
  shuffle_questions: false,
  shuffle_options: false,
  progressive_reveal: true,
  theme: "system",
  last_selected_path: [],
  schema_version_seen: 0,
};

interface SettingsRow {
  key: string;
  value: string;
}

/**
 * Read all settings from the DB, merging with canonical defaults for any keys
 * not yet persisted. Seed-on-first-read: the full object is always returned.
 */
export function getAllSettings(db: Database): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as SettingsRow[];

  const fromDb: Partial<Settings> = {};
  for (const row of rows) {
    try {
      (fromDb as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {
      // Corrupt value — skip; default applies.
    }
  }

  return { ...SETTINGS_DEFAULTS, ...fromDb };
}

/**
 * Delete all settings rows, restoring factory defaults on next read.
 * Used by the "factory reset" scope.
 */
export function resetSettings(db: Database): void {
  db.prepare("DELETE FROM settings").run();
}

/**
 * Upsert only the provided keys. Values are JSON-encoded.
 * Returns the full settings object after the update.
 */
export function patchSettings(db: Database, patch: SettingsPatch): Settings {
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );

  const runAll = db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      upsert.run(key, JSON.stringify(value));
    }
  });
  runAll();

  return getAllSettings(db);
}
