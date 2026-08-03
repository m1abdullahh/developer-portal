---
to: app/db/session.py
---
import logging
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.sql import text

from app.config import settings

logger = logging.getLogger("<%= spec.meta.slug %>.db")


def async_url(url: str) -> str:
    """Rewrites a plain `postgresql://` URL to the async driver SQLAlchemy needs.

    DATABASE_URL is written by hand, by Helm, and by every Postgres provider's console — and all
    of them produce the sync form. Passing that to `create_async_engine` raises
    ``InvalidRequestError: The asyncio extension requires an async driver``, which names neither
    the variable nor the fix.
    """
    if url.startswith("postgresql+"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        # The scheme Heroku and several managed providers still emit. SQLAlchemy has never
        # accepted it.
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


engine: AsyncEngine = create_async_engine(
    async_url(settings.DATABASE_URL),
    # Echo only in development: SQL logging in production writes every parameter — including the
    # ones bound from a password reset or a token lookup — into log storage.
    echo=settings.ENVIRONMENT == "development",
    # Recycle before most managed Postgres services and load balancers drop an idle connection.
    # Without this the first query after a quiet period fails with a server-closed error, once,
    # per connection — the classic "it only breaks in the morning" bug.
    pool_pre_ping=True,
    pool_recycle=1800,
)

# expire_on_commit=False so an object stays usable after the session commits. The default expires
# every attribute, which under async means the next attribute access triggers a lazy refresh
# outside the session's context and raises MissingGreenlet — an error whose message says nothing
# about why.
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request, always closed.

        @router.get("/widgets")
        async def list_widgets(session: AsyncSession = Depends(get_session)): ...
    """
    async with SessionLocal() as session:
        yield session


async def check_database() -> bool:
    """Used by `/ready`, and deliberately not by `/health`.

    `SELECT 1` rather than opening a session: this must answer whether the pool can reach the
    server, not whether the ORM is configured.
    """
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.warning("database readiness check failed", exc_info=True)
        return False


async def close_database() -> None:
    """Disposes the pool on shutdown.

    Without this, SIGTERM leaves connections open until the server times them out. On a cluster
    that rolls pods often, that is a slow leak of the database's connection limit — which fails
    somewhere else entirely, as a new pod unable to connect.
    """
    await engine.dispose()
