import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Security/validation tests for PATCH /api/settings.
 *
 * The base test suite (`src/server/http/settings.route.test.ts`,
 * `src/server/http/settings-f8.route.test.ts`) covers the happy path and
 * VALIDATION_ERROR cases; this file documents the security contract:
 *   - `exams_root` must be sandboxed (PATH_TRAVERSAL when it escapes the
 *     root; VALIDATION_ERROR when it doesn't exist or isn't a directory).
 *   - Unknown body keys are stripped at the schema level (mass-assignment
 *     guard — `SettingsPatchSchema` is `SettingsSchema.partial()`).
 *
 * The route lives in `src/app/api/`. NOTE: the project's `vitest.config.ts`
 * `server` project includes only `src/server/<dir>/<name>.test.ts` and
 * `src/domain/<dir>/<name>.test.ts`, so this file may not be picked up by
 * `npx vitest run` until the include globs are updated. The file mirrors the
 * patterns used by the existing `src/server/http/<name>.test.ts` integration
 * tests so it can be moved there if needed.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-settings-sec-"));
const dbPath = path.join(tmpDir, "settings-sec.db");
const sandboxDir = path.join(tmpDir, "Exams");
fs.mkdirSync(sandboxDir, { recursive: true });

// Env vars MUST be set before importing the route (config is read on first
// access and memoised; we also reset the cache explicitly).
process.env.DB_PATH = dbPath;
process.env.EXAMS_ROOT = sandboxDir;

// Reset the process-wide container/DB singletons so we get a clean state.
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

let PATCH_handler: RouteHandler;

const ctx = { params: Promise.resolve({}) };

beforeAll(async () => {
  const { resetConfigCache } = await import("@/server/config");
  resetConfigCache();

  const { runMigrations } = await import("@/server/boot");
  runMigrations();

  const mod = await import("@/app/api/settings/route");
  PATCH_handler = mod.PATCH as unknown as RouteHandler;
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

describe("PATCH /api/settings — exams_root sandbox", () => {
  it("rejects exams_root='/etc' with PATH_TRAVERSAL", async () => {
    const res = await PATCH_handler(patchReq({ exams_root: "/etc" }), ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PATH_TRAVERSAL");
  });

  it("rejects exams_root='/' with PATH_TRAVERSAL", async () => {
    const res = await PATCH_handler(patchReq({ exams_root: "/" }), ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PATH_TRAVERSAL");
  });

  it("rejects exams_root='../escape' with PATH_TRAVERSAL", async () => {
    // '..' resolves above the sandbox root → PATH_TRAVERSAL.
    const res = await PATCH_handler(patchReq({ exams_root: "../escape" }), ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PATH_TRAVERSAL");
  });

  it("rejects a non-existent path with VALIDATION_ERROR", async () => {
    const res = await PATCH_handler(
      patchReq({ exams_root: "/this/path/does/not/exist/zzz" }),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts a valid directory inside the sandbox", async () => {
    const res = await PATCH_handler(patchReq({ exams_root: sandboxDir }), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { settings: { exams_root: string } };
    expect(body.settings.exams_root).toBe(sandboxDir);
  });
});

describe("PATCH /api/settings — schema-level guarantees", () => {
  it("triggers a rescan (response includes 'scan') when exams_root changes", async () => {
    // The sandbox already has a valid dir; flipping to it should rescan.
    const res = await PATCH_handler(patchReq({ exams_root: sandboxDir }), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("scan");
    const scan = body.scan as Record<string, unknown>;
    expect(typeof scan.scanned).toBe("number");
    expect(typeof scan.added).toBe("number");
    expect(typeof scan.updated).toBe("number");
    expect(typeof scan.removed).toBe("number");
    expect(typeof scan.errors).toBe("number");
    expect(Array.isArray(scan.diagnostics)).toBe(true);
  });

  it("strips unknown body keys (mass-assignment guard)", async () => {
    // `isAdmin` is not in the SettingsSchema; zod's `.partial()` strips it.
    const res = await PATCH_handler(
      patchReq({ theme: "dark", isAdmin: true, role: "superuser" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.theme).toBe("dark");
    expect(body).not.toHaveProperty("isAdmin");
    expect(body).not.toHaveProperty("role");
  });

  it("updates both exams_root and theme in a single PATCH", async () => {
    const res = await PATCH_handler(
      patchReq({ exams_root: sandboxDir, theme: "light" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { settings: Record<string, unknown> };
    expect(body.settings.theme).toBe("light");
    expect(body.settings.exams_root).toBe(sandboxDir);
  });
});
