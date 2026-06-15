import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests for GET /api/exam-paths (F2-T2).
 *
 * Pattern (mirrors catalog.route.test.ts):
 *   - Set DB_PATH + EXAM_PATHS_FILE + EXAMS_ROOT env vars BEFORE importing
 *     any server module.
 *   - Reset globalThis container + DB singletons (if already created by earlier
 *     test files in this process).
 *   - resetConfigCache() so the lazy config proxy reads the new env values.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-exampaths-test-"));
const dbPath = path.join(tmpDir, "exampaths.db");
const examsRoot = path.join(tmpDir, "Exams");
const examPathsFile = path.join(tmpDir, "exam-paths.json");

// Set env BEFORE importing server modules.
process.env.DB_PATH = dbPath;
process.env.EXAMS_ROOT = examsRoot;
process.env.EXAM_PATHS_FILE = examPathsFile;

// Reset singletons created by earlier test files.
{
  const g = globalThis as Record<string, unknown>;
  if (g.__certprepContainer) g.__certprepContainer = undefined;
  if (g.__certprepDb) {
    try { (g.__certprepDb as { close(): void }).close(); } catch { /* already closed */ }
    g.__certprepDb = undefined;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeExamPaths(tree: object) {
  fs.writeFileSync(examPathsFile, JSON.stringify(tree, null, 2));
}

/** Real AWS SAA tree shape (mirrors exam-paths.json at repo root). */
const REAL_TREE = {
  version: 1,
  label: "Choose a domain for exam",
  cloud: {
    title: "Cloud Certificate Exams",
    icon: "cloud",
    label: "Choose the cloud provider",
    aws: {
      title: "Amazon Web Services (AWS)",
      label: "Choose a certification",
      saa: {
        title: "AWS Solutions Architect Associate",
        label: "Choose difficulty level",
        easy:   { title: "Easy",      quesPath: "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy" },
        medium: { title: "Medium",    quesPath: "Exams/Cloud/AWS/Solutions-Architect-Associate/Medium" },
        hard:   { title: "Hard",      quesPath: "Exams/Cloud/AWS/Solutions-Architect-Associate/Hard" },
        mock:   { title: "Mock Exam", quesPath: "Exams/Cloud/AWS/Solutions-Architect-Associate/Mock" },
      },
    },
  },
};

type RouteGet = (req: Request, ctx: { params: Promise<Record<string, never>> }) => Promise<Response>;
const ctx = { params: Promise.resolve({} as Record<string, never>) };

// ── Suite: real AWS SAA tree ─────────────────────────────────────────────────

describe("GET /api/exam-paths — real AWS SAA tree with 4 leaves", () => {
  let GET: RouteGet;

  beforeAll(async () => {
    // Reset config so it picks up new env (even if already cached by earlier tests).
    const { resetConfigCache } = await import("@/server/config");
    resetConfigCache();

    // Create leaf dirs so path sandboxing doesn't flag them unsafe.
    for (const dir of [
      "Cloud/AWS/Solutions-Architect-Associate/Easy",
      "Cloud/AWS/Solutions-Architect-Associate/Medium",
      "Cloud/AWS/Solutions-Architect-Associate/Hard",
      "Cloud/AWS/Solutions-Architect-Associate/Mock",
    ]) {
      fs.mkdirSync(path.join(examsRoot, dir), { recursive: true });
    }

    writeExamPaths(REAL_TREE);

    // Run migrations so the DB is initialised (SetCatalog needs set_completion).
    const { runMigrations } = await import("@/server/boot");
    runMigrations();

    const mod = await import("@/app/api/exam-paths/route");
    GET = mod.GET as RouteGet;
  });

  afterAll(async () => {
    const { closeDb } = await import("@/server/data/db");
    const { resetContainer } = await import("@/server/container");
    closeDb();
    resetContainer();
  });

  it("returns 200 with tree and 4 leaves", async () => {
    const req = new Request("http://localhost/api/exam-paths");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      tree: Record<string, unknown>;
      leaves: Array<{
        quesPath: string;
        domainLabel: string;
        totalSets: number;
        remainingSets: number;
        exhausted: boolean;
        inProgressCount: number;
      }>;
    };

    expect(body).toHaveProperty("tree");
    expect(body).toHaveProperty("leaves");
    expect(Array.isArray(body.leaves)).toBe(true);
    expect(body.leaves).toHaveLength(4);

    const quesPaths = body.leaves.map((l) => l.quesPath);
    expect(quesPaths).toContain("Exams/Cloud/AWS/Solutions-Architect-Associate/Easy");
    expect(quesPaths).toContain("Exams/Cloud/AWS/Solutions-Architect-Associate/Mock");

    // With an empty catalogue, all sets = 0.
    for (const leaf of body.leaves) {
      expect(typeof leaf.totalSets).toBe("number");
      expect(typeof leaf.remainingSets).toBe("number");
      expect(typeof leaf.exhausted).toBe("boolean");
      // inProgressCount is always present (defaults to 0 when no sessions exist).
      expect(typeof leaf.inProgressCount).toBe("number");
    }
  });

  it("tree root has the correct label", async () => {
    const req = new Request("http://localhost/api/exam-paths");
    const res = await GET(req, ctx);
    const body = (await res.json()) as { tree: { label?: string } };
    expect(body.tree.label).toBe("Choose a domain for exam");
  });

  it("each leaf has a domainLabel built from title chain", async () => {
    const req = new Request("http://localhost/api/exam-paths");
    const res = await GET(req, ctx);
    const body = (await res.json()) as { leaves: Array<{ domainLabel: string }> };
    const labels = body.leaves.map((l) => l.domainLabel);
    // E.g. "Cloud Certificate Exams / Amazon Web Services (AWS) / AWS Solutions Architect Associate / Easy"
    expect(labels.some((l) => l.includes("Cloud Certificate Exams"))).toBe(true);
    expect(labels.some((l) => l.includes("Easy"))).toBe(true);
  });

  it("reports inProgressCount per leaf from exam_sessions (home-page gate)", async () => {
    // Insert two in_progress sessions for the same path, one for another path.
    const now = new Date().toISOString();
    const { getDb } = await import("@/server/data/db");
    const db = getDb();
    db.prepare(
      `INSERT INTO exam_sessions
        (id, status, ques_path, domain_label, set_id, set_title, difficulty,
         question_snapshot, total_questions, timer_enabled, timer_limit_ms,
         time_elapsed_ms, current_index, shuffle_seed, mode, origin_session_id,
         is_bookmarked, created_at, started_at, updated_at)
       VALUES
        ('sess-easy-1', 'in_progress', 'Exams/Cloud/AWS/Solutions-Architect-Associate/Easy',
         '...', 'setA', 'A', 'Easy', '[]', 1, 0, NULL, 0, 0, 'seed', 'full', NULL,
         0, ?, ?, ?),
        ('sess-easy-2', 'in_progress', 'Exams/Cloud/AWS/Solutions-Architect-Associate/Easy',
         '...', 'setB', 'B', 'Easy', '[]', 1, 0, NULL, 0, 0, 'seed', 'full', NULL,
         0, ?, ?, ?),
        ('sess-medium-1', 'in_progress', 'Exams/Cloud/AWS/Solutions-Architect-Associate/Medium',
         '...', 'setC', 'C', 'Medium', '[]', 1, 0, NULL, 0, 0, 'seed', 'full', NULL,
         0, ?, ?, ?),
        ('sess-discarded-1', 'discarded', 'Exams/Cloud/AWS/Solutions-Architect-Associate/Hard',
         '...', 'setD', 'D', 'Hard', '[]', 1, 0, NULL, 0, 0, 'seed', 'full', NULL,
         0, ?, ?, ?),
        ('sess-completed-1', 'completed', 'Exams/Cloud/AWS/Solutions-Architect-Associate/Mock',
         '...', 'setE', 'E', 'Mock', '[]', 1, 0, NULL, 0, 0, 'seed', 'full', NULL,
         0, ?, ?, ?)`,
    ).run(now, now, now, now, now, now, now, now, now, now, now, now, now, now, now);

    const req = new Request("http://localhost/api/exam-paths");
    const res = await GET(req, ctx);
    const body = (await res.json()) as {
      leaves: Array<{ quesPath: string; inProgressCount: number }>;
    };

    const easy = body.leaves.find(
      (l) => l.quesPath === "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy",
    );
    const medium = body.leaves.find(
      (l) => l.quesPath === "Exams/Cloud/AWS/Solutions-Architect-Associate/Medium",
    );
    const hard = body.leaves.find(
      (l) => l.quesPath === "Exams/Cloud/AWS/Solutions-Architect-Associate/Hard",
    );
    const mock = body.leaves.find(
      (l) => l.quesPath === "Exams/Cloud/AWS/Solutions-Architect-Associate/Mock",
    );

    // 2 in_progress sessions for Easy → gates the home page.
    expect(easy?.inProgressCount).toBe(2);
    // 1 in_progress for Medium.
    expect(medium?.inProgressCount).toBe(1);
    // A discarded session does NOT count toward the gate.
    expect(hard?.inProgressCount).toBe(0);
    // A completed session does NOT count toward the gate (gating is on
    // in_progress only — completed is handled by the retake/reset flow).
    expect(mock?.inProgressCount).toBe(0);
  });
});

// ── Suite: broken tree → EXAM_PATHS_INVALID ─────────────────────────────────

describe("GET /api/exam-paths — broken tree → EXAM_PATHS_INVALID", () => {
  let GET: RouteGet;

  beforeAll(async () => {
    // Reset everything for a clean slate.
    const { closeDb } = await import("@/server/data/db");
    const { resetContainer } = await import("@/server/container");
    const { resetConfigCache } = await import("@/server/config");
    try { closeDb(); } catch { /* ok */ }
    resetContainer();
    resetConfigCache();

    // Write a broken tree (root has no label).
    writeExamPaths({ cloud: { title: "Cloud", label: "x", saa: { title: "SAA", quesPath: "x" } } });

    // Also reset the __certprepContainer singleton so the pathResolver reads the new file.
    const g = globalThis as Record<string, unknown>;
    g.__certprepContainer = undefined;

    const { runMigrations } = await import("@/server/boot");
    runMigrations();

    const mod = await import("@/app/api/exam-paths/route");
    GET = mod.GET as RouteGet;
  });

  afterAll(async () => {
    const { closeDb } = await import("@/server/data/db");
    const { resetContainer } = await import("@/server/container");
    closeDb();
    resetContainer();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns 500 EXAM_PATHS_INVALID for a broken tree", async () => {
    // Force the container to use the new broken file by resetting the cached resolver.
    const g = globalThis as Record<string, unknown>;
    g.__certprepContainer = undefined;

    const req = new Request("http://localhost/api/exam-paths");
    const res = await GET(req, ctx);
    expect(res.status).toBe(500);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("EXAM_PATHS_INVALID");
  });
});
