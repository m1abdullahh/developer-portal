---
to: app/lib/openapi.py
---
from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi


def install_openapi(app: FastAPI) -> None:
    """Enriches the generated document; never replaces it.

    The schema is still derived from the route signatures and Pydantic models, so it cannot drift
    from the implementation — there is nothing to keep in sync. What this adds is the metadata
    FastAPI has no way to infer, and which a linter like Spectral requires:

      * a description and contact, so `info` is complete
      * the bearer security scheme, so `/docs` can send an Authorization header
      * `servers`, so a generated client has a base URL rather than a relative path

    Cached on ``app.openapi_schema`` because ``get_openapi`` walks every route and model on each
    call, and `/openapi.json` is fetched by the Service Catalog on a schedule.
    """

    def custom_openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema

        schema = get_openapi(
            title=app.title,
            version=app.version,
            # 3.1 is what FastAPI emits and what Pydantic v2's JSON Schema targets. Downgrading to
            # 3.0 would silently lose `examples` and nullable unions.
            openapi_version="3.1.0",
            description="<%= (spec.meta.description || spec.meta.slug).replace(/"/g, '\\"') %>",
            routes=app.routes,
            contact={"name": "<%= spec.meta.repo.org %>"},
        )

        schema["servers"] = [{"url": "/", "description": "This deployment"}]

<% if (spec.api.middleware.auth === 'jwt') { -%>
        schema.setdefault("components", {})["securitySchemes"] = {
            "bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
        }
<% } -%>

        app.openapi_schema = schema
        return schema

    app.openapi = custom_openapi  # type: ignore[method-assign]
