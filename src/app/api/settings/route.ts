import fs from "node:fs";

import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { getContainer } from "@/server/container";
import { runMigrations } from "@/server/boot";
import { SettingsPatchSchema } from "@/domain/types";
import { AppError } from "@/server/http/errors";
import { resolveUnderRoot } from "@/server/util/paths";
import { config } from "@/server/config";

// DB-backed route → Node.js runtime (never edge); dynamic so reads aren't cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = defineHandler({
  handler: async () => {
    // Ensure migrations have run (idempotent guard in case instrumentation
    // was bypassed, e.g. during tests).
    runMigrations();
    const { repos } = getContainer();
    const settings = repos.settings.getAll();
    return json(settings);
  },
});

export const PATCH = defineHandler({
  body: SettingsPatchSchema,
  handler: async ({ body }) => {
    runMigrations();
    const { repos, services } = getContainer();

    const keysRequiringRescan: Array<keyof typeof body> = [
      "exams_root",
      "source_mode",
    ];
    const needsRescan = keysRequiringRescan.some(
      (k) => body[k] !== undefined,
    );

    // Validate exams_root before persisting (09 §7.5). The candidate must:
    //   - resolve inside the env-derived `EXAMS_ROOT` sandbox (no escaping via
    //     `..`, percent-encoding, symlinks, or absolute paths), and
    //   - exist as a directory on disk.
    // On success we store the resolved absolute path so the persisted setting
    // is always canonical.
    //
    // Order matters: the sandbox check is the security boundary and runs
    // first so a non-existent path that ESCAPES the sandbox reports
    // `PATH_TRAVERSAL` (the security violation is the salient fact). A
    // non-existent path INSIDE the sandbox reports `VALIDATION_ERROR` (a
    // helpful user-error code for a typo).
    if (body.exams_root !== undefined) {
      const sandbox = config.examsRoot;
      // Sandbox check first. resolveUnderRoot throws AppError('PATH_TRAVERSAL')
      // on any escape — relative `..`, percent-encoded, absolute, or symlink.
      const candidate = resolveUnderRoot(sandbox, body.exams_root);
      // Now the candidate is provably inside the sandbox; verify it exists
      // as a directory.
      let stat: fs.Stats | null = null;
      try {
        stat = fs.statSync(candidate);
      } catch {
        // fall through to throw VALIDATION_ERROR below
      }
      if (!stat || !stat.isDirectory()) {
        throw new AppError(
          "VALIDATION_ERROR",
          `exams_root must be an existing directory: "${body.exams_root}"`,
          400,
          { field: "exams_root", value: body.exams_root },
        );
      }
      // Store the resolved absolute path.
      body = { ...body, exams_root: candidate };
    }

    const updated = repos.settings.patch(body);

    if (needsRescan) {
      const scan = await services.setCatalog.scan();
      return json({ settings: updated, scan });
    }

    return json(updated);
  },
});
