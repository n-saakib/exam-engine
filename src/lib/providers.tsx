"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Client-side providers, mounted once by the root layout. Currently the React
 * Query provider; Theme/Toast/ErrorBoundary providers are layered in here as F1
 * builds them out (04 §3). A single client boundary keeps the tree simple.
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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
