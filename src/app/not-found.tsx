import Link from "next/link";
import { Card } from "@/components/Card";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-10">
      <Card className="text-center">
        <h1 className="text-2xl font-bold text-fg">404</h1>
        <p className="mt-1 text-muted">This page could not be found.</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          ← Back home
        </Link>
      </Card>
    </main>
  );
}
