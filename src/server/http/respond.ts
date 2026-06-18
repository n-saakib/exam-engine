import "server-only";

import type { ErrorCode } from "@/domain/errors";
import { ERROR_CODES } from "@/domain/errors";
import type { AppError, ErrorEnvelope } from "@/server/http/errors";

/**
 * Response helpers for Route Handlers. Resources are returned directly (no
 * `{ data }` wrapper); lists use `{ items, total }`; errors use the standard
 * `{ error: { code, message, details } }` envelope (03 §1).
 */

const JSON_HEADERS = { "content-type": "application/json" } as const;

/** 200 OK with a JSON body. */
export function json<T>(body: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { ...JSON_HEADERS, ...init?.headers },
  });
}

/** 201 Created with a JSON body. */
export function created<T>(body: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 201,
    ...init,
    headers: { ...JSON_HEADERS, ...init?.headers },
  });
}

/** 204 No Content (empty body). */
export function noContent(init?: ResponseInit): Response {
  return new Response(null, { status: 204, ...init });
}

/**
 * Build the error-envelope Response for an `AppError`.
 *
 * IMPORTANT: We deliberately read the duck-typed fields (`code`,
 * `message`, `httpStatus`, `details`) rather than calling `err.toEnvelope()`.
 * The production build can emit `AppError` into multiple chunks, and the
 * `AppError` we receive here may be an instance of a DIFFERENT class than
 * the one imported by this module (so `err.toEnvelope` may be undefined).
 * The fields themselves are set in the constructor and serialised to the
 * same wire shape, so reading them directly produces the identical
 * envelope.
 */
export function envelopeResponse(err: AppError): Response {
  const e = err as unknown as {
    code: unknown;
    message: string;
    httpStatus: number;
    details?: unknown;
  };
  // The thrown `AppError` may come from a different server chunk than this
  // module (Next.js / Webpack / Turbopack class duplication). We duck-type
  // the fields rather than rely on `.toEnvelope()`. We also defensively
  // narrow the `code` to the canonical `ErrorCode` set — anything else is a
  // corrupted value and we substitute `INTERNAL` so we never emit an unknown
  // string into the wire envelope.
  const rawCode = typeof e.code === "string" ? e.code : "INTERNAL";
  const code: ErrorCode = (ERROR_CODES as readonly string[]).includes(rawCode)
    ? (rawCode as ErrorCode)
    : "INTERNAL";
  const envelope: ErrorEnvelope = {
    error: {
      code,
      message: e.message,
      ...(e.details !== undefined ? { details: e.details } : {}),
    },
  };
  return new Response(JSON.stringify(envelope), {
    status: e.httpStatus,
    headers: JSON_HEADERS,
  });
}

/** Build an arbitrary error-envelope Response (code/message/status/details). */
export function errorResponse(
  status: number,
  envelope: ErrorEnvelope,
): Response {
  return new Response(JSON.stringify(envelope), {
    status,
    headers: JSON_HEADERS,
  });
}
