import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Security/validation tests for POST /api/sessions.
 *
 * The route:
 *   - Validates the request body with `CreateSessionBodySchema` (zod).
 *   - Delegates to `examEngine.createSession` (the path-resolution and set
 *     lookup happen inside the engine, which uses `pathResolver`).
 *
 * Security contract pinned by this file:
 *   1. `quesPath: '../../etc'` must be rejected (path traversal / outside
 *      the exams root). The path resolver either throws or the schema/
 *      engine surfaces a 4xx with a stable error code.
 *   2. `setId: '../foo'` is a validation error: `setId` is loaded by the
 *      engine via `setCatalog.loadSet`, which resolves to a file path that
 *      is sandboxed; a relative `../` set id either fails the schema or
 *      results in SET_NOT_FOUND.
 *   3. Mass-assignment guard: `isAdmin: true` (and any other unknown key)
 *      must be stripped by zod — the persisted session must not carry it.
 *   4. Happy path: a valid `quesPath` + `setId` creates a session.
 *
 * NOTE: the project's `vitest.config.ts` `server` project only includes
 * `src/server/<dir>/<name>.test.ts` and `src/domain/<dir>/<name>.test.ts`.
 * This file lives under `src/app/api/` so it will not be picked up by `npx
 * vitest run` until the include globs are updated. The pattern mirrors the
 * existing `src/server/http/<name>.test.ts` so it can be moved there.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-sessions-sec-"));
const dbPath = path.join(tmpDir, "sessions-sec.db");
const examsDir = path.join(tmpDir, "Exams");
const easyDir = path.join(examsDir, "Cloud", "AWS", "SAA", "Easy");
fs.mkdirSync(easyDir, { recursive: true });

process.env.DB_PATH = dbPath;
process.env.EXAMS_ROOT = examsDir;

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

const QUES_PATH = "Exams/Cloud/AWS/SAA/Easy";

function writeSet(name: string) {
  const set = {
    setId: `set-${name}`,
    setTitle: `Set ${name}`,
    difficulty: "Easy",
    questions: [
      {
        id: 1,
        questionText: `Q for ${name}`,
        options: { A: "alpha", B: "bravo", C: "charlie", D: "delta" },
        correctAnswer: ["A"],
        explanations: {
          A: { description: "A", reason: "right" },
          B: { description: "B", reason: "wrong" },
          C: { description: "C", reason: "wrong" },
          D: { description: "D", reason: "wrong" },
        },
      },
    ],
  };
  fs.writeFileSync(path.join(easyDir, `${name}.json`), JSON.stringify(set, null, 2));
}

type RouteHandler = (
  req: Request,
  ctx: { params: Promise<Record<string, never>> },
) => Promise<Response>;

let POST_handler: RouteHandler;
const ctx = { params: Promise.resolve({}) };

// Lazy import — the container pulls in env-driven singletons that must be
// set up AFTER `process.env` is seeded at the top of this file.
async function getContainer() {
  return (await import("@/server/container")).getContainer();
}

beforeAll(async () => {
  const { resetConfigCache } = await import("@/server/config");
  resetConfigCache();

  const { runMigrations } = await import("@/server/boot");
  runMigrations();

  writeSet("alpha");
  const { getContainer } = await import("@/server/container");
  await getContainer().services.setCatalog.scan();

  const mod = await import("@/app/api/sessions/route");
  POST_handler = mod.POST as unknown as RouteHandler;
});

afterAll(async () => {
  const { closeDb } = await import("@/server/data/db");
  const { resetContainer } = await import("@/server/container");
  closeDb();
  resetContainer();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createReq(body: unknown): Request {
  return new Request("http://localhost/api/sessions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/sessions — security contract", () => {
  it("rejects quesPath='../../etc' as a path-traversal violation", async () => {
    const res = await POST_handler(createReq({ quesPath: "../../etc" }), ctx);
    // The path resolver throws AppError('PATH_TRAVERSAL', …) which
    // defineHandler maps to 400; the schema also rejects empty/missing
    // paths. The contract: never 2xx, and the code identifies the class.
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(["PATH_TRAVERSAL", "VALIDATION_ERROR"]).toContain(body.error.code);
  });

  it("rejects setId='../foo' as a path-traversal violation (not SET_NOT_FOUND)", async () => {
    // Adversarial hardening: an earlier draft accepted SET_NOT_FOUND as a
    // valid response code, but that would let a 4xx-with-404 leak the
    // existence-vs-traversal distinction. The contract is: traversal-shaped
    // input must be classified as a traversal violation, not a 404.
    const res = await POST_handler(
      createReq({ quesPath: QUES_PATH, setId: "../foo" }),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(["PATH_TRAVERSAL", "VALIDATION_ERROR"]).toContain(body.error.code);
    // Pin: the code is NOT the benign "not found" code.
    expect(body.error.code).not.toBe("SET_NOT_FOUND");
  });

  it("strips unknown body keys (mass-assignment guard: isAdmin is dropped)", async () => {
    // `isAdmin` is not in CreateSessionBodySchema, so zod strips it.
    const res = await POST_handler(
      createReq({
        quesPath: QUES_PATH,
        setId: "set-alpha",
        isAdmin: true,
        role: "superuser",
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown> & { id: string };
    // The response shape does not leak unknown keys.
    expect(body.isAdmin).toBeUndefined();
    expect(body.role).toBeUndefined();
    // Stronger pin: the DB row itself has no leaked keys. A regression that
    // filtered the response but wrote dirty values to the DB would pass the
    // response-shape assertion above; this one catches it.
    const { repos } = await getContainer();
    const row = repos.session.getById(body.id) as unknown as Record<string, unknown> | null;
    expect(row).not.toBeNull();
    expect(row).not.toHaveProperty("isAdmin");
    expect(row).not.toHaveProperty("role");
  });

  it("happy path: valid input creates an in_progress session (201)", async () => {
    const res = await POST_handler(
      createReq({ quesPath: QUES_PATH, setId: "set-alpha" }),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      status: string;
      totalQuestions: number;
    };
    expect(body.status).toBe("in_progress");
    expect(body.totalQuestions).toBe(1);
    expect(typeof body.id).toBe("string");
  });
});
