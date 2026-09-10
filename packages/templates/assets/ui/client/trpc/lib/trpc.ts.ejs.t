---
to: <%= framework.sourceRoot %>lib/trpc.ts
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from './trpc/generated/trpc/router';

/**
 * The typed client, as TanStack Query options.
 *
 * `useTRPC()` returns a proxy shaped like the server's router: `trpc.health.queryOptions()` is a
 * `queryOptions` object for `useQuery`, typed with the procedure's input and output. Nothing here
 * knows a URL — the provider in components/providers/TrpcProvider.tsx supplies the client.
 *
 * `AppRouter` comes from `./trpc/generated/`, which the API emits with `npm run trpc:types`. Until
 * that has run once it is a placeholder: every call compiles, nothing is inferred.
 */
export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
