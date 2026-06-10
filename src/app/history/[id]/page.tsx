import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderScreen
      title="History detail"
      feature="F7 (ResultsScreen reused, from-history mode)"
      detail={`History detail for session ${id} — built in F7.`}
    />
  );
}
