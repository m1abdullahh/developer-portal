---
to: app/models/__init__.py
---
"""SQLAlchemy table definitions.

Every model module must be imported here. Alembic's autogenerate compares the database against
``Base.metadata``, and a model in a module nobody imports is absent from that metadata — so
autogenerate produces an empty migration, or worse, one that drops the table.

Models inherit from ``app.db.base.Base`` using SQLAlchemy 2's typed style::

    from sqlalchemy.orm import Mapped, mapped_column

    class Widget(Base):
        __tablename__ = "widgets"
        id: Mapped[int] = mapped_column(primary_key=True)
        name: Mapped[str]
"""

from app.db.base import Base  # noqa: F401

# >>> idp:models
# <<< idp:models
