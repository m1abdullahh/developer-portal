---
to: <%= framework.sourceRoot %>lib/trpc/generated/trpc/router.d.ts
---
/**
 * PLACEHOLDER — replaced by `npm run trpc:types` in the API.
 *
 * The generator cannot run the TypeScript compiler, so it cannot emit the real declarations of
 * the API's router at generation time. This file stands in until the first run: `AppRouter` is
 * `AnyRouter`, so every call through the client compiles and nothing is inferred. After the run,
 * this directory holds the router's actual declarations and calls are checked end to end.
 *
 * Run `npm run trpc:types` in the API after changing a procedure, and commit the result. The
 * API's CI regenerates these and warns when the committed copy is stale.
 */
import type { AnyRouter } from '@trpc/server';

export type AppRouter = AnyRouter;
