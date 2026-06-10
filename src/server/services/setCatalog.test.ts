import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeTestDb } from "@/server/test/makeTestDb";
import { createSetCatalogRepo } from "@/server/data/repos/setCatalogRepo";
import { createCompletionRepo } from "@/server/data/repos/completionRepo";
import { createSetCatalogService } from "@/server/services/setCatalog";
import { resetConfigCache } from "@/server/config";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Write a minimal valid question-set JSON file to `dir/name.json`. */
function writeSet(
  dir: string,
  name: string,
  overrides: Record<string, unknown> = {},
): string {
  const set = {
    setId: `set-${name}`,
    setTitle: `Test Set ${name}`,
    difficulty: "Easy",
    questions: [
      {
        id: 1,
        questionText: "What is 2+2?",
        options: { A: "3", B: "4", C: "5", D: "6" },
        correctAnswer: "B",
        explanations: {
          A: { description: "3", reason: "Wrong" },
          B: { description: "4", reason: "Correct" },
          C: { description: "5", reason: "Wrong" },
          D: { description: "6", reason: "Wrong" },
        },
      },
    ],
    ...overrides,
  };
  const filePath = path.join(dir, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(set, null, 2));
  return filePath;
}

/** Write a set with a `multi` questionType (unsupported — should be warning). */
function writeMultiSet(dir: string, name: string): string {
  const set = {
    setId: `set-${name}`,
    setTitle: `Multi Set ${name}`,
    difficulty: "Easy",
    questions: [
      {
        id: 1,
        questionType: "multi",
        questionText: "Select all correct answers.",
        options: { A: "Apple", B: "Banana", C: "Cherry" },
        correctAnswer: ["A", "C"],
        explanations: {
          A: { description: "Apple", reason: "Correct" },
          B: { description: "Banana", reason: "Wrong" },
          C: { description: "Cherry", reason: "Correct" },
        },
      },
    ],
  };
  const filePath = path.join(dir, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(set, null, 2));
  return filePath;
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

const REAL_EXAMS_ROOT = path.resolve(process.cwd(), "Exams");
const REAL_EASY_PATH = "Exams/Cloud/AWS/Solutions-Architect-Associate/Easy";

let tmpDir: string;
let testDbHandle: ReturnType<typeof makeTestDb>;
let cleanup: () => void;
let setCatalogService: ReturnType<typeof createSetCatalogService>;

/** Point EXAMS_ROOT at `dir` and clear the memoised config so scan() re-reads it. */
function useExamsRoot(dir: string): void {
  process.env.EXAMS_ROOT = dir;
  resetConfigCache();
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-svc-test-"));
  testDbHandle = makeTestDb();
  cleanup = testDbHandle.cleanup;

  // Isolate uploadsRoot (config derives it from DB_PATH's dir) to this test's
  // temp DB dir, so scan() never picks up the real ./data/uploads and tests
  // don't bleed into each other across files.
  process.env.DB_PATH = testDbHandle.dbPath;
  // Point EXAMS_ROOT at our temp dir. config is memoised after first access, so
  // we must clear it for the service's scan() to see the new root each test.
  useExamsRoot(tmpDir);

  const catalogRepo = createSetCatalogRepo(testDbHandle.db);
  const completionRepo = createCompletionRepo(testDbHandle.db);
  setCatalogService = createSetCatalogService(catalogRepo, completionRepo);
});

afterEach(() => {
  cleanup();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.EXAMS_ROOT;
  delete process.env.DB_PATH;
  resetConfigCache();
});

// ─── Validator tests ─────────────────────────────────────────────────────────

describe("SetCatalogService — validation", () => {
  it("catalogues a good set as status=ok", async () => {
    const subDir = path.join(tmpDir, "Easy");
    fs.mkdirSync(subDir);
    writeSet(subDir, "good");

    const summary = await setCatalogService.scan();
    expect(summary.scanned).toBe(1);
    expect(summary.added).toBe(1);
    expect(summary.errors).toBe(0);
  });

  it("records hard error on bad correctAnswer key (bad_correct_key)", async () => {
    const subDir = path.join(tmpDir, "Easy");
    fs.mkdirSync(subDir);
    writeSet(subDir, "bad_key", {
      questions: [
        {
          id: 1,
          questionText: "Test?",
          options: { A: "Yes", B: "No" },
          correctAnswer: "Z", // not one of the option keys
          explanations: {
            A: { description: "A", reason: "r" },
            B: { description: "B", reason: "r" },
          },
        },
      ],
    });

    const summary = await setCatalogService.scan();
    expect(summary.errors).toBeGreaterThanOrEqual(1);
    const entry = summary.diagnostics.find((d) => d.status === "error");
    expect(entry).toBeDefined();
    expect(entry?.messages.some((m) => m.includes("correctAnswer"))).toBe(true);
  });

  it("records hard error on duplicate question ids", async () => {
    const subDir = path.join(tmpDir, "Easy");
    fs.mkdirSync(subDir);
    writeSet(subDir, "dup_ids", {
      questions: [
        {
          id: 1,
          questionText: "Q1?",
          options: { A: "a", B: "b" },
          correctAnswer: "A",
          explanations: {
            A: { description: "A", reason: "r" },
            B: { description: "B", reason: "r" },
          },
        },
        {
          id: 1, // duplicate!
          questionText: "Q2?",
          options: { A: "a", B: "b" },
          correctAnswer: "B",
          explanations: {
            A: { description: "A", reason: "r" },
            B: { description: "B", reason: "r" },
          },
        },
      ],
    });

    const summary = await setCatalogService.scan();
    expect(summary.errors).toBeGreaterThanOrEqual(1);
    const entry = summary.diagnostics.find((d) => d.status === "error");
    expect(entry?.messages.some((m) => m.includes("duplicate question id"))).toBe(true);
  });

  it("catalogues a set with missing_explanation as status=warning (not error)", async () => {
    const subDir = path.join(tmpDir, "Easy");
    fs.mkdirSync(subDir);
    writeSet(subDir, "warn_set", {
      questions: [
        {
          id: 1,
          questionText: "Q?",
          options: { A: "a", B: "b", C: "c" },
          correctAnswer: "A",
          explanations: {
            A: { description: "A", reason: "r" },
            // B and C explanations missing — should be a warning
          },
        },
      ],
    });

    const summary = await setCatalogService.scan();
    expect(summary.errors).toBe(0);
    const entry = summary.diagnostics.find((d) => d.status === "warning");
    expect(entry).toBeDefined();
    expect(entry?.messages.some((m) => m.includes("missing explanations"))).toBe(true);
  });

  it("unsupported questionType is a warning, set is still catalogued", async () => {
    const subDir = path.join(tmpDir, "Easy");
    fs.mkdirSync(subDir);
    writeMultiSet(subDir, "multi");

    const summary = await setCatalogService.scan();
    expect(summary.errors).toBe(0);
    expect(summary.added).toBe(1);
    const entry = summary.diagnostics.find((d) => d.status === "warning");
    expect(entry?.messages.some((m) => m.includes("unsupported question type"))).toBe(true);
  });

  it("one bad file does NOT abort a multi-file scan", async () => {
    const subDir = path.join(tmpDir, "Easy");
    fs.mkdirSync(subDir);
    writeSet(subDir, "good1");
    writeSet(subDir, "good2");
    // Bad file: not valid JSON.
    fs.writeFileSync(path.join(subDir, "bad.json"), "{this is not json}");

    const summary = await setCatalogService.scan();
    expect(summary.scanned).toBe(3);
    // 2 good sets added successfully
    expect(summary.added).toBeGreaterThanOrEqual(2);
    expect(summary.errors).toBeGreaterThanOrEqual(1);
  });
});

// ─── Completion / repeat-avoidance tests ─────────────────────────────────────

describe("SetCatalogService — pickNextUnattempted", () => {
  it("returns the first unattempted set", async () => {
    const subDir = path.join(tmpDir, "Easy");
    fs.mkdirSync(subDir);
    writeSet(subDir, "alpha");
    writeSet(subDir, "beta");

    const quesPath = path.relative(process.cwd(), subDir);
    await setCatalogService.scan();

    const row = setCatalogService.pickNextUnattempted(quesPath);
    expect(row.set_id).toBeDefined();
  });

  it("skips completed sets", async () => {
    const subDir = path.join(tmpDir, "Easy");
    fs.mkdirSync(subDir);
    writeSet(subDir, "first");
    writeSet(subDir, "second");

    const quesPath = path.relative(process.cwd(), subDir);
    await setCatalogService.scan();

    // Complete the first set — record on the SAME db the service is wired to.
    const all = setCatalogService.listForPath(quesPath);
    const firstId = all.items[0]!.setId;
    createCompletionRepo(testDbHandle.db).record(quesPath, firstId, "session-1");

    // pickNextUnattempted should now skip the completed set.
    const next = setCatalogService.pickNextUnattempted(quesPath);
    expect(next.set_id).not.toBe(firstId);
  });

  it("throws SETS_EXHAUSTED when all sets are completed", async () => {
    const subDir = path.join(tmpDir, "Easy");
    fs.mkdirSync(subDir);
    writeSet(subDir, "only-one");

    const quesPath = path.relative(process.cwd(), subDir);
    await setCatalogService.scan();

    const all = setCatalogService.listForPath(quesPath);
    createCompletionRepo(testDbHandle.db).record(quesPath, all.items[0]!.setId, null);

    expect(() => setCatalogService.pickNextUnattempted(quesPath)).toThrowError(
      expect.objectContaining({ code: "SETS_EXHAUSTED" }),
    );
  });
});

// ─── Integration: real AWS SAA sets ─────────────────────────────────────────

describe("SetCatalogService — integration with real aws_saa_* sets", () => {
  it("indexes real Easy sets via POST /api/catalog/scan equivalent", async () => {
    useExamsRoot(REAL_EXAMS_ROOT);

    const summary = await setCatalogService.scan();
    expect(summary.scanned).toBeGreaterThan(0);
    // At least the 3 Easy sets should be indexed.
    expect(summary.added).toBeGreaterThanOrEqual(3);
    // The 3 intentional multi-answer errors should appear.
    // (Plus any warning sets that get catalogued).
    expect(summary.errors).toBeGreaterThanOrEqual(1);
  }, 15000);

  it("GET /api/sets?quesPath= reflects completion after seeded set_completion", async () => {
    useExamsRoot(REAL_EXAMS_ROOT);

    await setCatalogService.scan();

    const before = setCatalogService.listForPath(REAL_EASY_PATH);
    expect(before.items.length).toBeGreaterThan(0);
    expect(before.items.every((i) => !i.completed)).toBe(true);

    // Seed a completion for the first set on the SAME db the service uses.
    const firstId = before.items[0]!.setId;
    createCompletionRepo(testDbHandle.db).record(REAL_EASY_PATH, firstId, "session-abc");

    const after = setCatalogService.listForPath(REAL_EASY_PATH);
    const completedItem = after.items.find((i) => i.setId === firstId);
    expect(completedItem?.completed).toBe(true);
    expect(after.remaining).toBe(before.items.length - 1);
  }, 15000);
});
