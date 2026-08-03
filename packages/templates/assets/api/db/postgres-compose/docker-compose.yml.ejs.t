---
to: docker-compose.yml
---
# Local development dependencies.
#
# Root-anchored deliberately: in a UI+API project this stays at the repository root rather
# than under apps/api/, because it serves the whole workspace.
#
# Shared by every Postgres ORM recipe rather than owned by one of them. It used to live inside the
# Prisma recipe, which meant a FastAPI project got a README telling it to run
# `docker compose up -d postgres` against a file that was never generated. Exactly one ORM recipe
# applies to any given spec, so loading one shared template from each cannot collide.
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: <%= h.snake(spec.meta.slug) %>
    ports:
      - '5432:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data
    # Compose waits for this before dependants start. Without it the API races the database
    # on `docker compose up` and dies on a connection refused during the first few seconds.
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
