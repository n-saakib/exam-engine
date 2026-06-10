import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { getContainer } from "@/server/container";
import { runMigrations } from "@/server/boot";
import { SettingsPatchSchema } from "@/domain/types";

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
    const { repos } = getContainer();
    const updated = repos.settings.patch(body);
    return json(updated);
  },
});
