---
to: app/db/base.py
---
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """The declarative base every model inherits from.

    Its ``metadata`` is what Alembic's autogenerate compares against the live database, which is
    why ``app/models/__init__.py`` must import every model module — a model nobody imports never
    registers here, and autogenerate emits an empty migration or one that drops the table it
    cannot see.
    """
