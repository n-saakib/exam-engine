import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests for GET /api/settings and PATCH /api/settings.
 * Sets DB_PATH to a temp file BEFORE importing any server module (same pattern
 * as health.route.test.ts) so the production DB is never touched.
 */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-settings-"));
process.env.DB_PATH = path.join(tmpDir, "settings.db");

type SettingsRoute = {
  GET: (req: Request, ctx: { params: Promise<Record<string, never>> }) => Promise<Response>;
  PATCH: (req: Request, ctx: { params: Promise<Record<string, never>> }) => Promise<Response>;
};

// Single route reference shared across all tests — keeps the same DB connection.
let route: SettingsRoute;

beforeAll(async () => {
  const mod = await import("@/app/api/settings/route");
  route = mod as unknown as SettingsRoute;
});

afterAll(async () => {
  const { closeDb } = await import("@/server/data/db");
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("GET /api/settings", () => {
  it("returns 200 with all canonical settings keys and their defaults on a fresh DB", async () => {
    const req = new Request("http://localhost/api/settings");
    const res = await route.GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    // Every canonical key must be present.
    expect(typeof body.exams_root).toBe("string");
    expect(body.source_mode).toBe("filesystem");
    expect(body.timer_enabled).toBe(true);
    expect(body.timer_default_minutes).toBeNull();
    expect(body.show_count_before_start).toBe(true);
    expect(body.shuffle_questions).toBe(false);
    expect(body.shuffle_options).toBe(false);
    expect(body.progressive_reveal).toBe(true);
    expect(body.theme).toBe("system");
    expect(Array.isArray(body.last_selected_path)).toBe(true);
    expect((body.last_selected_path as unknown[]).length).toBe(0);
    expect(body.schema_version_seen).toBe(0);
  });
});

describe("PATCH /api/settings", () => {
  it("updates only the provided keys and returns the full settings object", async () => {
    const patch = { theme: "dark", shuffle_questions: true };
    const req = new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const res = await route.PATCH(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.theme).toBe("dark");
    expect(body.shuffle_questions).toBe(true);

    // Unpatched keys retain defaults.
    expect(body.source_mode).toBe("filesystem");
    expect(body.progressive_reveal).toBe(true);
  });

  it("returns 400 for an invalid patch value", async () => {
    const req = new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: "invalid-theme-value" }),
    });
    const res = await route.PATCH(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
