---
to: app/lib/cache.py
---
import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import TypeVar

from app.lib.redis import redis_client

logger = logging.getLogger("<%= spec.meta.slug %>")

T = TypeVar("T")

# One lock per key being loaded, so concurrent misses for one key in this process wait for a single
# load rather than each hitting the source — the stampede that turns a popular key's expiry into a
# traffic spike wherever the data comes from. Entries are removed once the load finishes.
_locks: dict[str, asyncio.Lock] = {}


async def cached(key: str, ttl_seconds: int, load: Callable[[], Awaitable[T]]) -> T:
    """Cache-aside: a hit returns the stored value; a miss loads, stores with the TTL, returns.

    Every Redis operation fails open. A read error is a miss and a write error is logged and
    skipped, so a cache outage costs cache hits, never requests.
    """
    hit = await _get(key)
    if hit is not None:
        return hit  # type: ignore[return-value]

    lock = _locks.setdefault(key, asyncio.Lock())
    try:
        async with lock:
            # Another coroutine may have filled the key while this one waited for the lock.
            hit = await _get(key)
            if hit is not None:
                return hit  # type: ignore[return-value]
            value = await load()
            await _set(key, value, ttl_seconds)
            return value
    finally:
        _locks.pop(key, None)


async def invalidate(*keys: str) -> None:
    """Drops entries when the source changes. A cache that is never invalidated is a stale copy."""
    if not keys:
        return
    try:
        await redis_client.delete(*keys)
    except Exception:
        logger.warning("cache invalidate failed", extra={"keys": list(keys)}, exc_info=True)


async def _get(key: str) -> object | None:
    try:
        raw = await redis_client.get(key)
    except Exception:
        logger.warning("cache read failed; loading from source", extra={"key": key}, exc_info=True)
        return None
    return None if raw is None else json.loads(raw)


async def _set(key: str, value: object, ttl_seconds: int) -> None:
    try:
        await redis_client.set(key, json.dumps(value), ex=ttl_seconds)
    except Exception:
        logger.warning("cache write failed", extra={"key": key}, exc_info=True)
