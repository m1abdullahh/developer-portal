---
to: app/middleware/rate_limit.py
---
import time
from collections import defaultdict

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from app.config import settings

# Probes are exempt. Throttling /health means Kubernetes eventually fails the liveness check and
# restarts a pod that was only ever guilty of being probed on schedule — a self-inflicted outage
# that looks exactly like an application crash.
EXEMPT_PATHS = frozenset({"/health", "/ready"})


def _window_seconds(value: str) -> int:
    """Parses `1 minute`, `30 seconds`, `1 hour` — the same vocabulary the Node runtime accepts.

    Deliberately the same strings, because RATE_LIMIT_WINDOW is set by the Helm chart and a team
    running one service in each language should not have to remember two formats.
    """
    parts = value.strip().split()
    amount = int(parts[0]) if parts and parts[0].isdigit() else 1
    unit = parts[-1].rstrip("s").lower()
    return amount * {"second": 1, "minute": 60, "hour": 3600, "day": 86400}.get(unit, 60)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Fixed-window counters, per process.

    **The limit is per instance, not global.** With the HPA enabled a limit of 100 becomes
    100 x replica-count and changes silently whenever the cluster scales. Enable the Redis cache
    layer in the wizard for a shared counter.

    Fixed window rather than sliding: it is the same algorithm the Node runtime's limiter uses by
    default, so the two behave identically at a boundary, and a sliding window would need to retain
    every request timestamp rather than one integer per client.
    """

    def __init__(self, app: FastAPI, max_requests: int, window: int) -> None:
        super().__init__(app)
        self.max_requests = max_requests
        self.window = window
        self.hits: dict[str, int] = defaultdict(int)
        self.window_started = time.monotonic()

    def _client_key(self, request: Request) -> str:
        # X-Forwarded-For's first entry is the original client; uvicorn is started with
        # proxy_headers so request.client.host is already resolved, but the header is checked
        # first for the case where another proxy sits in front.
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        now = time.monotonic()
        elapsed = now - self.window_started

        # Clearing the whole map at the window boundary is also what bounds memory. Per-key expiry
        # would leave an entry per address seen, and an unbounded dict keyed by client IP is a
        # denial-of-service vector rather than a rate limiter.
        if elapsed >= self.window:
            self.hits.clear()
            self.window_started = now
            elapsed = 0.0

        key = self._client_key(request)
        self.hits[key] += 1
        remaining = max(0, self.max_requests - self.hits[key])
        reset_in = max(0, int(self.window - elapsed))

        if self.hits[key] > self.max_requests:
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Too Many Requests",
                    "message": f"Rate limit of {self.max_requests} requests exceeded.",
                    "statusCode": 429,
                },
                headers={
                    "retry-after": str(reset_in),
                    "x-ratelimit-limit": str(self.max_requests),
                    "x-ratelimit-remaining": "0",
                    "x-ratelimit-reset": str(reset_in),
                },
            )

        response = await call_next(request)
        response.headers["x-ratelimit-limit"] = str(self.max_requests)
        response.headers["x-ratelimit-remaining"] = str(remaining)
        response.headers["x-ratelimit-reset"] = str(reset_in)
        return response


def install_rate_limit(app: FastAPI) -> None:
    app.add_middleware(
        RateLimitMiddleware,
        max_requests=settings.RATE_LIMIT_MAX,
        window=_window_seconds(settings.RATE_LIMIT_WINDOW),
    )
