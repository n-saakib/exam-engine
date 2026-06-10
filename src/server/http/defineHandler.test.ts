import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineHandler } from "@/server/http/defineHandler";
import { json, created, noContent } from "@/server/http/respond";
import { AppError } from "@/server/http/errors";

const ctx = { params: Promise.resolve({} as Record<string, never>) };

describe("defineHandler error envelope", () => {
  it("maps AppError to its status + the standard envelope", async () => {
    const GET = defineHandler({
      handler: async () => {
        throw new AppError("SESSION_NOT_FOUND", "No such session", undefined, {
          id: "x",
        });
      },
    });

    const res = await GET(new Request("http://localhost/x"), ctx);
    expect(res.status).toBe(404);
    const body = (await res.json()) as {
      error: { code: string; message: string; details: unknown };
    };
    expect(body).toEqual({
      error: {
        code: "SESSION_NOT_FOUND",
        message: "No such session",
        details: { id: "x" },
      },
    });
  });

  it("respects an explicit httpStatus override on AppError", async () => {
    const GET = defineHandler({
      handler: async () => {
        throw new AppError("VALIDATION_ERROR", "bad", 422);
      },
    });
    const res = await GET(new Request("http://localhost/x"), ctx);
    expect(res.status).toBe(422);
  });

  it("maps a ZodError to 400 VALIDATION_ERROR with field details", async () => {
    const POST = defineHandler({
      body: z.object({ name: z.string() }),
      handler: async () => json({ ok: true }),
    });

    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ name: 123 }),
        headers: { "content-type": "application/json" },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { code: string; details: Array<{ path: string }> };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details[0]?.path).toBe("name");
  });

  it("parses and passes typed body/query/params to the handler", async () => {
    const POST = defineHandler({
      body: z.object({ n: z.number() }),
      query: z.object({ q: z.string() }),
      params: z.object({ id: z.string() }),
      handler: async ({ body, query, params }) =>
        json({ n: body.n, q: query.q, id: params.id }),
    });

    const res = await POST(
      new Request("http://localhost/x?q=hello", {
        method: "POST",
        body: JSON.stringify({ n: 42 }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ n: 42, q: "hello", id: "abc" });
  });

  it("returns 400 on malformed JSON body", async () => {
    const POST = defineHandler({
      body: z.object({ n: z.number() }),
      handler: async () => json({ ok: true }),
    });
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: "{not json",
        headers: { "content-type": "application/json" },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
  });
});

describe("respond helpers", () => {
  it("created() → 201, noContent() → 204", async () => {
    const c = created({ a: 1 });
    expect(c.status).toBe(201);
    expect(await c.json()).toEqual({ a: 1 });

    const n = noContent();
    expect(n.status).toBe(204);
  });
});
