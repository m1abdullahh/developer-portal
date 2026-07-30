---
to: <%= framework.sourceRoot %>components/providers/QueryProvider.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * Server-state cache.
 *
 * The client is created in `useState`, not at module scope. A module-level client is shared
 * between requests on the server, so one user's fetched data can be served to another — and on
 * the client it survives fast-refresh in a half-torn state. `useState` gives exactly one client
 * per component instance.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 60s rather than 0: with SSR, a freshly server-rendered page would otherwise
            // refetch everything the instant it hydrates.
            staleTime: 60_000,
            // Retrying a 404 or a 401 wastes three round trips to reach the same answer.
            retry: (failureCount, error) => {
              const status = (error as { status?: number }).status;
              if (status !== undefined && status >= 400 && status < 500) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
