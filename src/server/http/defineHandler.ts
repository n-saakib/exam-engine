import "server-only";

import { ZodError, type ZodType } from "zod";

import { AppError, isAppError, type ErrorEnvelope } from "@/server/http/errors";
import { envelopeResponse, errorResponse } from "@/server/http/respond";

/**
 * Tiny Route Handler wrapper (09 §6). It:
 *   1. zod-parses `body` (JSON), `query` (URLSearchParams), and `params` (dynamic
 *      segments) using the schemas you provide;
 *   2. calls your `handler` with the parsed, typed inputs;
 *   3. maps `AppError` → its status + the standard envelope, and `ZodError` →
 *      `400 VALIDATION_ERROR`, and anything else → `500 INTERNAL`.
 *
 * Omit a schema to skip parsing that input (the field is then `undefined`).
 *
 *   export const POST = defineHandler({
 *     body: CreateSessionBody,
 *     handler: async ({ body }) => created(await examEngine.createSession(body)),
 *   });
 */

/** Next App Router passes dynamic params as a Promise in the 2nd arg. */
type RouteContext = { params: Promise<Record<string, string | string[]>> };

type Infer<S> = S extends ZodType<infer T> ? T : undefined;

export interface HandlerArgs<B, Q, P> {
  req: Request;
  body: B;
  query: Q;
  params: P;
}

export interface DefineHandlerOptions<
  BSchema extends ZodType | undefined,
  QSchema extends ZodType | undefined,
  PSchema extends ZodType | undefined,
> {
  body?: BSchema;
  query?: QSchema;
  params?: PSchema;
  handler: (
    args: HandlerArgs<Infer<BSchema>, Infer<QSchema>, Infer<PSchema>>,
  ) => Response | Promise<Response>;
}

/** A Next.js Route Handler function. */
export type RouteHandler = (req: Request, context: RouteContext) => Promise<Response>;

export function defineHandler<
  BSchema extends ZodType | undefined = undefined,
  QSchema extends ZodType | undefined = undefined,
  PSchema extends ZodType | undefined = undefined,
>(options: DefineHandlerOptions<BSchema, QSchema, PSchema>): RouteHandler {
  return async (req: Request, context: RouteContext): Promise<Response> => {
    try {
      const body = options.body
        ? options.body.parse(await readJsonBody(req))
        : undefined;

      const query = options.query
        ? options.query.parse(searchParamsToObject(new URL(req.url).searchParams))
        : undefined;

      const rawParams = context?.params ? await context.params : {};
      const params = options.params ? options.params.parse(rawParams) : undefined;

      return await options.handler({
        req,
        body: body as Infer<BSchema>,
        query: query as Infer<QSchema>,
        params: params as Infer<PSchema>,
      });
    } catch (err) {
      return mapError(err);
    }
  };
}

/** Read and JSON-parse the request body; empty body → {} (lets optional schemas pass). */
async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body is not valid JSON", 400);
  }
}

/**
 * Flatten URLSearchParams to a plain object. Repeated keys collapse to an array
 * so a query schema can accept `string | string[]` where it expects multiples.
 */
function searchParamsToObject(sp: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

/** Map any thrown value to an error-envelope Response. */
function mapError(err: unknown): Response {
  if (isAppError(err)) {
    return envelopeResponse(err);
  }
  if (err instanceof ZodError) {
    const envelope: ErrorEnvelope = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
          code: i.code,
        })),
      },
    };
    return errorResponse(400, envelope);
  }
  // Unknown failure: don't leak internals to the client.
  const internal: ErrorEnvelope = {
    error: { code: "INTERNAL", message: "An unexpected error occurred" },
  };
  // Surface the real cause server-side for debugging.
  console.error("[defineHandler] unhandled error:", err);
  return errorResponse(500, internal);
}
