import "server-only";

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

/** Build the error-envelope Response for an AppError. */
export function envelopeResponse(err: AppError): Response {
  return new Response(JSON.stringify(err.toEnvelope()), {
    status: err.httpStatus,
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
