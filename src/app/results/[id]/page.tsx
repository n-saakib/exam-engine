import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderScreen
      title="Results"
      feature="F5 (results screen)"
      detail={`Results for session ${id} — built in F5.`}
    />
  );
}
