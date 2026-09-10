---
to: <%= framework.sourceRoot %>components/providers/TrpcProvider.tsx
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
<% if (ownQueryClient) { -%>
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
<% } else { -%>
import { useQueryClient } from '@tanstack/react-query';
<% } -%>
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useState, type ReactNode } from 'react';
import { env } from '@/lib/env';
import { TRPCProvider } from '@/lib/trpc';
import type { AppRouter } from '@/lib/trpc/generated/trpc/router';

/**
 * Supplies the tRPC client<% if (ownQueryClient) { %> and the query cache it rides on<% } else { %> to the query cache the QueryProvider already renders<% } %>.
 *
 * Created in `useState`, not at module scope: a module-level client is shared between requests on
 * the server, and on the client it survives fast-refresh in a half-torn state. One per component
 * instance is the correct number.
 *
 * `httpBatchLink` coalesces the calls made in one tick into one HTTP request, which is what makes
 * a page with six queries cost one round trip. The `/trpc` prefix is a contract with the API.
 */
export function TrpcProvider({ children }: { children: ReactNode }) {
<% if (ownQueryClient) { -%>
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
              const status = (error as { data?: { httpStatus?: number } }).data?.httpStatus;
              if (status !== undefined && status >= 400 && status < 500) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
<% } else { -%>
  const queryClient = useQueryClient();
<% } -%>
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: `${env.<%= apiUrlKey %>}/trpc` })],
    }),
  );

<% if (ownQueryClient) { -%>
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
<% } else { -%>
  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      {children}
    </TRPCProvider>
  );
<% } -%>
}
