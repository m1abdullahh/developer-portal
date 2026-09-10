---
to: src/trpc/init.ts
---
import { initTRPC<% if (spec.api.middleware.auth === 'jwt') { %>, TRPCError<% } %> } from '@trpc/server';
import type { Context } from './context.js';

/**
 * The tRPC instance, created once. Everything else — routers, procedures, middleware — is built
 * from these exports rather than from `initTRPC` again, because two instances have incompatible
 * types even when configured identically.
 */
const t = initTRPC.context<Context>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Serves anyone. Inputs and outputs are still validated. */
export const publicProcedure = t.procedure;
<% if (spec.api.middleware.auth === 'jwt') { -%>

/**
 * Requires a signed-in caller, and narrows `ctx.user` to non-null for everything built on it.
 *
 * Enforced per procedure rather than on the endpoint: one endpoint serves public and protected
 * procedures alike, and a token that is missing or invalid yields an anonymous context rather
 * than a 401 for the whole batch — the router decides what needs a caller.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'A valid access token is required.' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
<% } -%>
