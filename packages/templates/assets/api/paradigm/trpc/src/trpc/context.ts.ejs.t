---
to: src/trpc/context.ts
---
<% if (spec.api.middleware.auth === 'jwt') { -%>
import type { Role } from '../lib/permissions.js';

<% } -%>
/**
 * Per-request context, handed to every procedure.
 *
 * Only the interface lives here, on purpose: `createContext` in src/plugins/trpc.ts imports
 * Fastify to build one, and this file must not, because the client's declarations are derived
 * from the router type and the router type includes this. A Fastify import here would make the
 * web app try to resolve Fastify's types. Keep this file dependency-free.
 */
export interface Context {
  requestId: string;
<% if (spec.api.middleware.auth === 'jwt') { -%>
  /** The verified bearer token's claims, or null for an anonymous caller. */
  user: { sub: string; role: Role } | null;
<% } -%>
}
