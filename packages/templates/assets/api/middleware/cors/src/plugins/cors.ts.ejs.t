---
to: src/plugins/cors.ts
---
import type { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import { env } from '../config/env.js';

/**
 * CORS.
 *
 * The origin list comes from configuration, never a wildcard. `origin: '*'` combined with
 * `credentials: true` is rejected outright by every browser, so an API configured that way
 * fails every authenticated cross-origin request while looking correctly configured — the
 * generator's verify stage fails the build on that combination for exactly this reason.
 *
 * Registered before authentication so preflight OPTIONS requests, which carry no credentials
 * by design, are answered rather than rejected with a 401 the browser reports as an opaque
 * CORS failure.
 */
export async function registerCors(app: FastifyInstance): Promise<void> {
  const origins = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(fastifyCors, {
    origin: origins.length > 0 ? origins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    // Cache preflight for 24h so browsers stop re-asking on every request.
    maxAge: 86400,
  });
}
