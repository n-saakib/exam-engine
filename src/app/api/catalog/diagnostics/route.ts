import { defineHandler } from "@/server/http/defineHandler";
import { json } from "@/server/http/respond";
import { getContainer } from "@/server/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = defineHandler({
  handler: async () => {
    const { setCatalog } = getContainer().services;
    const entries = setCatalog.listDiagnostics();
    return json({ items: entries, total: entries.length });
  },
});
