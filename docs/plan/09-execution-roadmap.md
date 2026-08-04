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

- [ ] Paradigms: `graphql` (Apollo 4 / Strawberry / gqlgen, all with DataLoader), `trpc` (Node-only, gated)
- [ ] ORMs: Drizzle, Mongoose, SQLAlchemy, Beanie, sqlc, mongo-go — SQLModel and GORM done
- [ ] Redis cache-layer recipe across all three runtimes
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
- [ ] Wizard: runtime-driven ORM and paradigm gating with stated reasons — both new runtimes are
      out of "coming in P3" and selectable; the ORM-implementedness gating is still to build
      (`sqlalchemy`, `beanie`, `sqlc`, `mongo-go`, `drizzle`, `mongoose` are offered by the
      compatibility matrix but have no recipe yet).

**Gate:** every valid runtime × paradigm × ORM combination passes T2. REST projects emit a
spectral-clean OpenAPI 3.0 document. Migrations apply against a fresh DB in CI.

---

## P4 — Catalog, DevOps Breadth & Dogfood (docs 04, 07, 08)

- [ ] Catalog dashboard: grid/table, filters in URL, search, sort, fleet stats + median-provision-time tile
- [ ] Service detail: Overview / Stack / API / Deployments / Activity tabs
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
