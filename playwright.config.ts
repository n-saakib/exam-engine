import { defineConfig, devices } from "@playwright/test";
import os from "os";
import path from "path";

/**
 * Playwright configuration for the CertPrep E2E spine test.
 *
 * The webServer boots `next start` on a dedicated test port (3001) with:
 *   - DB_PATH: a fresh temp SQLite file (so every run starts clean)
 *   - EXAMS_ROOT: the repo's real Exams/ directory (real AWS SAA sets)
 *   - PORT: 3001 (avoids colliding with a running dev server on :3000)
 *
 * `next build` must have been run before `next start`. The build artefact is
 * the same across runs, so we skip rebuilding if .next/ already exists (the
 * command is `next start`, not `next build && next start`). Run
 * `npm run build` separately before the first E2E run or in CI.
 *
 * In CI, `reuseExistingServer: false` forces a fresh server on every job.
 * Locally, `reuseExistingServer: true` reuses the running server so developers
 * get fast iteration on already-built apps.
 */

// Use process.pid in the temp DB name so concurrent workers (and sequential
// spec files that boot their own server) don't collide on the SQLite file.
// Without this, the second spec would open a second handle on the same DB
// and the first spec's writes would be invisible — leading to flakes.
const tempDb = path.join(os.tmpdir(), `certprep-e2e-${process.pid}-${Date.now()}.db`);
const examsRoot = path.join(__dirname, "Exams");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // spine test is sequential end-to-end; no parallelism needed
  // Pin a single worker: all spec files share the same temp SQLite DB
  // (one process.pid → one tempDb path), and the destructive spec wipes the
  // DB at the end. Running 4 spec files in parallel across 4 workers
  // therefore races them on the same database and produces a 1-in-4 flake
  // (destructive's reset clobbers the spine's in-progress session mid-flow).
  // 1 worker is the simplest correctness fix; the suite is small (5 tests
  // total) so the wall-clock cost is negligible.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 60_000, // 60 s per test step; the spine is one long test
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    // Prefer auto-waiting; no arbitrary sleeps in the spec.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `DB_PATH=${tempDb} EXAMS_ROOT=${examsRoot} PORT=3001 node_modules/.bin/next start -p 3001`,
    url: "http://localhost:3001/api/health",
    // Always start a fresh server per `npx playwright test` invocation.
    // Without `reuseExistingServer:false`, sequential spec files share one
    // server (and one DB) — the destructive spec wipes the DB at the end,
    // leaving the spine spec with no catalog, which causes flakes.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DB_PATH: tempDb,
      EXAMS_ROOT: examsRoot,
      PORT: "3001",
    },
  },
});
