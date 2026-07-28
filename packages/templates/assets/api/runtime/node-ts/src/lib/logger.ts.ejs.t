---
to: src/lib/logger.ts
---
import pino, { type LoggerOptions } from 'pino';
import { env } from '../config/env.js';

/**
 * Shared logger configuration.
 *
 * Exported as OPTIONS rather than as a constructed instance, and handed to Fastify as
 * `logger: loggerOptions`. Passing a pre-built pino instance via `loggerInstance` narrows
 * FastifyInstance's logger generic to pino's concrete `Logger`, which then fails to satisfy
 * the `FastifyBaseLogger` that plugin and route signatures expect — a wall of generic
 * mismatch errors whose message never mentions the logger.
 *
 * `redact` is the important part here. Without it, logging a request writes the Authorization
 * header — a live bearer token — into log storage, where it is retained, indexed and readable
 * by anyone with log access.
 */
export const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
  // JSON in production for log aggregators; human-readable locally. Pretty-printing in
  // production would break every structured query downstream.
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
};

/**
 * Standalone logger for code that runs outside a request — boot, shutdown, background work.
 * Request-scoped logging should use `request.log`, which carries the request id.
 */
export const logger = pino(loggerOptions);
