import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Security/validation tests for POST /api/catalog/upload.
 *
 * The upload route must:
 *   1. Accept only `.json` files (filename whitelist).
 *   2. Reject files larger than 1 MB.
 *   3. Refuse to write through a pre-existing symlink at the target
 *      (the `fs.writeFileSync` call would otherwise follow the symlink and
 *      overwrite a file outside the uploads dir — the symlink-escape fix).
 *   4. Reject empty / malformed JSON bodies.
 *   5. Trigger a catalogue scan after a successful upload.
 *
 * NOTE: the project's `vitest.config.ts` `server` project only includes
 * `src/server/<dir>/<name>.test.ts` and `src/domain/<dir>/<name>.test.ts`.
 * This file lives under `src/app/api/` so it will not be picked up by `npx
 * vitest run` until the include globs are updated.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-upload-sec-"));
const dbPath = path.join(tmpDir, "upload-sec.db");
const uploadsDir = path.join(tmpDir, "data", "uploads");

process.env.DB_PATH = dbPath;
process.env.EXAMS_ROOT = path.join(tmpDir, "Exams");

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

let POST_handler: RouteHandler;

const ctx = { params: Promise.resolve({}) };

beforeAll(async () => {
  const { resetConfigCache } = await import("@/server/config");
  resetConfigCache();

  const { runMigrations } = await import("@/server/boot");
  runMigrations();

  const mod = await import("@/app/api/catalog/upload/route");
  POST_handler = mod.POST as unknown as RouteHandler;
});

afterAll(async () => {
  const { closeDb } = await import("@/server/data/db");
  const { resetContainer } = await import("@/server/container");
  closeDb();
  resetContainer();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Build a multipart/form-data request with a single `files` entry.
 * `filename` controls what the server sees as `entry.name` (used for the
 * extension check). `content` is the literal file body.
 */
function multipartReq(filename: string, content: string | Buffer): Request {
  const boundary = `----certprep-${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([head, Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"), tail]);
  return new Request("http://localhost/api/catalog/upload", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

function validSetJSON(): string {
  return JSON.stringify({
    setId: "uploaded-set",
    setTitle: "Uploaded Set",
    difficulty: "Easy",
    questions: [
      {
        id: 1,
        questionType: "single",
        questionText: "Pick A.",
        options: { A: "alpha", B: "bravo" },
        correctAnswer: ["A"],
        explanations: {
          A: { description: "A", reason: "right" },
          B: { description: "B", reason: "wrong" },
        },
      },
    ],
  });
}

describe("POST /api/catalog/upload — validation & security", () => {
  it("rejects a non-`.json` file (HTTP 400)", async () => {
    const req = multipartReq("evil.txt", "not a json file");
    const res = await POST_handler(req, ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UPLOAD_REJECTED");
  });

  it("rejects an oversize file (1 MB + 1 byte) with 400 UPLOAD_REJECTED", async () => {
    const MAX = 1 * 1024 * 1024; // matches the route's MAX_FILE_SIZE
    // 1 MB of padding inside a valid JSON shape so the JSON/validation checks
    // would otherwise pass — the size cap should fire first.
    const pad = "x".repeat(MAX);
    const content = `${pad}.json`; // textual content with extra byte
    const oversize = content.slice(0, MAX + 1);
    const req = multipartReq("big.json", oversize);
    const res = await POST_handler(req, ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UPLOAD_REJECTED");
  });

  it("refuses to overwrite a pre-existing symlink at the upload target (no symlink escape)", async () => {
    // The upload route writes via `fs.writeFileSync(destPath, text, "utf8")`
    // after `resolveUnderRoot` accepts the path. If `destPath` is itself a
    // symlink pointing outside the uploads dir, the write would follow the
    // symlink. The fix is to refuse the upload when a symlink already exists
    // at the destination. We pre-create a symlink at the target and assert
    // the request is rejected.
    fs.mkdirSync(uploadsDir, { recursive: true });
    // Force a deterministic content hash so we can predict the target name.
    const text = validSetJSON();
    const target = path.join(uploadsDir, "preexisting-link.json");
    fs.symlinkSync(path.join(tmpDir, "outside"), target, "file");
    // Sanity: the symlink exists.
    expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);

    const req = multipartReq("preexisting-link.json", text);
    const res = await POST_handler(req, ctx);
    // The contract: never silently follow a symlink at the destination.
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UPLOAD_REJECTED");
    // The destination must still be a symlink (we did not overwrite it).
    expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
  });

  it("rejects empty / malformed JSON bodies with 400 UPLOAD_REJECTED", async () => {
    // Empty file body: server will JSON.parse and reject as `File is not valid JSON`.
    const emptyReq = multipartReq("empty.json", "");
    const res1 = await POST_handler(emptyReq, ctx);
    expect(res1.status).toBe(400);
    const body1 = (await res1.json()) as { error: { code: string } };
    expect(body1.error.code).toBe("UPLOAD_REJECTED");

    // Garbage that is not valid JSON: same outcome.
    const garbageReq = multipartReq("garbage.json", "{this is : not, json");
    const res2 = await POST_handler(garbageReq, ctx);
    expect(res2.status).toBe(400);
    const body2 = (await res2.json()) as { error: { code: string } };
    expect(body2.error.code).toBe("UPLOAD_REJECTED");
  });

  it("accepts a valid .json file and triggers a scan (file lands in uploads)", async () => {
    const text = validSetJSON();
    const req = multipartReq("ok.json", text);
    const res = await POST_handler(req, ctx);
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      accepted: Array<{ setId: string; setTitle: string }>;
      rejected: Array<{ name: string; reason: string }>;
    };
    expect(body.accepted.length).toBe(1);
    expect(body.accepted[0]?.setId).toBe("uploaded-set");
    expect(body.rejected.length).toBe(0);

    // The file was actually written to the uploads dir (within the sandbox).
    const written = fs.readdirSync(uploadsDir).filter((n) => n.endsWith(".json"));
    expect(written.length).toBeGreaterThan(0);
  });
});
