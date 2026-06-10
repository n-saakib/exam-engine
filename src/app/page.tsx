"use client";

import { DomainSelector } from "@/features/domain-selector/DomainSelector";

/**
 * Home screen (F2).
 *
 * Composed as a client component island (per 09 §9 — "Home's shell is a Server
 * Component with a client <DomainSelector> island"). Since DomainSelector owns
 * React Query + settings hooks, making the page itself "use client" is the
 * simplest correct approach without adding a separate island wrapper.
 *
 * Layout:
 *   - <DomainSelector>   — cascading dropdowns + leaf summary + start button
 *   - <QuickStatsWidget> — placeholder slot for the short-term roadmap feature (F7)
 */
export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-fg">CertPrep</h1>
        <p className="mt-1 text-sm text-muted">
          Select an exam domain below to get started.
        </p>
      </div>

      {/* Domain selector — reads exam-paths.json via /api/exam-paths */}
      <section aria-label="Exam domain selection">
        <DomainSelector />
      </section>

      {/* Quick stats widget slot — placeholder until F7 lands */}
      <section
        aria-label="Quick statistics"
        className="mt-10"
        data-testid="quick-stats-slot"
      >
        {/* QuickStatsWidget rendered here in F7 */}
      </section>
    </main>
  );
}
