---
to: app/graphql/__init__.py
---
"""GraphQL — code-first with Strawberry.

The Python types in ``schema.py`` *are* the schema, the way Pydantic models are the OpenAPI
document under REST: there is no SDL file to keep in sync. ``GET /schema.graphql`` prints the
schema the server is actually running, and ``strawberry export-schema app.graphql.schema:schema``
prints the same text for anything that wants it as a file.
"""
