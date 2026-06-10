"use client";

import { createContext, useContext, useEffect } from "react";

import type { Theme } from "@/domain/types";
import { useSettings } from "@/hooks/useSettings";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
});

/**
 * Resolves the user's `theme` setting ('system' | 'light' | 'dark') to an actual
 * display value, writes it to `data-theme` on `<html>`, and mirrors the raw value
 * to `localStorage.theme` so the no-FOUC script in layout.tsx can read it before
 * React hydrates.
 *
 * The no-FOUC script runs before paint with the localStorage value; React Query
 * then rehydrates the authoritative setting from /api/settings and this provider
 * keeps the two in sync.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: settings } = useSettings();
  const theme: Theme = settings?.theme ?? "system";

  const resolvedTheme = resolveTheme(theme);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      // Mirror the raw setting so the no-FOUC script works on the next load.
      localStorage.setItem("theme", theme);
    } catch {
      // Ignore storage errors (private browsing, quota, etc.)
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Resolve 'system' to the OS preference; pass 'light'/'dark' through. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "light" || theme === "dark") return theme;
  // 'system' — detect OS preference
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

/** Access the current resolved theme. Must be used under a ThemeProvider. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
