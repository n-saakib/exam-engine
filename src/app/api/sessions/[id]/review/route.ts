import { z } from "zod";

import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { runMigrations } from "@/server/boot";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/http/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdParams = z.object({ id: z.string().min(1) });

const ReviewBodySchema = z.object({
  isBookmarked: z.boolean().optional(),
  note: z.string().nullable().optional(),
});

/**
 * PATCH /api/sessions/:id/review — set is_bookmarked / note on a session (F5-T2,
 * 03 §5). Works on completed sessions AND in-progress ones (for note-jotting).
 * Returns the updated review fields: { id, isBookmarked, note }.
 * 404 SESSION_NOT_FOUND.
 */
export const PATCH = defineHandler({
  params: IdParams,
  body: ReviewBodySchema,
  handler: async ({ params, body }) => {
    runMigrations();
    const container = getContainer();

    // Verify the session exists first.
    const row = container.repos.session.getById(params.id);
    if (!row) {
      throw new AppError("SESSION_NOT_FOUND", `No session with id: ${params.id}`, 404);
    }

    const patch: { isBookmarked?: boolean; note?: string | null } = {};
    if (body.isBookmarked !== undefined) patch.isBookmarked = body.isBookmarked;
    if (body.note !== undefined) patch.note = body.note;

    container.repos.session.patch(params.id, patch);

    // Re-fetch to return the authoritative stored values.
    const updated = container.repos.session.getById(params.id)!;
    return json({
      id: updated.id,
      isBookmarked: updated.is_bookmarked === 1,
      note: updated.note,
    });
  },
});
