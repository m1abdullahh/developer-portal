---
to: migrations/versions/README.md
---
Migration scripts live here, one per revision, chained by `down_revision`.

Generate the first one once you have a model:

```bash
uv run alembic revision --autogenerate -m "initial schema"
uv run alembic upgrade head
```

Read what autogenerate produced before applying it. It compares `SQLModel.metadata` against the
live database and is good at additions, unreliable about renames — a renamed column is detected as
a drop plus an add, which applies cleanly and discards the data in it.

This file also keeps the directory in git. Alembic creates it on demand, but a repository whose
`migrations/` has no `versions/` fails `alembic upgrade` on a fresh clone with an error that
mentions neither.
