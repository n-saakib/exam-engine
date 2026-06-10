import { z } from "zod";

import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { getContainer } from "@/server/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ScanBody = z.object({
  quesPath: z.string().optional(),
});

export const POST = defineHandler({
  body: ScanBody,
  handler: async ({ body }) => {
    const { setCatalog } = getContainer().services;
    const result = await setCatalog.scan(body?.quesPath);
    return json(result);
  },
});
