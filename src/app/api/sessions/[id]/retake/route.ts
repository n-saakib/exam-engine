import { z } from "zod";

import { defineHandler } from "@/server/http/defineHandler";
import { created } from "@/server/http/respond";
import { runMigrations } from "@/server/boot";
import { getContainer } from "@/server/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdParams = z.object({ id: z.string().min(1) });

const RetakeBodySchema = z.object({
  scope: z.enum(["all", "incorrect"]),
  options: z
    .object({
      shuffleQuestions: z.boolean().optional(),
      shuffleOptions: z.boolean().optional(),
      timerEnabled: z.boolean().optional(),
      timerMinutes: z.number().positive().nullable().optional(),
    })
    .optional(),
});

/**
 * POST /api/sessions/:id/retake — create a retake session (F5-T3, 03 §5).
 *
 * - scope "all"       → fresh session re-using the entire origin snapshot.
 * - scope "incorrect" → new session with ONLY the origin questions whose outcome
 *   was incorrect or revealed. 409 SETS_EXHAUSTED when none qualify.
 *
 * Returns 201 with the new live session DTO.
 * 404 SESSION_NOT_FOUND.
 */
export const POST = defineHandler({
  params: IdParams,
  body: RetakeBodySchema,
  handler: async ({ params, body }) => {
    runMigrations();
    const liveSession = getContainer().services.examEngine.retake(
      params.id,
      body,
    );
    return created(liveSession);
  },
});
