# 03 — Wizard Step 3: API & Back-End Layer

**Owner:** Engineer 2 (Generator & Stack Lead) · **PRD ref:** §3 Step 3
**Phase:** P1 spine = `node-ts` + `rest` + `postgres/prisma` + all middleware; P3 = everything else

Combination space: 3 runtimes × 3 paradigms × 4 data options × 2⁵ middleware = **1,152 variants**,
minus those blocked by the compatibility matrix. Same composition strategy as Step 2.

---

## 1. Runtime recipes (`api.runtime`)

### 1.1 `node-ts` — Node.js + TypeScript · P1

```
src/index.ts              bootstrap; middleware chain is a codemod target
src/config/env.ts         Zod-validated env, fails fast at boot
src/routes/ | src/graphql/ | src/trpc/     (per paradigm)
src/services/ src/repositories/
src/middleware/           (per middleware recipe)
src/lib/logger.ts
tsconfig.json  vitest.config.ts  .eslintrc
```

Framework: **Fastify** over Express. Rationale: native JSON-schema validation, ~2× throughput,
first-class TS types, and a plugin model that maps cleanly onto our middleware recipes.
Documented deviation — the PRD says "Node.js (TypeScript)" without naming a framework.
An Express variant is a P4 stretch item if a team requests it.

### 1.2 `python-fastapi` — Python + FastAPI · P3

```
app/main.py               FastAPI app factory; middleware registered via marker anchors
app/core/config.py        pydantic-settings
app/api/v1/routers/
app/models/ app/schemas/ app/services/
app/db/session.py
pyproject.toml            uv-managed; ruff + mypy configured
tests/
```

Tooling: **uv** for dependency resolution (10–100× faster than pip, and its lockfile makes
container builds reproducible). Ruff for lint+format. Pydantic v2 schemas.

### 1.3 `go-gin` — Go + Gin · P3

```
cmd/server/main.go
internal/handlers/ internal/middleware/ internal/models/ internal/repository/
internal/config/config.go
pkg/logger/
go.mod  Makefile
```

Gin as default (PRD offers Gin/Fiber; Gin has the larger middleware ecosystem). Fiber is a
template flag, not a separate recipe — the handler signatures differ but the structure is identical.

---

## 2. API paradigm recipes (`api.paradigm`)

### 2.1 `rest` — with auto-generated OpenAPI 3.0 · P1

The PRD requires the spec be **auto-generated**, not hand-written. Per runtime:

| Runtime      | Mechanism                                                                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node/Fastify | `@fastify/swagger` derives OpenAPI from route JSON schemas, which are themselves generated from the Zod validators via `zod-to-json-schema` — one definition, three consumers (runtime validation, OpenAPI, TS types) |
| FastAPI      | Native — Pydantic models produce OpenAPI for free                                                                                                                                                                     |
| Go/Gin       | `swaggo/swag` annotations, generated in a `make docs` step and in CI                                                                                                                                                  |

Every REST project exposes `/docs` (Swagger UI) and `/openapi.json`. The catalog's OpenAPI viewer
(doc 07) consumes that endpoint — this is the integration point, so its path is fixed by contract.

### 2.2 `graphql` — Apollo Server · P3

- Node: Apollo Server 4 + `graphql-codegen` for resolver and client types; schema-first SDL in
  `src/graphql/schema/*.graphql`.
- Python: **Strawberry** (Apollo Server is Node-only) — code-first, type-hint driven.
- Go: **gqlgen** — schema-first with generated resolvers.

All three emit a schema file at a fixed path so the catalog can render it. DataLoader/batching
included by default to avoid the N+1 that every generated GraphQL service otherwise ships with.

### 2.3 `trpc` — Node/TypeScript only · P3

Gated per doc 00 §5.3. Contributes `src/trpc/{router,context,procedures}.ts`, protected-procedure
middleware bound to the auth recipe, and — when a React UI is selected — a typed client
(`lib/trpc.ts`) plus React Query integration wired into the frontend.
Selecting tRPC with `state !== 'react-query'` shows an inline note that tRPC's client uses React
Query internally and that it will be added.

---

## 3. Database & ORM recipes

Selection is two-stage: database first, then a runtime-appropriate ORM (doc 00 §5.4).

| Recipe                                | Contributes                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `postgres-prisma`                     | `schema.prisma`, client singleton, initial migration, seed script, `User`/`Role` models when RBAC or user-management is selected |
| `postgres-drizzle`                    | `src/db/schema.ts`, `drizzle.config.ts`, migration folder, typed query helpers                                                   |
| `postgres-sqlmodel`                   | SQLModel models, Alembic env + initial revision, async session factory                                                           |
| `postgres-sqlalchemy`                 | SQLAlchemy 2.x declarative models, Alembic, async engine                                                                         |
| `postgres-gorm`                       | GORM models, `AutoMigrate` bootstrap, golang-migrate files                                                                       |
| `postgres-sqlc`                       | `queries/*.sql`, `sqlc.yaml`, generated type-safe accessors                                                                      |
| `mongodb-mongoose`                    | Mongoose schemas, connection singleton with retry/backoff, index definitions                                                     |
| `mongodb-beanie`                      | Beanie documents, Motor client, index init on startup                                                                            |
| `mongodb-go`                          | `mongo-go-driver` repositories, index bootstrap                                                                                  |
| `redis-cache` (additive, `api.cache`) | Client singleton, cache-aside helper with TTL + stampede protection, health probe                                                |

Every DB recipe also contributes: a `docker-compose.yml` service for local dev, a `DATABASE_URL`
entry in `.env.example`, a readiness probe that checks connectivity, and migration commands in
the README and CI.

**Migrations:** generated with an initial migration committed. Per PRD anti-scope, no automated
rollback execution — `down` migrations are generated where the tool supports it, and the README
documents the manual rollback procedure explicitly.

---

## 4. Middleware recipes (`api.middleware.*`)

Five independent recipes. Each contributes code, config, env keys, tests and a README section,
and registers itself into the app bootstrap via codemod (Node) or marker anchor (Python/Go).

### 4.1 `auth` — JWT or OAuth

- **JWT:** access+refresh tokens, rotation, `argon2id` password hashing, `requireAuth` and
  `requireRole` guards, token revocation list backed by Redis when `api.cache` is on (in-memory
  fallback with a documented single-instance caveat otherwise).
- **OAuth:** provider config (GitHub/Google/Microsoft), Authorization Code + PKCE, callback route,
  session issuance, account linking.
- Emits `permissions.ts`/`permissions.py`/`permissions.go` shared with the UI's `settingsRbac`
  module so the two enforcement points share one policy definition.

### 4.2 `rateLimit` — Upstash/Redis

Sliding-window limiter. Redis-backed when `api.cache` is on, in-memory otherwise (with an explicit
warning comment that in-memory limits are per-instance and break under horizontal scaling — a
real correctness issue once the HPA from Step 4 scales past one pod).
Per-route override support; `RateLimit-*` response headers; configurable via env.

### 4.3 `cors`

Origin allowlist from env (never `*` when credentials are enabled — the generator refuses that
combination at verify time), preflight caching, methods/headers config, dev-vs-prod defaults.

### 4.4 `validation` — Zod (and equivalents)

- Node: Zod schemas per route → runtime validation **and** OpenAPI **and** TS types.
- Python: Pydantic v2 (native to FastAPI).
- Go: `go-playground/validator` struct tags + a binding middleware.
  Uniform `422` error envelope across all three runtimes so clients behave identically.

### 4.5 `logging` — Winston/Pino

- Node: **Pino** (faster, lower overhead than Winston; Winston available as a flag).
- Python: `structlog`. Go: `zerolog`.
  Common contract across runtimes: JSON output, request-ID propagation via `X-Request-Id`,
  automatic redaction of `authorization`/`cookie`/`password`/`token` fields, level from env,
  pretty-printing in dev only.

---

## 5. Cross-cutting generated artefacts

Regardless of selection, every API project gets:

- `GET /health` (liveness) and `GET /ready` (readiness — checks DB/Redis) — consumed directly by
  the K8s probes in Step 4, so the paths are contractual.
- Graceful shutdown on `SIGTERM` (drain connections) — without this, K8s rolling updates drop requests.
- `.env.example` with every key any selected recipe requires, and `SECRETS.md` describing each.
- Structured error handler with a stable error envelope and no stack traces in production.
- `Dockerfile` (from the Step 4 container recipe) and `docker-compose.yml` for local dev.

---

## 6. Wizard UI behaviour

- Runtime chosen **first**; paradigm/ORM option lists re-render based on it.
- Disabled options always state why: _"tRPC requires the Node.js (TypeScript) runtime."_
- Middleware toggles default **on** for `cors`, `validation`, `logging`, `rateLimit`, and `auth: jwt`
  — production-ready by default, per the PRD's core objective.
- Turning `auth` off warns if `authLayouts` or `settingsRbac` was selected in Step 2.
- **"Skip API layer"** toggle sets `api = null` for static/frontend-only projects.

---

## 7. Acceptance criteria

- [ ] Every valid runtime × paradigm × ORM combination renders, installs and builds (smoke matrix)
- [ ] tRPC is selectable only with `node-ts`; the UI states the reason
- [ ] ORM list contains only runtime-valid entries
- [ ] REST projects serve a valid OpenAPI 3.0 document at `/openapi.json`, verified by a schema validator
- [ ] GraphQL projects expose a valid SDL and include DataLoader batching
- [ ] All five middleware recipes compose in any subset without conflicting registration order
- [ ] `cors` + credentials + wildcard origin fails the `verify` stage
- [ ] Generated migrations apply cleanly against a fresh database in CI
- [ ] `/health` and `/ready` respond correctly; `/ready` fails when the DB is unreachable
- [ ] `api = null` produces a valid frontend-only project
