import type { ErrorCode } from "@/domain/errors";

/**
 * Typed fetch wrapper over the `/api` surface. Every non-2xx response is parsed
 * as the standard error envelope and thrown as `ApiError` carrying
 * `code`/`message`/`details`/`status`. Feature code builds one function per
 * endpoint on top of these primitives (F1–F8).
 *
 * Client-safe: no `server-only`, no node imports.
 */

const BASE = "/api";

/** Error thrown for any non-2xx API response (mirrors the server envelope). */
export class ApiError extends Error {
  readonly code: ErrorCode | string;
  readonly status: number;
  readonly details?: unknown;

  constructor(args: {
    code: ErrorCode | string;
    message: string;
    status: number;
    details?: unknown;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
  }
}

export interface RequestOptions extends Omit<RequestInit, "body" | "method"> {
  /** JSON-serialisable request body (sets content-type + method automatically). */
  json?: unknown;
  /** Query parameters appended to the path. */
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = path.startsWith("/") ? `${BASE}${path}` : `${BASE}/${path}`;
  if (!query) return url;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseError(res: Response): Promise<ApiError> {
  let code: string = "INTERNAL";
  let message = res.statusText || "Request failed";
  let details: unknown;
  try {
    const data = (await res.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (data?.error) {
      code = data.error.code ?? code;
      message = data.error.message ?? message;
      details = data.error.details;
    }
  } catch {
    // Non-JSON error body; keep defaults.
  }
  return new ApiError({ code, message, status: res.status, details });
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { json, query, headers, ...rest } = options;
  const init: RequestInit = {
    method,
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    ...rest,
  };

  const res = await fetch(buildUrl(path, query), init);

  if (!res.ok) {
    throw await parseError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Typed verb helpers. `T` is the expected success-body type (a DTO from types.ts). */
export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, options),
  post: <T>(path: string, options?: RequestOptions) => request<T>("POST", path, options),
  patch: <T>(path: string, options?: RequestOptions) => request<T>("PATCH", path, options),
  put: <T>(path: string, options?: RequestOptions) => request<T>("PUT", path, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, options),
};
