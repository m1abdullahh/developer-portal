---
to: app/__main__.py
---
import uvicorn

from app.config import settings


def main() -> None:
    """Entry point for `python -m app`, and the container's CMD.

    ``app.main:app`` is passed as an import string rather than as the object, because uvicorn can
    only reload or fork workers from something it can re-import. Passing the instance works in
    development and then silently disables ``--reload``.

    No ``--reload`` here: this same module is the container entry point, and a reloader in
    production watches the filesystem forever for changes that never come.
    """
    uvicorn.run(
        "app.main:app",
        # 0.0.0.0, not 127.0.0.1. A container bound to loopback accepts no traffic from outside
        # its own network namespace, so the readiness probe fails and the pod never goes Ready.
        host="0.0.0.0",  # noqa: S104
        port=settings.PORT,
        log_config=None,
        access_log=True,
        # Trust the proxy so the client IP is the real one from X-Forwarded-For rather than the
        # ingress controller's pod IP. Rate limiting keys off that address, so getting this wrong
        # makes the limiter treat all traffic as coming from a single client.
        proxy_headers=True,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
