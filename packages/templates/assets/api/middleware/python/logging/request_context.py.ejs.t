---
to: app/middleware/request_context.py
---
import logging
import time
import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

logger = logging.getLogger("<%= spec.meta.slug %>.request")

# A ContextVar rather than a global or a thread-local. Under asyncio many requests share one
# thread, so a thread-local would leak one request's id into another's log lines — intermittently,
# and only under concurrency, which is the hardest version of this bug to find.
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class RequestIdFilter(logging.Filter):
    """Attaches the current request id to every record, including ones this file never sees.

    A filter rather than a formatter change, so a log line emitted deep inside a route handler
    carries the same id as the access log line for that request.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Propagated from the inbound header when present, so one id follows a request across
        # services rather than each hop inventing its own.
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        token = request_id_var.set(request_id)
        started = time.perf_counter()

        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.info(
            "request completed",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
                "request_id": request_id,
            },
        )

        # Echoed back so a client — or an operator reading a browser network tab — can quote the
        # id when reporting a failure.
        response.headers["x-request-id"] = request_id
        return response


def install_request_context(app: FastAPI) -> None:
    logging.getLogger().addFilter(RequestIdFilter())
    app.add_middleware(RequestContextMiddleware)
