"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data considered fresh for 2 minutes - no refetch during this period
            staleTime: 1000 * 60 * 2,
            // Keep data in cache for 10 minutes after component unmounts
            gcTime: 1000 * 60 * 10,
            // Don't refetch when window regains focus
            refetchOnWindowFocus: false,
            // Reduce retries for faster failure feedback
            retry: 1,
          },
        },
      })
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
