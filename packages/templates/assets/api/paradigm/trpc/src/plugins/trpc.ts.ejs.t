---
to: src/plugins/trpc.ts
---
import type { FastifyInstance } from 'fastify';
import {
  fastifyTRPCPlugin,
  type CreateFastifyContextOptions,
  type FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import type { Context } from '../trpc/context.js';
import { appRouter, type AppRouter } from '../trpc/router.js';

/**
 * Builds the per-request context. Lives here, beside Fastify, rather than in src/trpc/ — see the
 * note in src/trpc/context.ts about keeping the router's type free of Fastify.
 */
export async function createContext({ req }: CreateFastifyContextOptions): Promise<Context> {
<% if (spec.api.middleware.auth === 'jwt') { -%>
  // Verified here, not by a route guard on /trpc: one endpoint serves public and protected
  // procedures alike, so authentication is optional at the transport and enforced per procedure
  // by `protectedProcedure`. A missing or invalid token yields an anonymous context.
  let user: Context['user'];
  try {
    await req.jwtVerify();
    user = { sub: req.user.sub, role: req.user.role };
  } catch {
    user = null;
  }

  return { requestId: req.id, user };
<% } else { -%>
  return { requestId: req.id };
<% } -%>
}

/**
 * Mounts the router at /trpc, behind every middleware registered before the routes.
 *
 * The prefix is a CONTRACT with the generated web client, which points its link at
 * `${API_URL}/trpc`. Changing one without the other produces a client whose every call 404s.
 */
export async function registerTrpc(app: FastifyInstance): Promise<void> {
  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
      // Procedure failures are logged with the path that failed. The response itself carries only
      // the tRPC error shape — stack traces are included in development and omitted in production
      // by tRPC's own error formatter.
      onError: ({ path, error }) => {
        app.log.error({ err: error, path }, 'trpc procedure failed');
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });
}
