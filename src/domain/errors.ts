/**
 * Canonical machine error codes (09 §6 + 03 §1). Client-safe (no `server-only`)
 * so both the apiClient and the server's `AppError` reference one source of truth.
 */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "EXAM_PATHS_INVALID",
  "PATH_NOT_FOUND",
  "PATH_TRAVERSAL",
  "SET_NOT_FOUND",
  "SET_AMBIGUOUS",
  "SETS_EXHAUSTED",
  "SESSION_NOT_FOUND",
  "SESSION_NOT_IN_PROGRESS",
  "SESSION_ALREADY_COMPLETED",
  "UNSUPPORTED_QUESTION_TYPE",
  "UPLOAD_REJECTED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
