import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests for F8 PATCH /api/settings extensions:
 * - Changing exams_root to a valid directory validates and triggers rescan
 * - Invalid exams_root → 400 VALIDATION_ERROR
 * - Other keys still get simple partial-update behaviour
 *
 * Sets DB_PATH to a temp file BEFORE importing any server module.
 */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-settings-f8-"));
const validExamsDir = path.join(tmpDir, "Exams");
fs.mkdirSync(validExamsDir, { recursive: true });
process.env.DB_PATH = path.join(tmpDir, "settings-f8.db");

type SettingsRoute = {
  GET: (req: Request, ctx: { params: Promise<Record<string, never>> }) => Promise<Response>;
  PATCH: (req: Request, ctx: { params: Promise<Record<string, never>> }) => Promise<Response>;
};

let route: SettingsRoute;

beforeAll(async () => {
  const mod = await import("@/app/api/settings/route");
  route = mod as unknown as SettingsRoute;
});

afterAll(async () => {
  const { closeDb } = await import("@/server/data/db");
  closeDb();
  const { resetContainer } = await import("@/server/container");
  resetContainer();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const ctx = { params: Promise.resolve({}) };

describe("PATCH /api/settings — F8 extended behaviour", () => {
  it("updates non-path keys without triggering rescan (plain Settings response)", async () => {
    const req = new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timer_enabled: false, shuffle_questions: true }),
    });
    const res = await route.PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Simple settings response (no `settings` wrapper)
    expect(body.timer_enabled).toBe(false);
    expect(body.shuffle_questions).toBe(true);
    expect(body).not.toHaveProperty("scan");
    expect(body).not.toHaveProperty("settings");
  });

  it("returns { settings, scan } when exams_root changes to a valid directory", async () => {
    const req = new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exams_root: validExamsDir }),
    });
    const res = await route.PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Extended response shape
    expect(body).toHaveProperty("settings");
    expect(body).toHaveProperty("scan");
    const settings = body.settings as Record<string, unknown>;
    expect(settings.exams_root).toBe(validExamsDir);
    const scan = body.scan as Record<string, unknown>;
    expect(typeof scan.scanned).toBe("number");
    expect(typeof scan.added).toBe("number");
  });

  it("returns 400 VALIDATION_ERROR when exams_root is a non-existent path", async () => {
    const req = new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exams_root: "/this/path/definitely/does/not/exist/12345" }),
    });
    const res = await route.PATCH(req, ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 VALIDATION_ERROR when exams_root is a file (not a directory)", async () => {
    const filePath = path.join(tmpDir, "not-a-dir.txt");
    fs.writeFileSync(filePath, "hello");
    const req = new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exams_root: filePath }),
    });
    const res = await route.PATCH(req, ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("triggers rescan when source_mode changes", async () => {
    const req = new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_mode: "upload" }),
    });
    const res = await route.PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("settings");
    expect(body).toHaveProperty("scan");
    const settings = body.settings as Record<string, unknown>;
    expect(settings.source_mode).toBe("upload");
  });
});
