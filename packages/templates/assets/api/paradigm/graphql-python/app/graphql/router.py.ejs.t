---
to: app/graphql/router.py
---
from fastapi import APIRouter
from fastapi.responses import PlainTextResponse
from strawberry.fastapi import GraphQLRouter

from app.config import settings
from app.graphql.context import get_context
from app.graphql.schema import schema

router = APIRouter()

# Mounted through the `routes` region of app/main.py, so every middleware registered in the
# `plugins` region — logging, CORS, rate limiting — runs in front of it like any other route.
graphql_router = GraphQLRouter(
    schema,
    path="/graphql",
    context_getter=get_context,
    # GraphiQL on GET /graphql in development; nothing in production, where the schema is still
    # available as text below.
    graphql_ide=None if settings.ENVIRONMENT == "production" else "graphiql",
)
router.include_router(graphql_router)


@router.get("/schema.graphql", response_class=PlainTextResponse, include_in_schema=False)
async def schema_sdl() -> str:
    """The schema the server is running, as SDL.

    A CONTRACT: the portal's Service Catalog reads this API's shape from exactly this path
    (doc 07 §4). Changing it removes the schema from the catalog.
    """
    return str(schema)
