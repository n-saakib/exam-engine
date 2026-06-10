"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { useInProgressCount } from "@/hooks/useInProgressCount";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", exact: true },
  { href: "/resume", label: "Resume" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

/**
 * Persistent application menu bar (F1-T2). Four destinations: Home, Resume
 * (with live in-progress badge), History, Settings.
 *
 * Accessible: uses <nav> with aria-label, active link marked with aria-current,
 * visible focus rings, keyboard-navigable via standard tab order.
 */
export function MenuBar() {
  const pathname = usePathname();
  const inProgressCount = useInProgressCount();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-sm">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-4"
      >
        {/* Brand / Home shortcut */}
        <Link
          href="/"
          className="mr-4 text-sm font-bold tracking-tight text-fg hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
          aria-label="CertPrep home"
        >
          CertPrep
        </Link>

        {/* Nav links */}
        <ul className="flex items-center gap-1" role="list">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                    isActive
                      ? "bg-brand/10 text-brand"
                      : "text-muted hover:bg-surface hover:text-fg",
                  )}
                >
                  {item.label}

                  {/* Live in-progress badge on Resume */}
                  {item.href === "/resume" && inProgressCount > 0 && (
                    <span
                      aria-label={`${inProgressCount} in-progress exam${inProgressCount === 1 ? "" : "s"}`}
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-semibold text-brand-fg"
                    >
                      {inProgressCount > 99 ? "99+" : inProgressCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
