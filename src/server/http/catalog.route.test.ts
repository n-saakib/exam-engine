import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests for the catalog/sets route handlers.
 *
 * Pattern (mirrors health.route.test.ts):
 *   - Set DB_PATH + EXAMS_ROOT env vars BEFORE any server module is imported.
 *   - Reset the globalThis container + DB singletons so each test suite sees a
 *     clean state — critical when multiple route-test files run in the same process.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-catalog-test-"));
const dbPath = path.join(tmpDir, "catalog.db");
const examsDir = path.join(tmpDir, "Exams");
const easyDir = path.join(examsDir, "Cloud", "AWS", "SAA", "Easy");
const uploadsDir = path.join(tmpDir, "data", "uploads");

// Set env BEFORE importing server modules (container reads them on first access).
process.env.DB_PATH = dbPath;
process.env.EXAMS_ROOT = examsDir;

// Reset any container/DB singletons created by earlier test files in this process.
// We do this at module load time (synchronously) so it's complete before the first
// dynamic import inside a beforeAll.
{
  const g = globalThis as Record<string, unknown>;
  if (g.__certprepContainer) {
    g.__certprepContainer = undefined;
  }
  if (g.__certprepDb) {
    try { (g.__certprepDb as { close(): void }).close(); } catch { /* already closed */ }
    g.__certprepDb = undefined;
  }
}

function writeSet(dir: string, name: string, overrides: Record<string, unknown> = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const set = {
    setId: `set-${name}`,
    setTitle: `Test Set ${name}`,
    difficulty: "Easy",
    questions: [
      {
        id: 1,
        questionText: "Q?",
        options: { A: "a", B: "b", C: "c", D: "d" },
        correctAnswer: "A",
        explanations: {
          A: { description: "A", reason: "Correct" },
          B: { description: "B", reason: "Wrong" },
          C: { description: "C", reason: "Wrong" },
          D: { description: "D", reason: "Wrong" },
        },
      },
    ],
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(set, null, 2));
}

const ctx = { params: Promise.resolve({} as Record<string, never>) };
type Ctx = typeof ctx;

// Run migrations once before any container is built so set_catalog exists.
async function ensureMigrations() {
  const { runMigrations } = await import("@/server/boot");
  runMigrations();
}

describe("POST /api/catalog/scan", () => {
  let POST: (req: Request, ctx: Ctx) => Promise<Response>;

  beforeAll(async () => {
    await ensureMigrations();
    writeSet(easyDir, "alpha");
    writeSet(easyDir, "beta");

    const mod = await import("@/app/api/catalog/scan/route");
    POST = mod.POST as typeof POST;
  });

  afterAll(async () => {
    const { closeDb } = await import("@/server/data/db");
    const { resetContainer } = await import("@/server/container");
    closeDb();
    resetContainer();
    // NOTE: tmpDir is shared by all describes below and is removed once in the
    // module-level afterAll at the end of this file — do NOT remove it here.
  });

  it("returns 200 with scan summary", async () => {
    const req = new Request("http://localhost/api/catalog/scan", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      scanned: number;
      added: number;
      errors: number;
    };
    expect(body.scanned).toBeGreaterThanOrEqual(2);
    expect(body.added).toBeGreaterThanOrEqual(2);
    expect(body.errors).toBe(0);
  });

  it("can scan with a specific quesPath", async () => {
    const quesPath = path.relative(process.cwd(), easyDir);
    const req = new Request("http://localhost/api/catalog/scan", {
      method: "POST",
      body: JSON.stringify({ quesPath }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { scanned: number };
    expect(body.scanned).toBeGreaterThanOrEqual(0);
  });
});

describe("GET /api/sets?quesPath=", () => {
  let GET: (req: Request, ctx: Ctx) => Promise<Response>;
  let POST_SCAN: (req: Request, ctx: Ctx) => Promise<Response>;

  beforeAll(async () => {
    await ensureMigrations();
    // Ensure scan has run so sets are in the catalogue.
    const scanMod = await import("@/app/api/catalog/scan/route");
    POST_SCAN = scanMod.POST as typeof POST_SCAN;
    const scanReq = new Request("http://localhost/api/catalog/scan", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    await POST_SCAN(scanReq, ctx);

    const mod = await import("@/app/api/sets/route");
    GET = mod.GET as typeof GET;
  });

  it("returns 200 with items when sets exist", async () => {
    const quesPath = path.relative(process.cwd(), easyDir);
    const req = new Request(
      `http://localhost/api/sets?quesPath=${encodeURIComponent(quesPath)}`,
    );
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      items: unknown[];
      total: number;
      remaining: number;
      exhausted: boolean;
    };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.total).toBeGreaterThan(0);
    expect(typeof body.remaining).toBe("number");
    expect(typeof body.exhausted).toBe("boolean");
    expect(body.exhausted).toBe(false);
  });

  it("returns 404 PATH_NOT_FOUND for a non-existent path", async () => {
    const req = new Request(
      "http://localhost/api/sets?quesPath=Exams/Does/Not/Exist",
    );
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PATH_NOT_FOUND");
  });
});

describe("GET /api/catalog/diagnostics", () => {
  let GET: (req: Request, ctx: Ctx) => Promise<Response>;

  beforeAll(async () => {
    await ensureMigrations();
    // Write a set with a warning.
    writeSet(easyDir, "warn", {
      questions: [
        {
          id: 1,
          questionText: "Q?",
          options: { A: "a", B: "b", C: "c" },
          correctAnswer: "A",
          explanations: {
            A: { description: "A", reason: "Correct" },
            // B and C missing — warning
          },
        },
      ],
    });

    const scanMod = await import("@/app/api/catalog/scan/route");
    const scanReq = new Request("http://localhost/api/catalog/scan", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    await (scanMod.POST as typeof GET)(scanReq, ctx);

    const mod = await import("@/app/api/catalog/diagnostics/route");
    GET = mod.GET as typeof GET;
  });

  it("returns 200 with diagnostic entries", async () => {
    const req = new Request("http://localhost/api/catalog/diagnostics");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe("number");
  });
});

describe("POST /api/catalog/upload", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    await ensureMigrations();
    fs.mkdirSync(uploadsDir, { recursive: true });
    const mod = await import("@/app/api/catalog/upload/route");
    POST = mod.POST as typeof POST;
  });

  it("accepts a valid JSON set file", async () => {
    const set = {
      setId: "upload-set-1",
      setTitle: "Uploaded Set",
      difficulty: "Easy",
      questions: [
        {
          id: 1,
          questionText: "Uploaded Q?",
          options: { A: "a", B: "b" },
          correctAnswer: "A",
          explanations: {
            A: { description: "A", reason: "r" },
            B: { description: "B", reason: "r" },
          },
        },
      ],
    };
    const blob = new Blob([JSON.stringify(set)], { type: "application/json" });
    const file = new File([blob], "upload-set.json", { type: "application/json" });
    const formData = new FormData();
    formData.append("files", file);

    const req = new Request("http://localhost/api/catalog/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      accepted: Array<{ name: string; setId: string }>;
      rejected: unknown[];
    };
    expect(body.accepted.length).toBe(1);
    expect(body.accepted[0]?.setId).toBe("upload-set-1");
    expect(body.rejected.length).toBe(0);
  });

  it("rejects a non-JSON file", async () => {
    const blob = new Blob(["not json content"], { type: "text/plain" });
    const file = new File([blob], "notes.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.append("files", file);

    const req = new Request("http://localhost/api/catalog/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    // All rejected → 400
    expect(res.status).toBe(400);
  });

  it("rejects an oversized file (> 1 MB)", async () => {
    // Create a file > 1MB of random JSON-ish bytes.
    const bigContent = JSON.stringify({ setId: "big", padding: "x".repeat(1100000) });
    const blob = new Blob([bigContent], { type: "application/json" });
    const file = new File([blob], "big.json", { type: "application/json" });
    const formData = new FormData();
    formData.append("files", file);

    const req = new Request("http://localhost/api/catalog/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects an invalid question-set JSON file", async () => {
    const invalid = {
      setId: "", // empty setId — hard error
      setTitle: "Invalid",
      difficulty: "Easy",
      questions: [],
    };
    const blob = new Blob([JSON.stringify(invalid)], { type: "application/json" });
    const file = new File([blob], "invalid.json", { type: "application/json" });
    const formData = new FormData();
    formData.append("files", file);

    const req = new Request("http://localhost/api/catalog/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("Security — path traversal in quesPath", () => {
  let GET: (req: Request, ctx: Ctx) => Promise<Response>;

  beforeAll(async () => {
    await ensureMigrations();
    const mod = await import("@/app/api/sets/route");
    GET = mod.GET as typeof GET;
  });

  it("rejects traversal in quesPath (../../etc/passwd) with PATH_NOT_FOUND or PATH_TRAVERSAL", async () => {
    const req = new Request(
      "http://localhost/api/sets?quesPath=../../etc/passwd",
    );
    const res = await GET(req, ctx);
    // Either 400 PATH_TRAVERSAL or 404 PATH_NOT_FOUND is acceptable.
    expect([400, 404]).toContain(res.status);
  });
});

// Final cleanup: remove the shared temp dir once, after every describe has run.
afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
