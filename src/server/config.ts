import "server-only";

import path from "node:path";

/**
 * Resolved server configuration. Read once from the environment with sane
 * defaults so the app boots with zero config. Runtime overrides (e.g. the
 * `exams_root` setting persisted in SQLite) are layered on top of this floor by
 * the composition root (`container.ts`) / services — this object is the
 * environment floor only.
 *
 * All paths are resolved to absolute against the process cwd so that
 * better-sqlite3 and the file reader never depend on the working directory.
 */
export interface AppConfig {
  /** Port the Next server binds (informational; Next reads PORT itself). */
  readonly port: number;
  /** Absolute path to the SQLite database file. */
  readonly dbPath: string;
  /** Absolute path to the Exams root that the catalogue scans. */
  readonly examsRoot: string;
  /** Absolute path to exam-paths.json (the navigation tree). */
  readonly examPathsFile: string;
  /** Log verbosity. */
  readonly logLevel: LogLevel;
}

export type LogLevel = "error" | "warn" | "info" | "debug";

const LOG_LEVELS: readonly LogLevel[] = ["error", "warn", "info", "debug"];

function intFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function logLevelFromEnv(value: string | undefined, fallback: LogLevel): LogLevel {
  if (value && (LOG_LEVELS as readonly string[]).includes(value)) {
    return value as LogLevel;
  }
  return fallback;
}

function resolveFromEnv(value: string | undefined, fallback: string): string {
  return path.resolve(process.cwd(), value && value.trim() !== "" ? value : fallback);
}

function loadConfig(): AppConfig {
  return {
    port: intFromEnv(process.env.PORT, 3000),
    dbPath: resolveFromEnv(process.env.DB_PATH, "./data/certprep.db"),
    examsRoot: resolveFromEnv(process.env.EXAMS_ROOT, "./Exams"),
    examPathsFile: resolveFromEnv(process.env.EXAM_PATHS_FILE, "./exam-paths.json"),
    logLevel: logLevelFromEnv(process.env.LOG_LEVEL, "info"),
  };
}

// Memoised so it's read once, but LAZILY — `process.cwd()` is only called the
// first time a field is accessed (at runtime), never at module-load/build time.
// Computing it eagerly made Next's build tracer follow `process.cwd()` and trace
// the whole project (a build warning); the lazy proxy avoids that.
let cached: AppConfig | undefined;
function resolved(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/**
 * The resolved application config (environment floor). Backed by lazy getters so
 * the underlying paths are computed on first access at runtime. Read-only.
 */
export const config: AppConfig = {
  get port() {
    return resolved().port;
  },
  get dbPath() {
    return resolved().dbPath;
  },
  get examsRoot() {
    return resolved().examsRoot;
  },
  get examPathsFile() {
    return resolved().examPathsFile;
  },
  get logLevel() {
    return resolved().logLevel;
  },
};
