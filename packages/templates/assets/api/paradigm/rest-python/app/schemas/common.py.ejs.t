---
to: app/schemas/common.py
---
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ErrorResponse(BaseModel):
    """The one failure shape every route reports.

    Identical to the envelope the exception handlers in ``app/main.py`` actually return, and to the
    one the Node and Go runtimes return. A client that has to handle three different error shapes
    from one API ends up with three code paths, and the third is always the one that is wrong.
    """

    error: str = Field(description="Short machine-readable error name")
    message: str | None = Field(default=None, description="Human-readable detail")
    statusCode: int = Field(description="HTTP status code")  # noqa: N815


class ValidationErrorDetail(BaseModel):
    field: str = Field(description="Dotted path to the field that failed")
    message: str


class ValidationErrorResponse(ErrorResponse):
    details: list[ValidationErrorDetail] = Field(default_factory=list)


class PaginationQuery(BaseModel):
    """Cursor pagination rather than offset.

    Offset pagination silently skips or repeats rows when the underlying set changes between
    requests, which is the norm for any actively-written table. A cursor is stable.
    """

    cursor: str | None = Field(default=None, description="Opaque cursor from the previous page")
    limit: Annotated[int, Field(ge=1, le=100)] = 20


class Page(BaseModel, Generic[T]):
    """Use as ``Page[Widget]`` in a response model.

    A generic model rather than a factory function, because FastAPI reads the annotation to build
    the OpenAPI schema — a function returning a dynamically-created class produces a document full
    of anonymous inline objects that no client generator can name.
    """

    data: list[T]
    nextCursor: str | None = Field(  # noqa: N815
        default=None, description="Pass as `cursor` to fetch the next page"
    )


# Attached to routes that can fail in these ways:
#
#     @router.get("/widgets", responses=COMMON_RESPONSES)
#
# Documenting them matters more than it looks: a generated client only handles the status codes
# the document declares, so an undocumented 429 becomes an unhandled exception in every consumer
# the first time the rate limiter fires.
COMMON_RESPONSES: dict[int | str, dict[str, object]] = {
    400: {"model": ErrorResponse, "description": "Malformed request"},
    401: {"model": ErrorResponse, "description": "Authentication required"},
    403: {"model": ErrorResponse, "description": "Insufficient permissions"},
    404: {"model": ErrorResponse, "description": "Resource not found"},
    422: {"model": ValidationErrorResponse, "description": "Validation failed"},
    429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    500: {"model": ErrorResponse, "description": "Internal server error"},
}
