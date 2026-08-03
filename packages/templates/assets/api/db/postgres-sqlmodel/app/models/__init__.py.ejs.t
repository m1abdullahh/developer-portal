---
to: app/models/__init__.py
---
"""SQLModel table definitions.

Every model must be imported here. Alembic's autogenerate compares the database against
``SQLModel.metadata``, and a model in a module nobody imports is absent from that metadata — so
autogenerate produces an empty migration, or worse, one that drops the table.
"""

# >>> idp:models
# <<< idp:models
