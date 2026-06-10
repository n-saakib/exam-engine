"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/features/shell/ThemeProvider";
import { ErrorBoundary } from "@/features/shell/ErrorBoundary";
import { AppLayout } from "@/features/shell/AppLayout";

/**
 * Client-side providers, mounted once by the root layout (04 §3 / 09 §9).
 * Stack from outer to inner:
 *   QueryClientProvider  — React Query cache
 *   ThemeProvider        — data-theme + localStorage mirror
 *   ToastProvider        — global notifications
 *   ErrorBoundary        — recoverable error fallback
 *   AppLayout            — MenuBar + GlobalDialogs host
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // One QueryClient per browser session (lazy init avoids sharing across requests).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <ErrorBoundary>
            <AppLayout>{children}</AppLayout>
          </ErrorBoundary>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
