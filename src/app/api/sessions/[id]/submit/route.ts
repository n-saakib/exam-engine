import { z } from "zod";

import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { runMigrations } from "@/server/boot";
import { getContainer } from "@/server/container";
import { SubmitSessionBodySchema } from "@/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdParams = z.object({ id: z.string().min(1) });

/**
 * POST /api/sessions/:id/submit — finish & grade (F4-T12). Grades the snapshot
 * via ScoreCalculator, writes score fields + per-answer correctness, sets
 * status=completed, records set_completion, and returns the answers-shown results
 * DTO (§5.1). 404 SESSION_NOT_FOUND; 409 SESSION_ALREADY_COMPLETED.
 */
export const POST = defineHandler({
  params: IdParams,
  body: SubmitSessionBodySchema,
  handler: async ({ params, body }) => {
    runMigrations();
    const results = getContainer().services.examEngine.submit(
      params.id,
      body?.elapsedMs,
    );
    return json(results);
  },
});
