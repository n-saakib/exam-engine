import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/providers";

export const metadata: Metadata = {
  title: "CertPrep",
  description: "Local-first exam practice for cloud certifications.",
};

/**
 * No-FOUC theme bootstrap. Runs before paint: reads the `theme` mirror from
 * localStorage ("light" | "dark" | "system") and sets `data-theme` on <html>.
 * React Query later rehydrates the authoritative value from /api/settings.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('theme');
    var resolved = t === 'light' || t === 'dark'
      ? t
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', resolved);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
