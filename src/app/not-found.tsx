import Link from "next/link";

import { Card } from "@/components/Card";

/**
 * Friendly 404 page (F1-T4). Renders inside the AppLayout so the MenuBar is
 * visible, matching the "every screen renders inside <AppLayout>" DoD.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm text-center">
        <p className="text-5xl font-bold text-muted" aria-hidden="true">
          404
        </p>
        <h1 className="mt-2 text-xl font-bold text-fg">Page not found</h1>
        <p className="mt-1 text-sm text-muted">
          The page you were looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center justify-center rounded-card border border-border bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Back home
        </Link>
      </Card>
    </div>
  );
}
