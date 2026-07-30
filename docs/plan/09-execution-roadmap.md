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
- [ ] `packages/config` — shared eslint / prettier / tsconfig presets
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
- [ ] `nuxt` framework recipe + the doc 00 §5.1–5.2 substitution engine
- [ ] Styling: `mui` (React) + Vuetify (Vue); `css-modules` (both) — 8 primitives each
- [ ] State: `redux-toolkit`, `react-query` (+ companion context store), `context`; Pinia + vue-query
- [ ] Page modules ×4, each against the primitive API, verified in all 3 styling systems
- [ ] Wizard: live relabelling for Nuxt, module dependency gating, preview images
- [ ] BullMQ driver (if Redis has landed) behind the existing interface
- [ ] Golden snapshots for all new combinations; T2 pairwise matrix live nightly

**Gate:** every framework × styling × state combination installs, builds and boots in T2.
Nuxt output contains zero React dependencies.

---

## P3 — API Breadth (doc 03)

- [ ] `python-fastapi` runtime recipe (uv, ruff, pydantic v2) + marker-anchor injection
- [ ] `go-gin` runtime recipe + marker-anchor injection
- [ ] Paradigms: `graphql` (Apollo 4 / Strawberry / gqlgen, all with DataLoader), `trpc` (Node-only, gated)
- [ ] ORMs: Drizzle, Mongoose, SQLModel, SQLAlchemy, Beanie, GORM, sqlc, mongo-go
- [ ] Redis cache-layer recipe across all three runtimes
- [ ] All 5 middleware recipes ported to Python and Go with a uniform error envelope
- [ ] Python + Go container recipes (distroless python3 / distroless static)
- [ ] Shared `permissions` policy emitted for all runtimes
- [ ] Wizard: runtime-driven ORM and paradigm gating with stated reasons

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
