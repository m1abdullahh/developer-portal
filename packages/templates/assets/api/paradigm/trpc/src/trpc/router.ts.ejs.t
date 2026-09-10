---
to: src/trpc/router.ts
---
import { z } from 'zod';
import { publicProcedure, router } from './init.js';
<% if (spec.api.orm === 'prisma') { -%>
import { exampleRouter } from './procedures/example.js';
<% } -%>

/**
 * The root router. Its type is the API's contract: `AppRouter` is what the client is built from.
 *
 * Every procedure declares `.input()` and `.output()` with Zod. The server validates both; the
 * client infers both; and because the output type comes from the schema rather than from whatever
 * the implementation returns, the emitted declarations reference Zod and nothing else. An output
 * inferred from a database row would drag that library's types across to the web app.
 */
export const appRouter = router({
  /** Liveness, mirrored from GET /health so one call proves the whole stack end to end. */
  health: publicProcedure
    .output(z.object({ status: z.literal('ok'), service: z.string(), uptime: z.number() }))
    .query(() => ({ status: 'ok' as const, service: '<%= spec.meta.slug %>', uptime: process.uptime() })),
<% if (spec.api.orm === 'prisma') { -%>
  example: exampleRouter,
<% } -%>
  // Page modules and your own code add procedures and sub-routers below.
  // >>> idp:trpc-procedures
  // <<< idp:trpc-procedures
});

export type AppRouter = typeof appRouter;
