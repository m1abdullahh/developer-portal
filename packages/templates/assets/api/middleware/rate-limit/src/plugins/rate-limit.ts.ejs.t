---
to: src/plugins/rate-limit.ts
---
import type { FastifyInstance } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import { env } from '../config/env.js';

/**
 * Request rate limiting.
 *
 * ⚠️  Counters are IN-MEMORY, so the limit is PER INSTANCE, not global.
 *
 * With the Horizontal Pod Autoscaler enabled, a limit of <%= 'RATE_LIMIT_MAX' %> becomes that
 * value × replica-count, and the effective limit changes silently whenever the cluster scales.
 * That is rarely what anyone intends.
<% if (spec.api.cache) { -%>
 *
 * This project selected the Redis cache layer, so a shared store is available. Wiring the
 * limiter to it makes limits global — see the `store` option in @fastify/rate-limit.
<% } -%>
 *
 * Registered before authentication so unauthenticated floods are rejected before any token
 * verification work is done.
 */
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(fastifyRateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // >>> idp:rate-limit-store
    // <<< idp:rate-limit-store

    // Health probes must never be rate limited: throttling them makes Kubernetes believe the
    // pod is unhealthy and restart it, which is precisely the wrong response to heavy traffic.
    allowList: (request) => request.url === '/health' || request.url === '/ready',

    // Standard RateLimit-* headers so clients can back off intelligently rather than retrying
    // blindly into the limit.
    enableDraftSpec: true,

    errorResponseBuilder: (_request, context) => ({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Retry in ${context.after}.`,
      statusCode: 429,
    }),
  });
}
