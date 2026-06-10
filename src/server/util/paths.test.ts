import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveUnderRoot } from "@/server/util/paths";
import { isAppError } from "@/server/http/errors";

describe("resolveUnderRoot", () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-paths-"));
    fs.mkdirSync(path.join(root, "Exams", "Easy"), { recursive: true });
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("allows a valid relative path inside the root", () => {
    const resolved = resolveUnderRoot(root, "Exams/Easy");
    expect(resolved).toBe(path.join(root, "Exams", "Easy"));
  });

  it("allows the root itself", () => {
    expect(resolveUnderRoot(root, ".")).toBe(path.resolve(root));
  });

  const traversalVectors = [
    "../../etc/passwd",
    "%2e%2e/%2e%2e/etc/passwd",
    "Exams/../../escape",
    "/etc/passwd",
  ];

  for (const vector of traversalVectors) {
    it(`rejects traversal: ${vector}`, () => {
      try {
        resolveUnderRoot(root, vector);
        throw new Error("expected PATH_TRAVERSAL");
      } catch (err) {
        expect(isAppError(err)).toBe(true);
        if (isAppError(err)) expect(err.code).toBe("PATH_TRAVERSAL");
      }
    });
  }

  it("rejects a symlink that escapes the root", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-outside-"));
    const linkPath = path.join(root, "link-out");
    try {
      fs.symlinkSync(outside, linkPath, "dir");
      expect(() => resolveUnderRoot(root, "link-out")).toThrow();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a null byte", () => {
    expect(() => resolveUnderRoot(root, "Exams/\0evil")).toThrow();
  });
});
