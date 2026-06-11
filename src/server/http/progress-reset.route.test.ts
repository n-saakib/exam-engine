import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests for POST /api/progress/reset.
 * Tests all three scopes: path, all, factory.
 * Sets DB_PATH before importing any server module.
 */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-reset-"));
process.env.DB_PATH = path.join(tmpDir, "reset.db");

// We also need an Exams dir for scanning (used transitively if needed)
const examsDir = path.join(tmpDir, "Exams");
fs.mkdirSync(examsDir, { recursive: true });
process.env.EXAMS_ROOT = examsDir;

type ResetRoute = {
  POST: (req: Request, ctx: { params: Promise<Record<string, never>> }) => Promise<Response>;
};

type SettingsRoute = {
  GET: (req: Request, ctx: { params: Promise<Record<string, never>> }) => Promise<Response>;
  PATCH: (req: Request, ctx: { params: Promise<Record<string, never>> }) => Promise<Response>;
};

let resetRoute: ResetRoute;
let settingsRoute: SettingsRoute;

const ctx = { params: Promise.resolve({}) };

beforeAll(async () => {
  // Run migrations first so the DB is ready for seeding.
  const { runMigrations } = await import("@/server/boot");
  runMigrations();

  const mod = await import("@/app/api/progress/reset/route");
  resetRoute = mod as unknown as ResetRoute;
  const settingsMod = await import("@/app/api/settings/route");
  settingsRoute = settingsMod as unknown as SettingsRoute;
});

afterAll(async () => {
  const { closeDb } = await import("@/server/data/db");
  closeDb();
  const { resetContainer } = await import("@/server/container");
  resetContainer();
  const { resetConfigCache } = await import("@/server/config");
  resetConfigCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Seed sessions + completions using the repos directly. */
async function seedData() {
  const { getContainer } = await import("@/server/container");
  const { repos } = getContainer();

  const now = new Date().toISOString();
  repos.session.insert({
    id: "sess-reset-1",
    quesPath: "Exams/Cloud/Test",
    domainLabel: "Cloud / Test",
    setId: "set-a",
    setTitle: "Set A",
    difficulty: "Easy",
    questionSnapshot: JSON.stringify([{ id: 1, order: 1 }]),
    totalQuestions: 1,
    timerEnabled: false,
    timerLimitMs: null,
    shuffleSeed: null,
    mode: "full",
    originSessionId: null,
    createdAt: now,
  });
  repos.session.patch("sess-reset-1", {
    status: "completed",
    scorePercent: 80,
    correctCount: 1,
    incorrectCount: 0,
    revealedCount: 0,
    unansweredCount: 0,
    completedAt: now,
  });
  repos.completion.record("Exams/Cloud/Test", "set-a", "sess-reset-1");

  repos.session.insert({
    id: "sess-reset-2",
    quesPath: "Exams/Cloud/OtherPath",
    domainLabel: "Cloud / Other",
    setId: "set-b",
    setTitle: "Set B",
    difficulty: "Easy",
    questionSnapshot: JSON.stringify([{ id: 1, order: 1 }]),
    totalQuestions: 1,
    timerEnabled: false,
    timerLimitMs: null,
    shuffleSeed: null,
    mode: "full",
    originSessionId: null,
    createdAt: now,
  });
  repos.session.patch("sess-reset-2", {
    status: "completed",
    scorePercent: 60,
    correctCount: 0,
    incorrectCount: 1,
    revealedCount: 0,
    unansweredCount: 0,
    completedAt: now,
  });
  repos.completion.record("Exams/Cloud/OtherPath", "set-b", "sess-reset-2");
}

async function clearAllData() {
  const { getContainer } = await import("@/server/container");
  const { repos } = getContainer();
  repos.session.deleteAll();
  repos.completion.deleteAll();
}

describe("POST /api/progress/reset — scope: path", () => {
  it("clears completion for the specified path only; sessions are kept", async () => {
    await seedData();

    const { getContainer } = await import("@/server/container");
    const { repos } = getContainer();

    // Confirm both sessions and completions are present
    const before = repos.completion.listByPath("Exams/Cloud/Test");
    expect(before.length).toBeGreaterThan(0);

    const req = new Request("http://localhost/api/progress/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "path", quesPath: "Exams/Cloud/Test" }),
    });
    const res = await resetRoute.POST(req, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { cleared: { sessions: number; completion: number } };
    expect(body.cleared.sessions).toBe(0); // sessions not deleted for path scope
    expect(body.cleared.completion).toBeGreaterThanOrEqual(1);

    // Completion for the path is gone
    const after = repos.completion.listByPath("Exams/Cloud/Test");
    expect(after.length).toBe(0);

    // Sessions still exist
    const sess = repos.session.getById("sess-reset-1");
    expect(sess).toBeDefined();

    // Other path completion untouched
    const otherCompletion = repos.completion.listByPath("Exams/Cloud/OtherPath");
    expect(otherCompletion.length).toBeGreaterThan(0);

    await clearAllData();
  });
});

describe("POST /api/progress/reset — scope: all", () => {
  it("deletes all sessions, answers, and completion records; settings are kept", async () => {
    await seedData();

    // Patch a setting first to verify it survives
    const patchReq = new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: "dark" }),
    });
    await settingsRoute.PATCH(patchReq, ctx);

    const req = new Request("http://localhost/api/progress/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "all" }),
    });
    const res = await resetRoute.POST(req, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { cleared: { sessions: number; completion: number } };
    expect(body.cleared.sessions).toBeGreaterThanOrEqual(2);
    expect(body.cleared.completion).toBeGreaterThanOrEqual(2);

    const { getContainer } = await import("@/server/container");
    const { repos } = getContainer();

    // No sessions remain
    const allSessions = repos.session.listAllCompleted();
    expect(allSessions.length).toBe(0);

    // No completion rows
    expect(repos.completion.listByPath("Exams/Cloud/Test").length).toBe(0);

    // Settings survived
    const settings = repos.settings.getAll();
    expect(settings.theme).toBe("dark");
  });
});

describe("POST /api/progress/reset — scope: factory", () => {
  it("deletes all sessions/completion AND resets settings to defaults", async () => {
    await seedData();

    // Patch settings to non-default
    const patchReq = new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: "light", timer_enabled: false }),
    });
    await settingsRoute.PATCH(patchReq, ctx);

    const req = new Request("http://localhost/api/progress/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "factory" }),
    });
    const res = await resetRoute.POST(req, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { cleared: { sessions: number; completion: number } };
    expect(body.cleared.sessions).toBeGreaterThanOrEqual(0);

    const { getContainer } = await import("@/server/container");
    const { repos } = getContainer();

    // Sessions are gone
    const allSessions = repos.session.listAllCompleted();
    expect(allSessions.length).toBe(0);

    // Settings restored to defaults
    const settings = repos.settings.getAll();
    expect(settings.theme).toBe("system"); // default
    expect(settings.timer_enabled).toBe(true); // default
  });
});

describe("POST /api/progress/reset — validation", () => {
  it("returns 400 for invalid scope", async () => {
    const req = new Request("http://localhost/api/progress/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "invalid" }),
    });
    const res = await resetRoute.POST(req, ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for path scope without quesPath", async () => {
    const req = new Request("http://localhost/api/progress/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "path" }),
    });
    const res = await resetRoute.POST(req, ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
