import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient, ApiError } from "@/lib/apiClient";

function mockFetchOnce(init: { status: number; body?: unknown }) {
  const res = new Response(init.body !== undefined ? JSON.stringify(init.body) : null, {
    status: init.status,
    headers: { "content-type": "application/json" },
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(res);
}

describe("apiClient", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("GET returns the parsed JSON body", async () => {
    mockFetchOnce({ status: 200, body: { status: "ok", schemaVersion: 1 } });
    const data = await apiClient.get<{ status: string; schemaVersion: number }>("/health");
    expect(data).toEqual({ status: "ok", schemaVersion: 1 });
  });

  it("prefixes /api and appends query params", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await apiClient.get("/sets", { query: { quesPath: "Exams/X", n: 3, skip: undefined } });
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe("/api/sets?quesPath=Exams%2FX&n=3");
  });

  it("POST sends a JSON body + content-type", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    await apiClient.post("/sessions", { json: { quesPath: "p" } });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ quesPath: "p" }));
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "application/json",
    );
  });

  it("throws ApiError carrying code/message/status/details on non-2xx", async () => {
    mockFetchOnce({
      status: 404,
      body: { error: { code: "SESSION_NOT_FOUND", message: "nope", details: { id: "x" } } },
    });
    await expect(apiClient.get("/sessions/x")).rejects.toMatchObject({
      name: "ApiError",
      code: "SESSION_NOT_FOUND",
      message: "nope",
      status: 404,
      details: { id: "x" },
    });
  });

  it("returns undefined for 204 No Content", async () => {
    mockFetchOnce({ status: 204 });
    await expect(apiClient.delete("/sessions/x")).resolves.toBeUndefined();
  });

  it("ApiError is an Error instance", () => {
    const e = new ApiError({ code: "INTERNAL", message: "boom", status: 500 });
    expect(e).toBeInstanceOf(Error);
  });
});
