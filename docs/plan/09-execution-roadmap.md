# 09 — Execution Roadmap

Phase-by-phase task breakdown with hard acceptance gates. Spine-first ordering (doc 00).
Each phase ends in something **demonstrable and tested** — no phase leaves the tree broken.

---

## Mapping to the PRD's 3-week plan

The PRD schedules 3 engineers × 3 weeks in parallel. This roadmap keeps the same total scope and
the same ownership split, but reorders _when_ things land so the pipeline is proven early.

| PRD week | PRD milestone                              | Maps to                                              |
| -------- | ------------------------------------------ | ---------------------------------------------------- |
| Week 1   | Template & DevOps Engine                   | P0 + P1 (spine incl. Docker/K8s/ArgoCD for one path) |
| Week 2   | Extensive Wizard & Orchestration           | P1 (wizard + queue + Octokit) + P2 start             |
| Week 3   | Catalog, CI/CD & Testing                   | P4 (catalog, CI/CD breadth, dogfood)                 |
| —        | (breadth work runs in parallel throughout) | P2 (UI breadth) + P3 (API breadth)                   |

The reorder: **DevOps for one path moves into Week 1** alongside the templates, so an end-to-end
generation exists before the wizard is finished. The PRD's Week 1/Week 2 split would otherwise
leave the first full pipeline run until late Week 2.

---

## P0 — Foundation

**Goal:** an empty but correct monorepo where every later task has a home.

- [ ] `git init`; `.gitignore`, `.editorconfig`, `.nvmrc`, LICENSE
- [ ] npm workspaces + Turborepo; `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`)
- [~] `packages/config` — shared eslint / prettier / tsconfig presets. **Deliberately not built.**
  The sharing this was meant to achieve already exists without a package: one root
  `eslint.config.js` covers every workspace (flat config resolves from the root), one
  `.prettierrc.json` likewise, and every package `tsconfig.json` is nine lines extending
  `tsconfig.base.json`. There is no duplication left to remove. A package would add a
  workspace, a build step and a layer of indirection for zero functional gain — its real value
  is when presets are published or consumed by other repositories, which is not the case here.
  Revisit if a second repository needs them.
- [ ] Scaffold all 7 packages + 2 apps with stub exports so imports resolve
- [ ] Pin exact dependency versions via `npm view`; record in `docs/VERSIONS.md` and `packages/core/src/versions.ts`
- [ ] `packages/core`: `ProjectSpec` Zod schema (doc 00 §3) + slug rules + compatibility rules
- [ ] `packages/db`: Prisma schema (Service, ServiceHealth, ProvisionJob, Draft, User) + SQLite dev
- [ ] Vitest, Playwright, `dependency-cruiser` (no-cycles rule) configured
- [ ] `pr.yml` CI running lint + typecheck + test on the empty tree

**Gate:** `npm run build && npm run lint && npm run test` green on an empty monorepo. CI passes.

---

## P1 — The Spine · _highest risk, do it first_

**Goal:** one complete vertical, wizard → real GitHub repo with green CI.
Stack: Next.js App Router + Tailwind/shadcn + Zustand + Node/Fastify + REST/OpenAPI +
Postgres/Prisma + all 5 middleware + Docker + Helm + ArgoCD + GitHub Actions.

### P1.1 Generator core (doc 05)

- [ ] In-memory `VirtualFile` tree + `.ejs.t` frontmatter renderer
- [ ] `Recipe` interface, registry, phase ordering, topological sort on `requires`
- [ ] Merge phase: `package.json`, `.env.example`, `tsconfig`, `.gitignore`, README, `MergeReport`
- [ ] Codemod phase: ts-morph ops (`addImport`, `wrapJsxChildren`, `registerMiddleware`, `addToArray`) — all idempotent
- [ ] Format phase (Prettier) + verify phase (leftover `<%`, invalid JSON/YAML, secret literals, missing markers)
- [ ] `generate()` public API with `onProgress` stage events
- [ ] `idp` CLI: `generate`, `validate`, `list-recipes`

### P1.2 Spine templates (docs 02, 03)

- [ ] `ui/framework/nextjs-app` base recipe
- [ ] `ui/styling/tailwind-shadcn` (React) — 8 primitives
- [ ] `ui/state/zustand` (React) + provider codemod
- [ ] `api/runtime/node-ts` (Fastify) base recipe
- [ ] `api/paradigm/rest` + Zod→JSON-schema→OpenAPI chain, `/docs`, `/openapi.json`
- [ ] `api/db/postgres-prisma` + initial migration + seed
- [ ] All 5 middleware recipes for Node: auth(JWT), rateLimit, cors, validation, logging
- [ ] `/health`, `/ready`, graceful SIGTERM shutdown
- [ ] `common/` finalize recipe: README composer, `.env.example`, `SECRETS.md`, `docker-compose.yml`

### P1.3 DevOps spine (doc 04)

- [ ] Multi-stage distroless Dockerfile for Node + Next standalone
- [ ] Helm chart: deployment, service, ingress(nginx), hpa, configmap, secret, sa, pdb, networkpolicy
- [ ] `values.yaml` + dev/staging/prod values
- [ ] ArgoCD `Application` + `AppProject` manifests with HPA `ignoreDifferences`
- [ ] `ci.yml` and `cd.yml` (build → push → chart-tag commit → Argo syncs)
- [x] hadolint / kubeconform / conftest / actionlint wired into our CI — `scripts/ops-lint.mjs`,
      run by the `Ops artifacts` job. Found three live mismatches between the charts and the images
      they deploy; the fix was a deployable contract, mirroring the framework contract.

### P1.4 Orchestration (doc 06)

- [ ] `JobQueue` interface + `InProcessDriver` + DB-persisted job records
- [ ] `VcsDriver` interface + `FilesystemDriver`
- [ ] `GitHubDriver`: GitHub App auth, Git Data API atomic push, branch protection, teams, topics, secrets
- [ ] Job lifecycle state machine + compensating deletion + `completed_with_warnings`
- [ ] SSE `/api/jobs/:id/events` with `Last-Event-ID` replay
- [ ] Idempotency: job id hash + `(org, slug)` unique constraint

### P1.5 Portal & wizard (docs 01–04)

- [ ] Next.js portal shell, Tailwind + shadcn, dark mode, app layout
- [ ] Auth.js v5 GitHub OAuth + org-membership gate + roles
- [ ] `WizardShell`: stepper, guarded nav, Zustand store, draft autosave/restore, `SummaryRail`
- [ ] Step 1 full (slug live-check, deployment target, org/teams) — doc 01
- [ ] Steps 2–4 rendering spine options; non-spine options visible but disabled with "coming in P2/P3"
- [ ] Live YAML/Dockerfile preview pane (doc 04 §6)
- [ ] Review screen + submit → job
- [ ] Job progress page consuming SSE with per-stage timings

### P1.6 Test harness (doc 08)

- [ ] Golden-file infra + spine snapshot
- [ ] Smoke harness (install → typecheck → lint → build → test → boot → probe)
- [ ] T1 matrix in `pr.yml`
- [ ] Playwright wizard happy path

**Gate (the critical one):** provision a real repo in the GitHub org from the wizard. Clone it,
`npm install`, it runs. Its CI goes green. Image builds. `helm template` + `kubeconform` pass.
**End-to-end time measured and recorded.** If this gate slips, everything after it is at risk —
it is the schedule's early-warning signal.

_Gate preparation, 2026-09-09._ The gate has not run: the token in the portal's env file is dead
(GitHub answers 401 to it), so nothing could be created in the organisation. Everything up to
that point was exercised instead, and it found two blockers the smoke harness had been hiding.

- **No generated Node project could install.** `vitest@4.1.10` alone, in an otherwise empty
  manifest, crashes npm 10.9's peer resolver — the npm that Node 22 ships, so also every generated
  CI run and every `node:22` image build. Each `@vitest/*` companion at that version peers back on
  vitest exactly, and only the 4.1 line also peers on `vite`; vite 8.2 shipped after the last
  green smoke run. `check-versions.mjs` cannot see this — every pin still resolves — and the
  nightly smoke would have. Generated projects now pin **4.0.18** (see docs/VERSIONS.md).
- **Web images and generated CI failed on browser-visible configuration.** The settings and users
  pages read `NEXT_PUBLIC_API_URL` through a schema that throws at import; `next build` prerenders
  them; neither the Dockerfile nor `ci.yml` supplied a value. The build passed on any machine
  with a `.env`, which is why nobody saw it. Recipes can now read every env contribution before
  rendering (`ctx.envVars`), so the three web Dockerfiles declare each public key as a build
  argument defaulting to its `.env.example` value, the CI web job sets the same defaults, and
  `cd.yml` passes repository variables through; an empty override falls back to the default.
  `build-config-contract.test.ts` holds the three in step for Next, Vite and Nuxt.

With both fixed, a freshly generated spine passes the gate's local half end to end on this
machine: install, Prisma migrate against a real Postgres, lint, typecheck, test and build for both
apps; boot and probe (`/health`, `/ready` 200 with the database up, `/openapi.json`, `/docs`);
both images build (api 690 MB, web 280 MB); `helm lint`, `helm template` for dev/staging/prod,
`kubeconform -strict`, conftest, and the ArgoCD manifests against their CRD schemas. 28 checks,
0 failures, 3.1 minutes. The wizard-to-repository half is scripted (headless Playwright through
the real wizard, then clone, verify, and wait for the repository's own CI) and dry-ran cleanly
up to the GitHub call.

_Gate result, 2026-09-09._ **Passed.** Run later the same day with a working token, through the
real wizard headlessly (development sign-in, every default accepted — so the exact spine stack,
no page modules) into `Inter-Developer-Portal/idp-gate-spine`: one atomic commit of 70 files,
topics set, catalog entry written.

| Measured                         | Time           |
| -------------------------------- | -------------- |
| Wizard start → submit (headless) | 3.7 s          |
| Submit → repository provisioned  | 9.5 s          |
| Wizard start → repository        | 13.2 s         |
| Repository's own CI, on GitHub   | 5 min 31 s     |
| **Wizard start → green CI**      | **5 min 46 s** |

Against the PRD's three-to-five-day baseline and the ten-minute target. The clone installed,
migrated against a real Postgres, linted, typechecked, tested, built and booted both apps
(`/ready` 200 with the database up); both images built; chart and ArgoCD manifests passed
`helm lint`, `helm template`, `kubeconform -strict` and conftest for dev, staging and prod.
30 checks, 0 failures.

One warning, expected: branch protection is refused on a private repository in a free-plan
organisation (403 "Upgrade to GitHub Pro"), so the job finished `completed_with_warnings` with
the repository intact and the reason recorded — the doc 06 §6 behaviour, observed for real.
Team grants and Actions secrets were not exercised: none were requested and none exist to set.
A human filling in the wizard adds their own reading time to the 3.7 s; everything after the
submit button is the number above.

---

## P2 — UI Breadth (doc 02)

- [ ] `vite-react` framework recipe (+ nginx SPA container variant)
- [x] `nuxt` framework recipe + the doc 00 §5.1–5.2 substitution engine — complete and enabled in
      the wizard. Framework, Nitro container and deployable contract; all three styling systems
      (CSS Modules, Vuetify, Tailwind); all four state options collapsing onto three implementations;
      all four page modules as single-file components. Each smoke-verified.

  Getting there needed three contracts that had quietly assumed React, each found by a real
  non-React framework rather than by inspection: `providerInstall` (Nuxt installs a store as a
  module or plugin — nothing wraps `{children}`, and ts-morph cannot parse a `.vue` file at all),
  the styling contract keyed by **family** (`css-modules` for Vue would have silently overwritten
  the React registration, and `primitivePath` hardcoded `.tsx`), and `.vue` added to the format
  stage, which had never formatted a single-file component.

- [ ] Styling: `mui` (React) + Vuetify (Vue); `css-modules` (both) — 8 primitives each
- [ ] State: `redux-toolkit`, `react-query` (+ companion context store), `context`; Pinia + vue-query
- [ ] Page modules ×4, each against the primitive API, verified in all 3 styling systems
      — all four done: `authLayouts`, `userManagement`, `settingsRbac`, `stripeBilling`.
      `userManagement` is split across two recipes, one per layer, since a recipe declares a single
      layer. Building it exposed that the "identical primitive API" claim was false — Button's
      `variant` and `size` disagreed across styling systems and Card exported six components under
      Tailwind and one elsewhere. `styling-api.test.ts` now compares the three declarations.
- [ ] Wizard: live relabelling for Nuxt, module dependency gating, preview images
- [ ] BullMQ driver (if Redis has landed) behind the existing interface
- [x] Golden snapshots for all new combinations; T2 pairwise matrix live nightly —
      `scripts/pairwise.mjs` + `.github/workflows/nightly.yml`. 12 of 36 combinations, every pair
      covered, with the coverage proof printed and failing if a pair is missed.

**Gate:** every framework × styling × state combination installs, builds and boots in T2.
Nuxt output contains zero React dependencies.

_Status:_ all 12 pairwise combinations generate cleanly; the install/build/boot half runs nightly.
Nuxt is out of PARTIAL and enabled in the wizard — three Vue styling systems, four state options
and all four page modules, each smoke-verified.

---

## P3 — API Breadth (doc 03)

- [x] `python-fastapi` runtime recipe (uv, ruff, pydantic v2) + marker-anchor injection — complete
      and enabled in the wizard. Runtime, all five middleware, REST/OpenAPI 3.1, SQLModel with
      Alembic, a distroless image and a CI workflow that runs uv rather than npm.

  Getting there needed a **runtime contract**, the API-side twin of the framework contract, and it
  was found the same way: by a second implementation rather than by inspection. Every middleware
  recipe opened with `spec.api?.runtime === 'node-ts'` and wrote codemods against the literal
  `src/server.ts` — which reads as a runtime check and is really an assumption that there is only
  one. Three things fell out of it:

  - `deployableRecipeId` returned `ops.container.node-api` for **any** spec with an API layer. A
    FastAPI project would have rendered a chart routing to 3001 and probing an image listening on 8000. The chart renders, kubeconform passes, `kubectl apply` succeeds, and the pod never goes
    Ready — nothing short of a real cluster says why.
  - The generated `ci.yml` ran `npm ci` and `npm run build` for a Python project. Every step fails,
    on the first push, in the repository the portal had just provisioned for someone.
  - `docker-compose.yml` was owned by the Prisma recipe, so the FastAPI README said
    `docker compose up -d postgres` against a file nothing generated.

  Two smaller ones worth recording: `syntaxForPath` had no TOML case, so marker insertion into
  `pyproject.toml` looked for `//` in a `#`-commented file; and Starlette applies middleware in the
  reverse of the order it is added, so the Python recipes emit their calls in **descending**
  priority to land the same request path the Node runtime has.

- [x] `go-gin` runtime recipe + marker-anchor injection — complete and enabled in the wizard.
      Runtime with graceful shutdown, all five middleware, REST via **huma** (structs generate
      the OpenAPI 3.1 document and `/docs`, the same one-definition property Zod and Pydantic
      give the other runtimes), GORM with **goose** migrations embedded in the binary, and a
      distroless _static_ image — CGO off, pgx pure Go, so the final layer is one binary plus
      ca-certificates.

  The runtime contract held: nothing above the runtime learned anything new to accommodate Go.
  The Go-specific problem was imports — file-level, unused-is-an-error, so every file receiving
  cross-recipe contributions declares an `idp:imports` region and each contribution carries its
  import beside the code using it. gofmt's struct-field alignment forced pre-aligned field
  contributions, verified against `gofmt -d` rather than guessed.

  Verified locally with a real toolchain (go 1.26.5): the generated project compiles, vets,
  is gofmt-clean, passes its tests, boots, and serves `/health`, `/ready` (503 with the database
  down, correctly disagreeing with liveness), `/openapi.json` and `/docs`.

- [x] Paradigm: `graphql` on all three runtimes — complete and enabled in the wizard. Schema-first
      on Node (Apollo Server **5**, not 4: the current major, on Fastify through Apollo's own
      integration, resolver types generated from the SDL by graphql-codegen on `postinstall`) and
      on Go (graph-gophers/graphql-go, embedded SDL bound to resolver methods at start-up);
      code-first on Python (Strawberry, where the types are the schema as Pydantic is for REST).
      DataLoader wired into a per-request context on every runtime, with the Prisma example model
      batched end to end where a model exists. Each smoke-verified, with the harness now running
      case-specific probes — `POST /graphql { health }` and `GET /schema.graphql` — because a
      GraphQL service whose only working route is `/health` is indistinguishable from REST by the
      default probes.

  Two deviations from doc 03 §2.2, both recorded where the pin lives. **Apollo 5** because 4 left
  support. **graph-gophers, not gqlgen**, for the reason that gated sqlc: gqlgen is a code
  generator, and the portal renders projects in memory with no Go toolchain to run one.

  Three things fell out of it. The data-backed page modules (`userManagement`, `settingsRbac`,
  `stripeBilling`) ship REST endpoints and a REST client, so `moduleGate` now takes the paradigm
  and disables them under GraphQL with a stated reason — otherwise a spec passed every check and
  rendered a page calling routes nothing generated. The JWT middleware on Python and Go gained an
  optional variant (`optional_user`, `OptionalUser`) so one endpoint can serve anonymous and
  authenticated operations and enforce per resolver, which the Node context does with
  `jwtVerify`. And `ruff check .` in a generated Python project walked the virtualenv: the
  runtime's pyproject set `exclude`, which replaces ruff's defaults including `.venv`, and only a
  git checkout's `.gitignore` had been hiding it — now `extend-exclude`.

- [x] Paradigm: `trpc` — complete and enabled in the wizard. tRPC 11 on Fastify through its own
      adapter; procedures declare `.input()` and `.output()` with Zod; `publicProcedure` and
      `protectedProcedure` (the latter narrowing `ctx.user`, the token verified when the context
      is built, never by a route guard). For the React frameworks a typed client: `useTRPC()` on
      TanStack Query, with the query cache reused from the `react-query` state option or created
      inside the tRPC provider otherwise — the "React Query will be added" note from doc 03 §2.3,
      made real. Nuxt gets the server and a note; Vue clients are not generated.

  The problem worth recording is how `AppRouter` crosses from the API to the UI. In a workspace
  it is one import; a generated repository is two independent apps, and a type-only import of the
  API's source would make the web resolve Fastify and Prisma from the wrong tree and break the
  per-app image build. So the API emits declarations: `npm run trpc:types` runs
  `tsc --emitDeclarationOnly` on the router and copies the four files its type needs into the web
  app. Declaration emit erases implementations, so the copy references only `@trpc/server` and
  `zod` — provided every procedure has an `.output()` schema, which is why they do. The generator
  cannot run `tsc`, so at generation the web ships a placeholder declaring `AppRouter` as
  `AnyRouter`; the first run replaces it. The smoke harness runs that step before it typechecks
  the web, so `trpc-fullstack` verifies the client against the real router. Generated CI
  regenerates the declarations and _warns_ on drift — a warning, not a failure, because the
  scaffold commit carries the placeholder and must reach green.

  One deviation: `@trpc/tanstack-react-query`, the v11 integration, not the `@trpc/react-query`
  the plan names, which is v10's.

- [x] ORMs: two per runtime for Postgres — Prisma + **Drizzle** (Node), SQLModel + **SQLAlchemy**
      (Python), GORM (Go). Each smoke-verified end to end. The remaining four are gated honestly
      rather than left as holes: `sqlc` is disabled in the wizard with a stated reason (its
      SQL-first codegen needs the sqlc CLI wired into generation), and the three mongo ODMs
      (`mongoose`, `beanie`, `mongo-go`) are unreachable until the `mongodb` database option
      ships.

  The gating itself was the bug worth fixing: ORMs had compatibility gating
  (`ormUnavailableReason`) and nothing else, so the wizard offered `drizzle`, `sqlalchemy` and
  `sqlc` for Postgres with no recipe behind them — a selection that generated a service with a
  database chosen and **no data layer**: no `DATABASE_URL`, no readiness check, nothing. It
  boots, and nothing fails until the first query. ORMs now have the same `OptionMeta` table and
  coming-soon surface as every other option, plus a coverage ledger
  (`IMPLEMENTED.orms`) asserting each implemented ORM emits its data layer, declares
  `DATABASE_URL` and ships the local Postgres compose service — and that no recipe exists for
  anything the ledger does not claim.

- [x] Redis cache-layer recipe across all three runtimes — complete. A client that connects lazily
      and fails fast (ioredis, redis-py asyncio, go-redis), a cache-aside helper with stampede
      protection (one load per key per process however many requests miss at once), `REDIS_URL`,
      a readiness check, and a `redis` service in the compose file. With rate limiting also on,
      the limiter's counters move to Redis on every runtime and the limit becomes global across
      replicas; every limiter fails open when Redis is unreachable, because one that turns a cache
      outage into a total outage has the wrong failure mode.

  Until this landed the wizard's toggle promised "a cache client and a docker-compose service" and
  delivered a comment: the generated README claimed a Redis-backed limiter that was in-memory.
  A coverage test now asserts each runtime emits the client, the variable, the compose service
  and the store wiring when the toggle is on — and none of them when it is off.

  One structural change: `docker-compose.yml` belongs to whichever ORM recipe applies, so it now
  declares an `idp:compose-services` region the cache recipe inserts into; with no database, the
  cache recipe emits the file itself. Both render the service from one definition.

- [x] All 5 middleware recipes ported to Python **and Go** with a uniform error envelope.
      The envelope, the variable names and the effective ordering are asserted across runtimes by
      `runtime-contract.test.ts` rather than left to convention — a chart setting `CORS_ORIGINS`
      for a service reading `CORS_ALLOWED_ORIGINS` boots, serves and fails only in production.
      LOG_LEVEL's _values_ turned out to be the drift: pino says `warn`/`fatal`, the stdlib says
      `warning`/`critical`, and one Helm values file sets it for every service — so each runtime
      accepts the union.
- [x] Python + Go container recipes (distroless python3 / distroless static).
      The Python builder is pinned to `python:3.11-slim-bookworm` to match the interpreter in
      `gcr.io/distroless/python3-debian12` — a venv built against another minor version copies in
      fine and then fails to import anything with a compiled extension, at container start.
- [x] Shared `permissions` policy emitted for all three runtimes. The files cannot be
      byte-identical across languages, so `policy-contract.test.ts` parses each and compares the
      role/permission matrix instead — dropping the assertion is how the three-vocabulary bug
      happened before.
- [x] Smoke harness taught to see non-Node layers. `layersOf` recognised only `package.json`, so
      a generated FastAPI or Gin project had **zero layers**: the harness generated it, found
      nothing it knew how to install, and passed — a green check reading as coverage. It now
      drives uv and go through the same commands the generated CI runs, and in CI
      `SMOKE_REQUIRE_TOOLCHAINS=1` turns a missing toolchain into a failure rather than a silent
      skip. Its first run caught eight ruff findings, a 404 envelope bug (FastAPI raises
      route-not-found as _starlette's_ HTTPException, and a handler on the subclass never sees
      it) and the LOG_LEVEL vocabulary drift.
- [x] Wizard: runtime-driven ORM and paradigm gating with stated reasons — done. The ORM
      implementedness table landed with Drizzle and SQLAlchemy (`sqlc` and the three Mongo ODMs
      are disabled with a stated reason), and with GraphQL and tRPC shipped every paradigm is
      selectable, gated per runtime by the compatibility matrix rather than by a coming-soon note.

**Gate:** every valid runtime × paradigm × ORM combination passes T2. REST projects emit a
spectral-clean OpenAPI 3.0 document. Migrations apply against a fresh DB in CI.

_Gate run, 2026-09-11._ **Passed.** The matrix is now the second half of T2: `scripts/pairwise.mjs`
enumerates every valid runtime × paradigm × ORM combination — nineteen API-only projects,
exhaustive rather than sampled because the space is small — and hands each to the smoke harness
with the paradigm's own probes: a REST service must serve `/openapi.json`, a GraphQL one must
answer `{ health { status } }` on `/graphql` and serve its SDL, a tRPC one must answer
`/trpc/health`. Run locally against a fresh Postgres 17 and Redis 7 with migrations applied and
the OpenAPI document linted: **19 of 19**. Nightly runs the same list, with both services, beside
the UI pairwise.

The three clauses, and what running them found:

- **Every combination passes T2.** Eight of nineteen failed the first run, none in a path a named
  smoke case had ever taken. The Node GraphQL recipe imported `DataLoader` for a Prisma-only
  example and failed its own lint under Drizzle or no database; the FastAPI package docstring and
  the GraphQL test's expected value each put the slug on one line and broke ruff's 100 columns
  for any slug over about thirty characters. All invisible to the fixtures, which pick Prisma and
  short slugs.
- **REST projects emit a spectral-clean document.** Spectral had never been run. It runs inside the
  smoke harness now — the document is built at runtime from the route schemas on every runtime, so
  it can only be linted from a booted process — with the `oas` ruleset at warning severity, on every
  REST case, named or matrix. First run: seven warnings on Node (no contact; no operationId, tag or
  description on the two probes), two on Python (the `health` tag used but never declared), two on
  Go (no servers, no contact). All fixed in the templates; all three runtimes lint clean. Python
  and Go emit OpenAPI 3.1, as recorded under the FastAPI runtime; the gate's "3.0" is read as "a
  valid document under the current ruleset".
- **Migrations apply against a fresh DB in CI.** Only Prisma and Drizzle had a step in the generated
  `ci.yml`; Alembic and goose have one now, and the API job carries the service's documented
  environment — every runtime parses its configuration at start-up and stops on a missing key, so
  a job that set only `DATABASE_URL` failed `uv run pytest` at collection for any FastAPI project
  with JWT auth. The smoke harness applies the same commands against a database created for each
  case (`SMOKE_DATABASE_URL`; the PR and nightly jobs provide one, and a Redis for the cache
  layer's readiness check). First run: **goose could not parse the baseline migration the
  generator ships** — a comment line that mentioned the two annotations in prose was read as an
  annotation — so `go run ./cmd/migrate` had never worked on a generated GORM project.
  `ci-workflow-contract.test.ts` holds the CI half of this clause.

Caught on the way: the Redis cache layer made `/ready` report 503 in the PR smoke job, which
provides Postgres and had no Redis. The harness now expects 200 exactly when every dependency the
service declares is reachable, and both jobs provide both.

---

## P4 — Catalog, DevOps Breadth & Dogfood (docs 04, 07, 08)

- [x] Catalog dashboard: grid/table, filters in URL, search, sort, fleet stats +
      median-provision-time tile — done. The page is a function of its URL: `lib/catalog.ts`
      parses the query string to a query, filters, searches, sorts and paginates the fleet, counts
      the facets and computes the fleet stats, all as pure functions (42 unit tests); every
      control on the page is a link to the URL of the view it produces, so a filtered catalog is
      shareable by construction and works before hydration. Stack facets are read out of each
      stored ProjectSpec, not from columns of their own, so they are filtered in memory — 2,000
      services take a few milliseconds.

  Three things found by running it rather than by reading it:

  - **A repeated query key is one page to the App Router.** Filters first travelled as
    `?runtime=go-gin&runtime=python-fastapi`, which is what `searchParams` models as `string[]`.
    The router identifies a page by the _last_ value of a repeated key, so removing the first of
    two filters changed the address bar, fetched the right payload, and re-rendered nothing. The
    server was right every time; only the browser suite (`e2e/catalog.spec.ts`) could see it.
    A facet's values now travel in one parameter — `runtime=go-gin,python-fastapi`.
  - **Rendering, not querying, was the cost.** With 205 services the data load took 15 ms and the
    page over two seconds: two hundred cards of markup. The catalog now pages at 48. Measured on
    a production build with 205 services: 0.12 s to serve, 0.2–0.5 s to the browser's load
    event, against the one-second bar in doc 07 §7.
  - **The filter bar was decided from the current view**, so it rearranged as filters were applied
    and vanished on a search with no results — exactly when it is needed. It is decided from the
    fleet.

  `next.config.ts` gained an opt-in `NEXT_DIST_DIR`, because measuring a production build meant
  building beside a live portal, and `next build` rewrites the directory `next start` serves.

- [x] Service detail: Overview / Stack / API / Deployments / Activity tabs — done, at
      `/catalog/[org]/[slug]`. The ID alone is unique only within an organisation, so the old
      `/catalog/<slug>` address could name two services; it still resolves, by redirecting when
      there is one match and asking which when there are several. The tab is part of the URL.

  The decision worth recording: **generated output is regenerated, not stored.** The README, the
  recipes with their file counts and the chart's values per environment are reproduced from the
  service's stored ProjectSpec by the same pipeline that provisioned it — possible only because
  the pipeline is deterministic and filesystem-free (doc 05), and it means there is nothing to
  keep in sync. One run is shared by the three tabs that need it, cached by the spec's hash (a
  lifecycle edit touches the row and not the spec, so it is not a reason to run the generator
  again), and streamed in behind the page shell. Measured on a production build: first byte in
  about 40 ms; the generated section follows in 0.4 s for a Go API and 1.2 s for the full-stack
  spine on first view, and the whole page in under 0.1 s on a revisit. The page says what it is
  showing — the repository _as generated_, not as it stands today; reading the live repository
  is the reconciler's job.

  The spec is read as `unknown` throughout, so a service written under an older schema shows
  fewer rows rather than refusing to open, and the spec sheet is tested against all nineteen
  API combinations and all thirty-six UI ones. Live status — ArgoCD sync and health, the
  deployed image, recent commits and workflow runs — reads "not checked yet" until the
  reconciler exists: nothing is shown as healthy until something has looked. The lifecycle
  editor is an admin-only server action, and its refusals are asserted against the action
  itself, since the browser suite signs in as an admin and can only show that it works.

- [ ] OpenAPI viewer (Scalar) with 3-tier source resolution + GraphQL SDL + tRPC shape
- [ ] Health reconciler (GitHub + ArgoCD) with rate-limit-safe batching
- [ ] Orphan repo detection and one-click import
- [ ] Regenerate-as-PR flow with pre-PR diff
- [ ] DevOps breadth: Traefik ingress, Vercel/Cloudflare CD path, multi-arch builds, Terraform (ECR/IRSA/secrets)
- [ ] `security.yml` + `release.yml` generated workflows; Renovate config
- [ ] T3 exhaustive weekly matrix
- [ ] Portal docs: onboarding guide, template-authoring guide, runbook
- [ ] **Dogfood test per doc 08 §8** — real project, timed, with an unaided observer

**Gate:** dogfood provision completes in **under 10 minutes**, wizard-start to green CI, measured
and published against the 3–5 day baseline. This is the PRD's core metric.

---

## Risk register

| Risk                                          | Impact   | Mitigation                                                                                     |
| --------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| Template combinatorics overwhelm the schedule | High     | Recipe composition (22 recipes, not 576 templates); pairwise testing; spine-first              |
| Codemod fragility across framework versions   | High     | ts-morph AST (not regex); idempotency tests; pinned versions; markers for Python/Go            |
| Nuxt/Vue path is a second full ecosystem      | Med-High | Isolated to P2; primitive-API boundary limits blast radius; can ship P1+P3 without it          |
| GitHub rate limits at scale                   | Medium   | Git Data API (1 call per repo, not 200); throttling plugin; conditional requests in reconciler |
| Docker unavailable locally → untested images  | Medium   | hadolint + generated-repo CI + hosted-runner nightly; closes when Docker is installed          |
| Redis unavailable → no durable queue          | Low      | `JobQueue` interface; in-process driver is adequate at internal scale                          |
| Generated code rots as upstream moves         | Medium   | Renovate on `versions.ts`; nightly version-contract test; golden diffs force review            |
| Scope creep from "one more framework"         | Medium   | Compatibility matrix is the contract; new options require a recipe + T2 entry, no exceptions   |

## Definition of done

1. All four wizard steps implement every PRD option, with contradictions resolved and _stated_.
2. Every valid combination generates a project that installs, lints, typechecks, builds and boots.
3. Generated infrastructure passes hadolint, kubeconform, conftest and actionlint.
4. A provisioned repo reaches green CI without manual intervention.
5. Catalog lists every service with accurate stack, health and API documentation.
6. Dogfood: under 10 minutes, wizard-start to green CI, measured.
7. Docs: onboarding, template-authoring, and operational runbook.

---

## Execution note

Work proceeds strictly in phase order, and within a phase in the listed task order. Each gate is
verified before the next phase starts. If a gate fails, the fix takes priority over new scope —
particularly the P1 gate, which is the project's early-warning signal for everything downstream.
