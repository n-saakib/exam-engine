import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default async function ExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderScreen
      title="Exam"
      feature="F4 (exam engine)"
      detail={`Exam session ${id} — the core loop lands in F4.`}
    />
  );
}
