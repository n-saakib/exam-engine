import { z } from "zod";

import { defineHandler } from "@/server/http/defineHandler";
import { json, noContent } from "@/server/http/respond";
import { runMigrations } from "@/server/boot";
import { getContainer } from "@/server/container";
import { PatchSessionBodySchema } from "@/domain/types";

// DB-backed route → Node.js runtime (never edge); dynamic so reads aren't cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdParams = z.object({ id: z.string().min(1) });

/**
 * GET /api/sessions/:id — live session DTO (answers hidden) (F4-T8).
 * 404 SESSION_NOT_FOUND. If not in_progress the DTO is still returned (clients
 * route to results based on `status`).
 */
export const GET = defineHandler({
  params: IdParams,
  handler: async ({ params }) => {
    runMigrations();
    const session = getContainer().services.examEngine.getSession(params.id);
    return json(session);
  },
});

/**
 * PATCH /api/sessions/:id — autosave (F4-T9). Partial currentIndex / absolute
 * clamped elapsedMs / single-question answer (selected/flagged/committed
 * (monotonic)/timeSpentMs). Idempotent. Returns the updated live DTO with a
 * just-committed question now carrying its correct data.
 * 404 SESSION_NOT_FOUND; 409 SESSION_NOT_IN_PROGRESS.
 */
export const PATCH = defineHandler({
  params: IdParams,
  body: PatchSessionBodySchema,
  handler: async ({ params, body }) => {
    runMigrations();
    const session = getContainer().services.examEngine.applyUpdate(
      params.id,
      body,
    );
    return json(session);
  },
});

/**
 * DELETE /api/sessions/:id — discard an in-progress session (F4-T13). Answers
 * cascade. 204 on success; 404 SESSION_NOT_FOUND; 409 if already completed.
 */
export const DELETE = defineHandler({
  params: IdParams,
  handler: async ({ params }) => {
    runMigrations();
    getContainer().services.examEngine.discard(params.id);
    return noContent();
  },
});
