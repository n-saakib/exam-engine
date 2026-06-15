/**
 * Cross-module rescan test for PATCH /api/settings.
 *
 * Documents the contract that PATCH `exams_root` triggers a fresh
 * `setCatalog.scan()` and that the response surfaces the scan summary so
 * clients can render "X new sets added" feedback. Also documents that
 * factory-reset (`scope: 'factory'`) clears persisted settings back to the
 * defaults.
 *
 * The route lives in `src/app/api/`. NOTE: the project's `vitest.config.ts`
 * `server` project includes only files under `src/server/...` and
 * `src/domain/...`, so this file may not be picked up by `npx vitest run`
 * until the include globs are updated. The file mirrors the patterns used
 * by the existing `src/server/http` integration tests so it can be moved
 * there if needed.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ── env + singletons (must be set BEFORE any module that reads config) ───────

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-settings-rescan-"));
const dbPath = path.join(tmpDir, "rescan.db");

// Two exam roots so we can PATCH between them. Each holds a different set.
const initialExams = path.join(tmpDir, "Exams-initial");
const targetExams = path.join(tmpDir, "Exams-target");
fs.mkdirSync(path.join(initialExams, "Cloud", "AWS", "SAA", "Easy"), { recursive: true });
fs.mkdirSync(path.join(targetExams, "Cloud", "AWS", "SAA", "Easy"), { recursive: true });

// Write one set in each root so both scans return ≥ 1.
fs.writeFileSync(
  path.join(initialExams, "Cloud", "AWS", "SAA", "Easy", "initial.json"),
  JSON.stringify({
    setId: "set-initial",
    setTitle: "Initial Set",
    difficulty: "Easy",
    questions: [
      {
        id: 1,
        questionText: "Q1",
        options: { A: "a", B: "b", C: "c", D: "d" },
        correctAnswer: ["A"],
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(targetExams, "Cloud", "AWS", "SAA", "Easy", "target.json"),
  JSON.stringify({
    setId: "set-target",
    setTitle: "Target Set",
    difficulty: "Easy",
    questions: [
      {
        id: 1,
        questionText: "Q1",
        options: { A: "a", B: "b", C: "c", D: "d" },
        correctAnswer: ["A"],
      },
    ],
  }),
);

process.env.DB_PATH = dbPath;
process.env.EXAMS_ROOT = initialExams;

// Reset any singletons from earlier test files in this process.
{
  const g = globalThis as Record<string, unknown>;
  if (g.__certprepContainer) g.__certprepContainer = undefined;
  if (g.__certprepDb) {
    try {
      (g.__certprepDb as { close(): void }).close();
    } catch {
      /* already closed */
    }
    g.__certprepDb = undefined;
  }
}

type RouteHandler = (
  req: Request,
  ctx: { params: Promise<Record<string, never>> },
) => Promise<Response>;

let PATCH_settings: RouteHandler;
let POST_reset: RouteHandler;
const ctx = { params: Promise.resolve({}) };

beforeAll(async () => {
  const { resetConfigCache } = await import("@/server/config");
  resetConfigCache();

  const { runMigrations } = await import("@/server/boot");
  runMigrations();

  // Kick off an initial scan so the catalogue has a baseline row.
  const { getContainer } = await import("@/server/container");
  await getContainer().services.setCatalog.scan();

  const settingsMod = await import("@/app/api/settings/route");
  PATCH_settings = settingsMod.PATCH as unknown as RouteHandler;
  const resetMod = await import("@/app/api/progress/reset/route");
  POST_reset = resetMod.POST as unknown as RouteHandler;
});

afterAll(async () => {
  const { closeDb } = await import("@/server/data/db");
  const { resetContainer } = await import("@/server/container");
  closeDb();
  resetContainer();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function resetReq(body: unknown): Request {
  return new Request("http://localhost/api/progress/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── cases ────────────────────────────────────────────────────────────────────

describe("PATCH /api/settings — exams_root rescan", () => {
  it("PATCHing exams_root to a new directory surfaces the new set in scan.added AND removes the old one", async () => {
    const res = await PATCH_settings(patchReq({ exams_root: targetExams }), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      settings: { exams_root: string };
      scan: { scanned: number; added: number; updated: number; removed: number; errors: number; diagnostics: unknown[] };
    };
    // The new path is persisted.
    expect(body.settings.exams_root).toBe(targetExams);
    // The rescan MUST reflect the contents of the *new* exams_root, not the
    // original env-var-derived root. The target root has one valid set, so
    // `scan.added` must be ≥ 1 (the set was not in the catalogue before).
    // If this assertion fails it indicates the rescan is still using
    // `config.examsRoot` (env-derived) instead of the freshly persisted setting.
    expect(body.scan.added).toBeGreaterThanOrEqual(1);
    // Stronger pin: switching from `initialExams` (1 set) to `targetExams`
    // (1 different set) must REMOVE the old set. A regression that always
    // returns `removed: 0` (or always returns `added: 1`) would fail this.
    expect(body.scan.removed).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.scan.diagnostics)).toBe(true);
  });
});

describe("POST /api/progress/reset — factory scope", () => {
  it("scope: 'factory' clears settings back to canonical defaults", async () => {
    // First, change a setting so we can verify it gets cleared.
    await PATCH_settings(patchReq({ theme: "dark", shuffle_questions: true }), ctx);

    // Confirm the change took effect.
    const { getContainer } = await import("@/server/container");
    const before = getContainer().repos.settings.getAll();
    expect(before.theme).toBe("dark");
    expect(before.shuffle_questions).toBe(true);

    // Factory reset.
    const res = await POST_reset(resetReq({ scope: "factory" }), ctx);
    expect(res.status).toBe(200);

    // After the reset, the settings should be back to defaults.
    const after = getContainer().repos.settings.getAll();
    expect(after.theme).toBe("system");
    expect(after.shuffle_questions).toBe(false);
  });
});
