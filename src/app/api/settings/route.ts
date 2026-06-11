import fs from "node:fs";
import path from "node:path";

import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { getContainer } from "@/server/container";
import { runMigrations } from "@/server/boot";
import { SettingsPatchSchema } from "@/domain/types";
import { AppError } from "@/server/http/errors";

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

    // Validate exams_root before persisting (09 §7.5).
    if (body.exams_root !== undefined) {
      const candidate = path.resolve(body.exams_root);
      let stat: fs.Stats | null = null;
      try {
        stat = fs.statSync(candidate);
      } catch {
        // file not found
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
