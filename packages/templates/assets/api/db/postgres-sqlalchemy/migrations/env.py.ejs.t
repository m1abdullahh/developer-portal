---
to: migrations/env.py
---
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection

# app.models is imported for the side effect of registering every table on Base.metadata.
# Without it autogenerate sees an empty metadata and produces a migration that drops every table
# it finds in the database — a data-loss bug that looks like a working tool.
import app.models  # noqa: F401
from app.config import settings
from app.db.base import Base
from app.db.session import async_url

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """`alembic upgrade --sql`, which emits SQL without connecting."""
    context.configure(
        url=async_url(settings.DATABASE_URL),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # Without this, autogenerate never notices a column changing from VARCHAR(50) to
        # VARCHAR(100) — it compares names and nullability only, and silently emits nothing.
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    # A fresh engine rather than the one in app.db.session: that one is created at import with a
    # pool sized for serving traffic, and a migration is a single short-lived connection.
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(async_url(settings.DATABASE_URL), poolclass=None)

    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
