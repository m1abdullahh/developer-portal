---
to: src/server.ts
---
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { loggerOptions } from './lib/logger.js';
import { registerHealthRoutes } from './routes/health.js';

/**
 * Builds the server without starting it.
 *
 * Separated from `start()` so tests can exercise routes via `app.inject()` with no port bound —
 * which keeps the suite parallel-safe and free of port collisions.
 */
export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    // Config, not a pre-built instance: `loggerInstance` would narrow the logger generic and
    // break every plugin signature. See src/lib/logger.ts.
    logger: loggerOptions,
    // Trust the proxy so req.ip is the real client behind an ingress controller rather than
    // the pod IP. Rate limiting keys off req.ip, so getting this wrong makes the limiter
    // treat all traffic as coming from a single address.
    trustProxy: true,
    requestIdHeader: 'x-request-id',
  });

  // Plugin registration order is significant: logging must see every request, CORS must answer
  // preflights before auth rejects them, and rate limiting must run before any expensive work.
  // That order is declared by MIDDLEWARE_PRIORITY, not by this file.
  // >>> idp:plugins
  // <<< idp:plugins

  await registerHealthRoutes(app);

  // >>> idp:routes
  // <<< idp:routes

  // ONE error handler for the whole app. Fastify permits only one per scope, so recipes that
  // need special-case handling inject a branch into the marker below rather than calling
  // setErrorHandler themselves — two handlers would mean the later registration silently
  // discards the earlier one.
  //
  // `error` is annotated explicitly: under exactOptionalPropertyTypes, Fastify 5's
  // setErrorHandler overloads do not infer it and it silently widens to `unknown`.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode ?? 500;
    request.log.error({ err: error, status }, 'request failed');

    // >>> idp:error-cases
    // <<< idp:error-cases

    // Stack traces and internal messages never cross the boundary in production — they leak
    // file paths, dependency versions and query shapes.
    const body =
      status >= 500 && env.NODE_ENV === 'production'
        ? { error: 'Internal Server Error', statusCode: 500 }
        : { error: error.name, message: error.message, statusCode: status };

    void reply.status(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    });
  });

  return app;
}
