---
to: app/middleware/cors.py
---
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.config import settings


def install_cors(app: FastAPI) -> None:
    """Allowed origins come from CORS_ORIGINS, never a wildcard.

    ``origin: "*"`` with ``allow_credentials=True`` is rejected by every browser, so an API
    configured that way fails every authenticated cross-origin request while appearing correct in
    every server-side test. Starlette will not stop you; this does.
    """
    origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]

    if "*" in origins:
        raise ValueError(
            "CORS_ORIGINS contains '*', which browsers reject when credentials are allowed. "
            "List the origins explicitly."
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["authorization", "content-type", "x-request-id"],
        expose_headers=["x-request-id"],
        # Cache the preflight for 10 minutes. Without it a browser sends an OPTIONS before every
        # single cross-origin request, doubling the request count for no benefit.
        max_age=600,
    )
