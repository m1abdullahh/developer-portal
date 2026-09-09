---
to: src/graphql/context.ts
---
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';
<% if (spec.api.middleware.auth === 'jwt') { -%>
import { GraphQLError } from 'graphql';
import type { Role } from '../lib/permissions.js';
<% } -%>
import { createLoaders, type Loaders } from './loaders.js';

/**
 * Per-request context, built once per operation and handed to every resolver.
 *
 * Loaders live here rather than at module scope on purpose: DataLoader caches by key, so a
 * process-wide instance would serve one request's rows to the next. A fresh set per request keeps
 * the cache scoped to a single operation — which is exactly where N+1 batching pays off and where
 * staleness cannot leak.
 */
export interface GraphqlContext {
  requestId: string;
  log: FastifyBaseLogger;
  loaders: Loaders;
<% if (spec.api.middleware.auth === 'jwt') { -%>
  /** The verified bearer token's claims, or null for an anonymous request. */
  user: { sub: string; role: Role } | null;
<% } -%>
}

export async function createContext(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<GraphqlContext> {
<% if (spec.api.middleware.auth === 'jwt') { -%>
  // Verified here, not by a route guard on /graphql: one endpoint serves public and protected
  // operations alike, so authentication is optional at the transport and enforced per resolver
  // with requireUser(). A missing or invalid token yields an anonymous context, never a 401 for
  // the whole request — the schema decides which fields need a caller.
  let user: GraphqlContext['user'];
  try {
    await request.jwtVerify();
    user = { sub: request.user.sub, role: request.user.role };
  } catch {
    user = null;
  }

<% } -%>
  return {
    requestId: request.id,
    log: request.log,
    loaders: createLoaders(),
<% if (spec.api.middleware.auth === 'jwt') { -%>
    user,
<% } -%>
  };
}
<% if (spec.api.middleware.auth === 'jwt') { -%>

/** Call at the top of any resolver that needs a signed-in caller. */
export function requireUser(ctx: GraphqlContext): NonNullable<GraphqlContext['user']> {
  if (!ctx.user) {
    // UNAUTHENTICATED is the code Apollo clients understand, and the http extension makes the
    // transport answer 401 — the same status the REST error envelope uses for the same failure.
    throw new GraphQLError('A valid access token is required.', {
      extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
    });
  }
  return ctx.user;
}
<% } -%>
