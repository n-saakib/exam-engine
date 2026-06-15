import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveUnderRoot } from "@/server/util/paths";
import { AppError, isAppError } from "@/server/http/errors";

/**
 * Security-focused tests for `resolveUnderRoot`. The base test suite
 * (`paths.test.ts`) covers the happy path and a few traversal vectors; this
 * file documents the full attack-surface contract (12 cases) and pins each
 * rejection to a `PATH_TRAVERSAL` AppError code (not just a thrown Error).
 */
describe("resolveUnderRoot — security contract", () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-paths-sec-"));
    fs.mkdirSync(path.join(root, "Exams", "Easy"), { recursive: true });
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("allows a path that textually lives inside the root", () => {
    const resolved = resolveUnderRoot(root, "a/b");
    expect(resolved).toBe(path.join(root, "a", "b"));
  });

  it("allows the root itself (candidate='.')", () => {
    expect(resolveUnderRoot(root, ".")).toBe(path.resolve(root));
  });

  it("rejects '../' escapes with PATH_TRAVERSAL", () => {
    try {
      resolveUnderRoot(root, "../../etc/passwd");
      throw new Error("expected resolveUnderRoot to throw");
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      if (isAppError(err)) {
        expect(err.code).toBe("PATH_TRAVERSAL");
        expect(err.httpStatus).toBe(400);
      }
    }
  });

  it("rejects percent-encoded '..' sequences (%2e%2e%2f)", () => {
    try {
      resolveUnderRoot(root, "%2e%2e%2f%2e%2e%2fetc%2fpasswd");
      throw new Error("expected resolveUnderRoot to throw");
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      if (isAppError(err)) expect(err.code).toBe("PATH_TRAVERSAL");
    }
  });

  it("rejects malformed percent-encoding (%ZZ) as PATH_TRAVERSAL", () => {
    // `decodeURIComponent` throws URIError on bad escape; the runner catches
    // that and re-throws as PATH_TRAVERSAL.
    expect(() => resolveUnderRoot(root, "Exams/%ZZ/bad")).toThrow();
    try {
      resolveUnderRoot(root, "Exams/%ZZ/bad");
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      if (isAppError(err)) expect(err.code).toBe("PATH_TRAVERSAL");
    }
  });

  it("rejects a NUL byte in the candidate", () => {
    expect(() => resolveUnderRoot(root, "a\0b")).toThrow();
    try {
      resolveUnderRoot(root, "a\0b");
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      if (isAppError(err)) expect(err.code).toBe("PATH_TRAVERSAL");
    }
  });

  it("rejects an absolute candidate that points outside the root", () => {
    try {
      resolveUnderRoot(root, "/etc/passwd");
      throw new Error("expected resolveUnderRoot to throw");
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      if (isAppError(err)) expect(err.code).toBe("PATH_TRAVERSAL");
    }
  });

  it("rejects a symlink inside the root that points outside (resolve via realpath)", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-outside-"));
    const linkPath = path.join(root, "escape-link");
    try {
      fs.symlinkSync(outside, linkPath, "dir");
      try {
        resolveUnderRoot(root, "escape-link");
        throw new Error("expected resolveUnderRoot to throw");
      } catch (err) {
        expect(isAppError(err)).toBe(true);
        if (isAppError(err)) expect(err.code).toBe("PATH_TRAVERSAL");
      }
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("allows a non-existing path that textually resolves inside the root (upload target)", () => {
    const target = "uploads/does/not/exist/yet.json";
    const resolved = resolveUnderRoot(root, target);
    expect(resolved).toBe(path.join(root, "uploads", "does", "not", "exist", "yet.json"));
    // Sanity: it does not exist on disk — but the textual check should still pass.
    expect(fs.existsSync(resolved)).toBe(false);
  });

  it("rejects a Windows drive-letter escape when run on win32", () => {
    if (process.platform !== "win32") {
      // Skip the runtime check; the production code does not branch on
      // platform — `path.resolve` on win32 would map `D:\\evil` to the
      // current drive. On non-win32 we just record the assumption.
      return;
    }
    try {
      resolveUnderRoot(root, "D:\\evil\\file");
      throw new Error("expected resolveUnderRoot to throw");
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      if (isAppError(err)) expect(err.code).toBe("PATH_TRAVERSAL");
    }
  });

  it("returns an absolute path even when the target does not exist", () => {
    const resolved = resolveUnderRoot(root, "missing/nested/dir");
    expect(path.isAbsolute(resolved)).toBe(true);
    expect(resolved).toBe(path.join(root, "missing", "nested", "dir"));
  });

  it("throws AppError (not a plain Error) and pins the error code to PATH_TRAVERSAL", () => {
    let caught: unknown;
    try {
      resolveUnderRoot(root, "../../etc/passwd");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught instanceof AppError).toBe(true);
    // The code, the status, and the details must all reflect PATH_TRAVERSAL.
    const appErr = caught as AppError;
    expect(appErr.code).toBe("PATH_TRAVERSAL");
    expect(appErr.httpStatus).toBe(400);
    expect(appErr.details).toMatchObject({ root: path.resolve(root) });
  });
});
