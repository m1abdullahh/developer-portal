---
to: alembic.ini
---
[alembic]
script_location = migrations

# Timestamped, not just a hash. Alembic orders migrations by the `down_revision` chain rather than
# by filename, so the name is purely for humans — and a directory of bare hashes tells a reviewer
# nothing about what came first.
file_template = %%(year)d%%(month).2d%%(day).2d_%%(hour).2d%%(minute).2d_%%(rev)s_%%(slug)s

# Deliberately empty. The URL comes from DATABASE_URL via migrations/env.py, because putting it
# here would commit a production connection string — password included — to the repository.
sqlalchemy.url =

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARNING
handlers = console
qualname =

[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %%(levelname)-5.5s [%%(name)s] %%(message)s
datefmt = %%H:%%M:%%S
