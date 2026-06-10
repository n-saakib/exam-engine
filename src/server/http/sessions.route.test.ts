import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests for GET /api/sessions (09 §8 contract).
 * Points DB_PATH at a temp file before importing server modules.
 */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-sessions-"));
process.env.DB_PATH = path.join(tmpDir, "sessions.db");

type SessionsRouteGet = (
  req: Request,
  ctx: { params: Promise<Record<string, never>> }
) => Promise<Response>;

describe("GET /api/sessions", () => {
  let GET: SessionsRouteGet;

  beforeAll(async () => {
    const mod = await import("@/app/api/sessions/route");
    GET = mod.GET as unknown as SessionsRouteGet;
  });

  afterAll(async () => {
    const { closeDb } = await import("@/server/data/db");
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns { items: [], total: 0 } for ?status=in_progress on a fresh DB", async () => {
    const req = new Request(
      "http://localhost/api/sessions?status=in_progress&limit=50&offset=0",
    );
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(0);
    expect(body.total).toBe(0);
  });

  it("returns { items: [], total: 0 } with no status filter on a fresh DB", async () => {
    const req = new Request("http://localhost/api/sessions");
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(body.total).toBe(0);
  });

  it("returns 400 for an invalid status value", async () => {
    const req = new Request("http://localhost/api/sessions?status=bad_status");
    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
