---
to: src/lib/redis.ts
---
// The named export, not the default: under NodeNext module resolution ioredis 6's default import
// resolves to the module namespace, and `new` on it fails to compile. `Redis` is exported by name
// in both the 5 and 6 lines.
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * The Redis client, shared by the cache helper and the rate limiter.
 *
 * `lazyConnect`: nothing dials until the first command, so a service whose Redis is briefly
 * unavailable still boots and serves /health — /ready is where the dependency is reported.
 * `maxRetriesPerRequest: 1` and `commandTimeout`: a command against a down Redis fails in about a
 * second instead of retrying until a reconnect that may never come, which is the difference
 * between a cache miss and a request that hangs.
 */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 2_000,
  commandTimeout: 1_000,
});

// ioredis emits 'error' on every failed reconnect. Unhandled, each is a process warning; handled,
// it is one log line while the client keeps retrying in the background.
redis.on('error', (err: Error) => logger.warn({ err }, 'redis connection error'));

/** True when Redis answers PING. Used by /ready; never by /health. */
export async function checkRedis(): Promise<boolean> {
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}
