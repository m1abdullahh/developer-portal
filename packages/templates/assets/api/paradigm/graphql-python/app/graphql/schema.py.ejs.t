---
to: app/graphql/schema.py
---
import time

import strawberry
from graphql import NoSchemaIntrospectionCustomRule
from strawberry.extensions import AddValidationRules, MaskErrors, SchemaExtension

from app.config import settings

_STARTED_AT = time.monotonic()


@strawberry.type(description="Liveness, mirrored from GET /health so one query proves the stack.")
class Health:
    status: str
    service: str
    uptime: float = strawberry.field(description="Seconds since the process started.")


@strawberry.type
class Query:
    @strawberry.field
    def health(self) -> Health:
        return Health(
            status="ok",
            service="<%= spec.meta.slug %>",
            uptime=round(time.monotonic() - _STARTED_AT, 3),
        )

    # Page modules and your own code add fields below. Look entities up through
    # ``info.context.loaders`` rather than querying directly — see context.py for why.
    # >>> idp:graphql-query-fields
    # <<< idp:graphql-query-fields


def _extensions() -> list[type[SchemaExtension] | SchemaExtension]:
    """Production hardening, applied only where it belongs.

    Introspection and the IDE are development tools; the schema stays available in production at
    ``/schema.graphql`` as text. ``MaskErrors`` replaces unexpected exception messages with a
    generic one — the same rule the REST error handler applies — while errors raised deliberately
    as ``GraphQLError`` keep their message and code.
    """
    if settings.ENVIRONMENT == "production":
        return [AddValidationRules([NoSchemaIntrospectionCustomRule]), MaskErrors()]
    return []


schema = strawberry.Schema(query=Query, extensions=_extensions())
