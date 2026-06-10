import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration test for the /api/health Route Handler: invoke it directly with a
 * `Request` (no network) and assert the documented shape (F0 / 03 §2). We point
 * DB_PATH at a temp file BEFORE importing any server module so the real
 * data/certprep.db is never touched.
 */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-health-"));
process.env.DB_PATH = path.join(tmpDir, "health.db");

describe("GET /api/health", () => {
  let GET: (req: Request, ctx: { params: Promise<Record<string, never>> }) => Promise<Response>;

  beforeAll(async () => {
    // Dynamic import AFTER env is set so config picks up the temp DB path.
    const mod = await import("@/app/api/health/route");
    GET = mod.GET as typeof GET;
  });

  afterAll(async () => {
    const { closeDb } = await import("@/server/data/db");
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns 200 with status/version/schemaVersion/examsRoot/setsIndexed", async () => {
    const req = new Request("http://localhost/api/health");
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(typeof body.version).toBe("string");
    expect(typeof body.schemaVersion).toBe("number");
    expect(body.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(typeof body.examsRoot).toBe("string");
    expect(typeof body.setsIndexed).toBe("number");
    expect(body.setsIndexed).toBe(0); // catalogue empty until F3
  });

  it("created the database file and applied migrations", async () => {
    expect(fs.existsSync(process.env.DB_PATH as string)).toBe(true);
  });
});
