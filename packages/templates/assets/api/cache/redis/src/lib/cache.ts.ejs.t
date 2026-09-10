---
to: src/lib/cache.ts
---
import { logger } from './logger.js';
import { redis } from './redis.js';

/**
 * Cache-aside with stampede protection.
 *
 * A hit returns the stored value. A miss loads from the source, stores the result with the TTL
 * and returns it. Concurrent misses for one key in one process share a single load — the map
 * below — rather than each hitting the source, which is the stampede that turns a popular key's
 * expiry into a traffic spike wherever the data comes from.
 *
 * Every Redis operation fails open: a read error is a miss, a write error is logged and skipped.
 * A cache outage costs cache hits, never requests.
 */
const inFlight = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    logger.warn({ err, key }, 'cache read failed; loading from source');
  }

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const loading = (async () => {
    try {
      const value = await load();
      void redis
        .set(key, JSON.stringify(value), 'EX', ttlSeconds)
        .catch((err: unknown) => logger.warn({ err, key }, 'cache write failed'));
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, loading);
  return loading;
}

/** Drops entries when the source changes. A cache that is never invalidated is a stale copy. */
export async function invalidate(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    logger.warn({ err, keys }, 'cache invalidate failed');
  }
}
