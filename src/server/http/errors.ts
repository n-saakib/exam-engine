import "server-only";

import { ERROR_CODES, type ErrorCode } from "@/domain/errors";

// Re-export the canonical codes (defined client-safe in @/domain/errors) so
// server modules can import everything error-related from one place.
export { ERROR_CODES };
export type { ErrorCode };

/** Default HTTP status for each canonical code (handlers may override). */
const DEFAULT_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  EXAM_PATHS_INVALID: 500,
  PATH_NOT_FOUND: 404,
  PATH_TRAVERSAL: 400,
  SET_NOT_FOUND: 404,
  SET_AMBIGUOUS: 409,
  SETS_EXHAUSTED: 409,
  SESSION_NOT_FOUND: 404,
  SESSION_NOT_IN_PROGRESS: 409,
  SESSION_ALREADY_COMPLETED: 409,
  UNSUPPORTED_QUESTION_TYPE: 422,
  UPLOAD_REJECTED: 400,
  INTERNAL: 500,
};

/** Shape of the always-on error envelope (03 §1). */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/**
 * A domain/HTTP error that `defineHandler` maps to the standard envelope. Throw
 * it from services/handlers; `httpStatus` defaults to the code's canonical status.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, httpStatus?: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus ?? DEFAULT_STATUS[code];
    this.details = details;
  }

  /** Serialise to the wire envelope. */
  toEnvelope(): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

/** Type guard for `AppError`. */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
