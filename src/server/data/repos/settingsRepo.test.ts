import { afterEach, describe, expect, it } from "vitest";

import { makeTestDb } from "@/server/test/makeTestDb";
import { getAllSettings, patchSettings, SETTINGS_DEFAULTS } from "./settingsRepo";

describe("settingsRepo", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("getAll returns canonical defaults on a fresh DB (no rows)", () => {
    const testDb = makeTestDb();
    cleanup = testDb.cleanup;

    const settings = getAllSettings(testDb.db);

    expect(settings.theme).toBe("system");
    expect(settings.source_mode).toBe("filesystem");
    expect(settings.timer_enabled).toBe(true);
    expect(settings.timer_default_minutes).toBeNull();
    expect(settings.show_count_before_start).toBe(true);
    expect(settings.shuffle_questions).toBe(false);
    expect(settings.shuffle_options).toBe(false);
    expect(settings.progressive_reveal).toBe(true);
    expect(Array.isArray(settings.last_selected_path)).toBe(true);
    expect(settings.last_selected_path).toHaveLength(0);
    expect(settings.schema_version_seen).toBe(0);
  });

  it("getAll returns all canonical keys even after partial patch", () => {
    const testDb = makeTestDb();
    cleanup = testDb.cleanup;

    patchSettings(testDb.db, { theme: "dark" });
    const settings = getAllSettings(testDb.db);

    // Patched key is updated.
    expect(settings.theme).toBe("dark");
    // Unpatched keys still resolve to defaults.
    expect(settings.source_mode).toBe(SETTINGS_DEFAULTS.source_mode);
    expect(settings.shuffle_questions).toBe(SETTINGS_DEFAULTS.shuffle_questions);
  });

  it("patch upserts only the provided keys", () => {
    const testDb = makeTestDb();
    cleanup = testDb.cleanup;

    const after = patchSettings(testDb.db, {
      theme: "light",
      shuffle_questions: true,
    });

    expect(after.theme).toBe("light");
    expect(after.shuffle_questions).toBe(true);
    // Other keys unchanged.
    expect(after.progressive_reveal).toBe(true);
    expect(after.source_mode).toBe("filesystem");
  });

  it("patch on the same key overwrites the previous value", () => {
    const testDb = makeTestDb();
    cleanup = testDb.cleanup;

    patchSettings(testDb.db, { theme: "dark" });
    const final = patchSettings(testDb.db, { theme: "light" });
    expect(final.theme).toBe("light");
  });

  it("patch with last_selected_path persists the array", () => {
    const testDb = makeTestDb();
    cleanup = testDb.cleanup;

    const result = patchSettings(testDb.db, {
      last_selected_path: ["cloud", "aws", "saa", "easy"],
    });
    expect(result.last_selected_path).toEqual(["cloud", "aws", "saa", "easy"]);
  });
});
