---
to: app/graphql/context.py
---
from dataclasses import dataclass
<% if (spec.api.middleware.auth === 'jwt') { -%>
from typing import Annotated, Any

from fastapi import Depends
from graphql import GraphQLError
from strawberry.fastapi import BaseContext
from strawberry.types import Info

from app.middleware.auth import AuthenticatedUser, optional_user
<% } else { -%>

from strawberry.fastapi import BaseContext
<% } -%>


@dataclass
class Loaders:
    """One DataLoader per entity that resolvers look up by key.

    A list field resolves once per row, so a resolver that queries the database directly turns a
    page of 50 rows into 51 queries. A ``strawberry.dataloader.DataLoader`` collects every
    ``load(key)`` made during one tick of the event loop, issues a single batched query, and hands
    each caller its row. Instances live here and are created per request in ``get_context`` so the
    cache never outlives the operation that filled it.

    Page modules contribute theirs through the marker region.
    """

    # >>> idp:graphql-loaders
    # <<< idp:graphql-loaders


class Context(BaseContext):
    """Per-request context, handed to every resolver as ``info.context``.

    ``BaseContext`` supplies ``request`` and ``response``; this adds the loaders<% if (spec.api.middleware.auth === 'jwt') { %> and the caller<% } %>.
    """

    def __init__(
        self,
        loaders: Loaders,
<% if (spec.api.middleware.auth === 'jwt') { -%>
        user: AuthenticatedUser | None,
<% } -%>
    ) -> None:
        super().__init__()
        self.loaders = loaders
<% if (spec.api.middleware.auth === 'jwt') { -%>
        self.user = user
<% } -%>


<% if (spec.api.middleware.auth === 'jwt') { -%>
async def get_context(
    # Verified here, not by a route guard on /graphql: one endpoint serves public and protected
    # operations alike, so authentication is optional at the transport and enforced per resolver
    # with require_user(). A missing or invalid token yields an anonymous context, never a 401 for
    # the whole request — the schema decides which fields need a caller.
    user: Annotated[AuthenticatedUser | None, Depends(optional_user)],
) -> Context:
    return Context(loaders=Loaders(), user=user)


def require_user(info: Info[Context, Any]) -> AuthenticatedUser:
    """Call at the top of any resolver that needs a signed-in caller."""
    if info.context.user is None:
        # UNAUTHENTICATED is the code Apollo clients understand. GraphQL errors travel in the
        # response body with a 200, which is the transport's convention rather than a mistake.
        raise GraphQLError(
            "A valid access token is required.",
            extensions={"code": "UNAUTHENTICATED"},
        )
    return info.context.user
<% } else { -%>
async def get_context() -> Context:
    return Context(loaders=Loaders())
<% } -%>
