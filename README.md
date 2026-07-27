# Internal Developer Portal & Scaffolding Engine

Self-service project provisioning. Complete a 4-step wizard, get a production-ready private
GitHub repo — frontend, backend, Dockerfile, Kubernetes/Helm, ArgoCD and CI/CD — with no manual
YAML or Docker configuration.

**Target:** new project setup from 3–5 days to under 10 minutes.

> **Status: Phase 0 complete.** The monorepo, the `ProjectSpec` contract and the architectural
> guards are in place and verified. The generator pipeline, wizard and catalog land in Phase 1+.
> See [docs/plan/09-execution-roadmap.md](docs/plan/09-execution-roadmap.md).

## Quick start

```bash
npm install
cp packages/db/.env.example packages/db/.env
npm run build
npm run verify        # format + lint + typecheck + test + architecture rules
npm run dev           # portal on http://localhost:3000
```

Requires Node 22.12+ (see `.nvmrc`). No Docker or Redis needed for local development.

## Layout

```
apps/
  portal/       Next.js 16 App Router — wizard, catalog, OpenAPI viewer
  worker/       Provision worker — runs the generation pipeline
packages/
  core/         ProjectSpec (Zod), slug rules, compatibility matrix   ← depends on nothing
  generator/    Renderer, recipe composition, AST codemods
  templates/    Template assets (.ejs.t)
  vcs/          VcsDriver: GitHub (Octokit) + Filesystem
  queue/        JobQueue: in-process + BullMQ
  db/           Prisma schema and typed accessors
docs/
  plan/         Full implementation plan (11 documents)
  VERSIONS.md   Pinned versions and why
```

`packages/core` is a leaf by design — it holds the contract every other package agrees on.
That boundary, plus the no-cycles rule, is enforced by `npm run depcruise` in CI, not by convention.

## Commands

| Command              | What it does                                 |
| -------------------- | -------------------------------------------- |
| `npm run build`      | Turborepo build across all workspaces        |
| `npm run verify`     | Everything CI runs, in the same order        |
| `npm run test`       | Vitest across all workspaces                 |
| `npm run depcruise`  | Enforces the package boundaries in doc 00 §2 |
| `npm run format`     | Prettier write                               |
| `npm run db:migrate` | Prisma migration (run inside `packages/db`)  |

## Documentation

Start with [docs/plan/00-architecture.md](docs/plan/00-architecture.md) — every other document
assumes the contracts it defines. [docs/plan/README.md](docs/plan/README.md) indexes all eleven.

Two things worth reading before contributing:

- **[Compatibility matrix](docs/plan/00-architecture.md)** (§5) — the PRD's option lists contain
  four genuine contradictions (Nuxt is Vue but the state options are React; tRPC cannot target
  Python or Go; Prisma/Drizzle are Node-only; Vercel has no Kubernetes layer). Each is resolved
  explicitly and enforced in both the wizard and the schema.
- **[docs/VERSIONS.md](docs/VERSIONS.md)** — why TypeScript is pinned to 6.0.3 rather than the
  latest 7.0.2, and why generated projects have their own version manifest.
