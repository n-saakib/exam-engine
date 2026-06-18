/**
 * Tests for the AppError type guard. The guard is the linchpin of
 * `defineHandler.mapError` — if it returns false for a thrown `AppError`,
 * the route surfaces a generic 500 INTERNAL instead of the real
 * status/code/message, which is the user-visible "server error" bug.
 *
 * The key property: the guard must work even when the `AppError` class
 * has been emitted into multiple bundles (which the Next.js / Webpack /
 * Turbopack production build does — see the `defineHandler` chunk and the
 * `boot` chunk both carrying their own `class extends Error`). A naive
 * `instanceof AppError` returns false across chunks; the duck-typed guard
 * must not.
 */
import { describe, expect, it } from "vitest";

import { AppError, isAppError } from "@/server/http/errors";

describe("isAppError", () => {
  it("returns true for a freshly-thrown AppError", () => {
    const err = new AppError("SET_NOT_FOUND", "missing", 404);
    expect(isAppError(err)).toBe(true);
  });

  it("returns true for an AppError from a 'different' (duplicated) class", () => {
    // Simulate the cross-chunk class duplication: a fresh class with the
    // same name + shape is NOT instanceof the imported AppError, but it IS
    // a valid AppError as far as the wire envelope is concerned.
    class FakeAppError extends Error {
      readonly code: string;
      readonly httpStatus: number;
      constructor(code: string, message: string, httpStatus: number) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.httpStatus = httpStatus;
      }
    }
    const fake = new FakeAppError("SET_NOT_FOUND", "missing", 404);
    // Sanity: instanceof the real class is false (this is exactly the
    // production bug we are guarding against).
    expect(fake instanceof AppError).toBe(false);
    // But the duck-typed guard recognises it.
    expect(isAppError(fake)).toBe(true);
  });

  it("preserves status + code through the envelope", () => {
    const err = new AppError("PATH_TRAVERSAL", "bad path", 400, {
      p: "..",
    });
    const env = err.toEnvelope();
    expect(env.error.code).toBe("PATH_TRAVERSAL");
    expect(env.error.message).toBe("bad path");
    expect(env.error.details).toEqual({ p: ".." });
  });

  it("rejects a plain Error", () => {
    expect(isAppError(new Error("boom"))).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });

  it("rejects a string", () => {
    expect(isAppError("SET_NOT_FOUND")).toBe(false);
  });

  it("rejects an object with the right shape but a non-canonical code", () => {
    // A random object that LOOKS like an AppError but uses an unknown code
    // (e.g. a future code that has not been added to ERROR_CODES yet) must
    // NOT be treated as an AppError — we want to be defensive against
    // anything that just happens to carry `.code` and `.httpStatus`.
    const fake = {
      name: "AppError",
      code: "NOT_A_REAL_CODE",
      httpStatus: 500,
    };
    expect(isAppError(fake)).toBe(false);
  });

  it("rejects an object with the right code but no httpStatus", () => {
    const fake = {
      name: "AppError",
      code: "SET_NOT_FOUND",
    };
    expect(isAppError(fake)).toBe(false);
  });

  it("rejects an object with the right code but a non-numeric httpStatus", () => {
    const fake = {
      name: "AppError",
      code: "SET_NOT_FOUND",
      httpStatus: "404",
    };
    expect(isAppError(fake)).toBe(false);
  });

  it("rejects an object missing the AppError name", () => {
    const fake = {
      name: "Error",
      code: "SET_NOT_FOUND",
      httpStatus: 404,
    };
    expect(isAppError(fake)).toBe(false);
  });
});
