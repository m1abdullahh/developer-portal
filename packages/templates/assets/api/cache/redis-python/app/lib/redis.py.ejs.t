---
to: app/lib/redis.py
---
import asyncio
import logging

from redis.asyncio import Redis

from app.config import settings

logger = logging.getLogger("<%= spec.meta.slug %>")

# One client per process, and nothing dials until the first command: a service whose Redis is
# briefly unavailable still boots and serves /health, and /ready is where the dependency is
# reported. Short timeouts so a command against a down Redis fails in about a second rather than
# hanging the request that made it.
redis_client: Redis = Redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=2,
    socket_timeout=1,
)


async def check_redis() -> bool:
    """True when Redis answers PING within a second. Used by /ready; never by /health."""
    try:
        return bool(await asyncio.wait_for(redis_client.ping(), timeout=1.0))
    except Exception:
        logger.warning("redis ping failed", exc_info=True)
        return False


async def close_redis() -> None:
    await redis_client.aclose()
