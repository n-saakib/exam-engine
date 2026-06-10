import { ExamScreen } from "@/features/exam/ExamScreen";

/**
 * /exam/:id — the core exam loop (F4). Thin server shell that resolves the
 * route param and hands off to the client <ExamScreen>, which fetches the
 * session once and drives the Zustand store.
 */
export default async function ExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExamScreen sessionId={id} />;
}
