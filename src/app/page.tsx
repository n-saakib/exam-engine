import Link from "next/link";
import { Card } from "@/components/Card";

/**
 * Home shell (Server Component). F2 mounts the cascading <DomainSelector> island
 * and F1 the quick-stats widget here. Placeholder until then.
 */
export default function HomePage() {
  const links: Array<{ href: string; label: string }> = [
    { href: "/resume", label: "Resume" },
    { href: "/history", label: "History" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold text-fg">CertPrep</h1>
      <p className="mt-1 text-muted">Local-first exam practice.</p>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Choose an exam</h2>
        <p className="mt-1 text-sm text-muted">
          The domain selector lands in F2. The foundation scaffold is up and the
          API is live.
        </p>
        <nav className="mt-4 flex flex-wrap gap-3">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-brand underline-offset-4 hover:underline"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </Card>
    </main>
  );
}
