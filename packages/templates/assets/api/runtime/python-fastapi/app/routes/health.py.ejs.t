---
to: app/routes/health.py
---
import time

from fastapi import APIRouter, Response

router = APIRouter(tags=["health"])

_STARTED_AT = time.monotonic()


@router.get("/health")
async def health() -> dict[str, object]:
    """Liveness — is this process wedged?

    These two paths are CONTRACTUAL: the generated Kubernetes deployment points its probes at them
    (doc 04 §2), and the deployable contract records them so the chart and the image cannot drift.
    Renaming either without updating both causes restart loops that look like an application crash.

    This one deliberately checks nothing downstream. Querying the database from a liveness probe
    means one brief database blip restarts every pod at once, turning a recoverable outage into a
    total one.
    """
    return {
        "status": "ok",
        "service": "<%= spec.meta.slug %>",
        "uptime": round(time.monotonic() - _STARTED_AT, 3),
    }


@router.get("/ready")
async def ready(response: Response) -> dict[str, object]:
    """Readiness — can this pod serve traffic right now?

    Failing this removes the pod from the Service without killing it, which is the correct response
    to a dependency being briefly unavailable.
    """
    checks: dict[str, str] = {}

    # >>> idp:readiness-checks
    # <<< idp:readiness-checks

    failed = any(value == "error" for value in checks.values())
    response.status_code = 503 if failed else 200
    return {"status": "unavailable" if failed else "ready", "checks": checks}
