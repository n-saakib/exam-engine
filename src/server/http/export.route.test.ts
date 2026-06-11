import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests for GET /api/export.
 * Tests JSON and CSV format output for history and all scopes.
 * Sets DB_PATH before importing server modules.
 */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-export-"));
process.env.DB_PATH = path.join(tmpDir, "export.db");

const examsDir = path.join(tmpDir, "Exams");
fs.mkdirSync(examsDir, { recursive: true });
process.env.EXAMS_ROOT = examsDir;

type ExportRoute = {
  GET: (req: Request, ctx: { params: Promise<Record<string, never>> }) => Promise<Response>;
};

let exportRoute: ExportRoute;

const ctx = { params: Promise.resolve({}) };

beforeAll(async () => {
  // Run migrations first so the DB is ready.
  const { runMigrations } = await import("@/server/boot");
  runMigrations();

  const mod = await import("@/app/api/export/route");
  exportRoute = mod as unknown as ExportRoute;

  // Seed some completed sessions
  const { getContainer } = await import("@/server/container");
  const { repos } = getContainer();
  const now = new Date().toISOString();

  const snapshot = JSON.stringify([
    {
      id: 1,
      order: 1,
      questionType: "single",
      questionText: "What is 1+1?",
      options: { A: "1", B: "2", C: "3", D: "4" },
      correctAnswer: "B",
    },
  ]);

  repos.session.insert({
    id: "export-sess-1",
    quesPath: "Exams/Test/Easy",
    domainLabel: "Test / Easy",
    setId: "export-set-1",
    setTitle: "Export Test Set",
    difficulty: "Easy",
    questionSnapshot: snapshot,
    totalQuestions: 1,
    timerEnabled: true,
    timerLimitMs: 600000,
    shuffleSeed: null,
    mode: "full",
    originSessionId: null,
    createdAt: now,
  });
  repos.session.patch("export-sess-1", {
    status: "completed",
    scorePercent: 100,
    correctCount: 1,
    incorrectCount: 0,
    revealedCount: 0,
    unansweredCount: 0,
    completedAt: now,
  });

  repos.session.insert({
    id: "export-sess-2",
    quesPath: "Exams/Test/Medium",
    domainLabel: "Test / Medium",
    setId: "export-set-2",
    setTitle: "Export Test Set 2",
    difficulty: "Medium",
    questionSnapshot: snapshot,
    totalQuestions: 1,
    timerEnabled: false,
    timerLimitMs: null,
    shuffleSeed: null,
    mode: "full",
    originSessionId: null,
    createdAt: now,
  });
  repos.session.patch("export-sess-2", {
    status: "completed",
    scorePercent: 0,
    correctCount: 0,
    incorrectCount: 1,
    revealedCount: 0,
    unansweredCount: 0,
    completedAt: now,
  });
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

describe("GET /api/export — JSON format", () => {
  it("returns 200 with application/json content type", async () => {
    const req = new Request("http://localhost/api/export?format=json&scope=history");
    const res = await exportRoute.GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain(".json");
  });

  it("returns parseable JSON with correct structure", async () => {
    const req = new Request("http://localhost/api/export?format=json&scope=history");
    const res = await exportRoute.GET(req, ctx);
    const body = await res.json() as {
      exportedAt: string;
      totalExams: number;
      sessions: Array<{
        id: string;
        scorePercent: number;
        domainLabel: string;
        completedAt: string;
      }>;
    };
    expect(typeof body.exportedAt).toBe("string");
    expect(body.totalExams).toBe(2);
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(body.sessions.length).toBe(2);
    const first = body.sessions[0]!;
    expect(typeof first.id).toBe("string");
    expect(typeof first.scorePercent).toBe("number");
    expect(typeof first.domainLabel).toBe("string");
    expect(typeof first.completedAt).toBe("string");
  });

  it("round-trips history — session ids are preserved", async () => {
    const req = new Request("http://localhost/api/export?format=json&scope=history");
    const res = await exportRoute.GET(req, ctx);
    const body = await res.json() as { sessions: Array<{ id: string }> };
    const ids = body.sessions.map((s) => s.id);
    expect(ids).toContain("export-sess-1");
    expect(ids).toContain("export-sess-2");
  });

  it("scope=all includes settings and does not include questions for scope=history", async () => {
    const histReq = new Request("http://localhost/api/export?format=json&scope=history");
    const histRes = await exportRoute.GET(histReq, ctx);
    const histBody = await histRes.json() as { settings?: unknown };
    expect(histBody.settings).toBeUndefined();

    const allReq = new Request("http://localhost/api/export?format=json&scope=all");
    const allRes = await exportRoute.GET(allReq, ctx);
    const allBody = await allRes.json() as {
      settings: Record<string, unknown>;
      sessions: Array<{ questions?: unknown[] }>;
    };
    expect(allBody.settings).toBeDefined();
    expect(typeof allBody.settings.theme).toBe("string");
    // scope=all includes questions
    const session = allBody.sessions[0]!;
    expect(Array.isArray(session.questions)).toBe(true);
  });
});

describe("GET /api/export — CSV format", () => {
  it("returns 200 with text/csv content type", async () => {
    const req = new Request("http://localhost/api/export?format=csv&scope=history");
    const res = await exportRoute.GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv");
    expect(res.headers.get("content-disposition")).toContain(".csv");
  });

  it("has one row per completed exam with expected headers", async () => {
    const req = new Request("http://localhost/api/export?format=csv&scope=history");
    const res = await exportRoute.GET(req, ctx);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    // header + 2 data rows
    expect(lines.length).toBe(3);
    const headers = lines[0]!.split(",");
    expect(headers).toContain("id");
    expect(headers).toContain("domainLabel");
    expect(headers).toContain("scorePercent");
    expect(headers).toContain("completedAt");
    expect(headers).toContain("difficulty");
  });

  it("data rows contain correct session data", async () => {
    const req = new Request("http://localhost/api/export?format=csv&scope=history");
    const res = await exportRoute.GET(req, ctx);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    const headers = lines[0]!.split(",");
    const idIdx = headers.indexOf("id");
    const scoreIdx = headers.indexOf("scorePercent");

    const rows = lines.slice(1).map((l) => l.split(","));
    const ids = rows.map((r) => r[idIdx]);
    expect(ids).toContain("export-sess-1");
    expect(ids).toContain("export-sess-2");

    // Find session-1 (100% score)
    const sess1Row = rows.find((r) => r[idIdx] === "export-sess-1");
    expect(sess1Row).toBeDefined();
    expect(sess1Row![scoreIdx]).toBe("100");
  });
});

describe("GET /api/export — validation", () => {
  it("returns 400 for invalid format", async () => {
    const req = new Request("http://localhost/api/export?format=xml");
    const res = await exportRoute.GET(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid scope", async () => {
    const req = new Request("http://localhost/api/export?format=json&scope=invalid");
    const res = await exportRoute.GET(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
