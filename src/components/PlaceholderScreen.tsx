import Link from "next/link";
import { Card } from "@/components/Card";

/** Generic "built in a later feature" screen, used by F0 route placeholders. */
export function PlaceholderScreen({
  title,
  feature,
  detail,
}: {
  title: string;
  feature: string;
  detail?: string;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Card>
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
        <p className="mt-1 text-sm text-muted">
          {detail ?? `This screen is implemented in ${feature}.`}
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          ← Home
        </Link>
      </Card>
    </main>
  );
}
