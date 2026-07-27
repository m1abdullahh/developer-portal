# 00 — Architecture & Contracts

Foundational document. Defines the monorepo, the single data contract that flows through the
whole system, the generation pipeline, and the compatibility rules that constrain the wizard.

---

## 1. System shape

```
 ┌────────────────────────────────────────────────────────────────────┐
 │  apps/portal  (Next.js App Router)                                 │
 │  ─ GitHub OAuth (Auth.js v5) ─ org-membership gated                │
 │  ─ 4-step Wizard  ──emits──▶  ProjectSpec (Zod-validated)          │
 │  ─ Service Catalog ─ OpenAPI viewer ─ Job status stream (SSE)      │
 └───────────────┬────────────────────────────────────────────────────┘
                 │  POST /api/provision  → enqueue(ProvisionJob)
                 ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │  packages/queue  —  JobQueue interface                             │
 │     ├─ InProcessDriver   (default, no Redis needed)                │
 │     └─ BullMQDriver      (drop-in once Redis exists)               │
 └───────────────┬────────────────────────────────────────────────────┘
                 ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │  apps/worker  —  provision pipeline                                │
 │   resolve → plan → render → merge → codemod → format → verify →    │
 │   emit → vcs.push → postConfigure → catalog.register               │
 └───────────────┬────────────────────────────────────────────────────┘
                 ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │  packages/vcs  —  VcsDriver interface                              │
 │     ├─ GitHubDriver      (Octokit: repo, push, protect, secrets)   │
 │     └─ FilesystemDriver  (dry-run; used by every test)             │
 └────────────────────────────────────────────────────────────────────┘
```

## 2. Monorepo layout

npm workspaces + Turborepo. npm (not pnpm) because npm 11.5 is already present and the
generated projects should not require a global package-manager install.

```
Internal_Developer_Portal/
├── apps/
│   ├── portal/                 Next.js 15 App Router — UI + API routes
│   └── worker/                 Long-running provision worker
├── packages/
│   ├── core/                   ProjectSpec (Zod), domain types, slug rules, compat matrix
│   ├── generator/              Renderer, Recipe registry, composer, codemods
│   ├── templates/              All template assets (.ejs.t + static passthrough)
│   ├── vcs/                    VcsDriver: GitHub (Octokit) + Filesystem
│   ├── queue/                  JobQueue: InProcess + BullMQ
│   ├── db/                     Portal persistence (Prisma; SQLite dev, Postgres prod)
│   └── config/                 Shared tsconfig / eslint / prettier presets
├── tests/
│   ├── golden/                 Snapshot fixtures per combination
│   ├── smoke/                  Real install+build harness
│   └── e2e/                    Playwright wizard flows
├── docs/plan/                  These documents
└── turbo.json, package.json, tsconfig.base.json
```

**Rule:** `packages/core` depends on nothing internal. `generator` depends only on `core` +
`templates`. `portal` and `worker` both depend on everything. No cycles; enforced in CI by
`dependency-cruiser`.

## 3. The `ProjectSpec` contract

Single source of truth. The wizard produces it, the queue transports it, the generator
consumes it, the catalog stores it. Defined once in `packages/core/src/spec.ts`.

```ts
export const projectSpecSchema = z
  .object({
    specVersion: z.literal(1),

    // ── Step 1 ────────────────────────────────────────────────
    meta: z.object({
      projectName: z.string().min(3).max(64),
      slug: z.string().regex(SLUG_RE).max(48),
      clientName: z.string().min(2).max(64),
      description: z.string().max(280).optional(),
      deploymentTarget: z.enum(['aws-eks', 'cloudflare-vercel', 'onprem-k8s']),
      repo: z.object({
        org: z.string(),
        visibility: z.enum(['private', 'internal']).default('private'),
        defaultBranch: z.string().default('main'),
        teamSlugs: z.array(z.string()).default([]),
        branchProtection: z.boolean().default(true),
      }),
    }),

    // ── Step 2 ────────────────────────────────────────────────
    ui: z
      .object({
        framework: z.enum(['nextjs-app', 'vite-react', 'nuxt']),
        styling: z.enum(['tailwind-shadcn', 'mui', 'css-modules']),
        state: z.enum(['zustand', 'redux-toolkit', 'react-query', 'context']),
        modules: z.object({
          authLayouts: z.boolean().default(false),
          userManagement: z.boolean().default(false),
          stripeBilling: z.boolean().default(false),
          settingsRbac: z.boolean().default(false),
        }),
      })
      .nullable(), // null ⇒ API-only project

    // ── Step 3 ────────────────────────────────────────────────
    api: z
      .object({
        runtime: z.enum(['node-ts', 'python-fastapi', 'go-gin']),
        paradigm: z.enum(['rest', 'graphql', 'trpc']),
        database: z.enum(['postgres', 'mongodb', 'none']),
        orm: z.enum([
          'prisma',
          'drizzle',
          'sqlmodel',
          'sqlalchemy',
          'gorm',
          'sqlc',
          'mongoose',
          'none',
        ]),
        cache: z.boolean().default(false), // Redis cache layer
        middleware: z.object({
          auth: z.enum(['none', 'jwt', 'oauth']).default('jwt'),
          rateLimit: z.boolean().default(true),
          cors: z.boolean().default(true),
          validation: z.boolean().default(true),
          logging: z.boolean().default(true),
        }),
      })
      .nullable(), // null ⇒ frontend-only project

    // ── Step 4 ────────────────────────────────────────────────
    ops: z.object({
      container: z.object({
        strategy: z.enum(['distroless', 'alpine', 'none']).default('distroless'),
        rootless: z.boolean().default(true),
        multiArch: z.boolean().default(false),
      }),
      k8s: z.object({
        enabled: z.boolean(),
        namespace: z.string(),
        ingress: z.enum(['nginx', 'traefik', 'none']),
        replicas: z.number().int().min(1).max(10).default(2),
        hpa: z.object({
          enabled: z.boolean().default(true),
          min: z.number().int().default(2),
          max: z.number().int().default(10),
          cpuTargetPercent: z.number().int().default(70),
        }),
        resources: z.object({
          requests: z.object({ cpu: z.string(), memory: z.string() }),
          limits: z.object({ cpu: z.string(), memory: z.string() }),
        }),
      }),
      gitops: z.object({
        enabled: z.boolean(),
        argoRepoUrl: z.string().url().optional(),
        targetCluster: z.string().optional(),
        syncPolicy: z.enum(['manual', 'auto', 'auto-prune']).default('auto'),
      }),
      cicd: z.object({
        registry: z.enum(['ecr', 'dockerhub', 'ghcr']),
        lint: z.boolean().default(true),
        test: z.boolean().default(true),
        buildPush: z.boolean().default(true),
        argoSync: z.boolean().default(true),
      }),
    }),
  })
  .superRefine(applyCompatibilityRules); // §5
```

`specVersion` is mandatory from day one. Stored specs must survive schema evolution — the
catalog reads specs written months earlier, and a migration function per version bump is
cheaper than a data backfill.

## 4. Generation pipeline

Ten stages, each a pure function where possible. Stage boundaries are the test seams.

| #   | Stage      | Input → Output                    | Notes                                                                                                 |
| --- | ---------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `resolve`  | `ProjectSpec` → `ResolvedSpec`    | Applies defaults, compat coercions, computes derived values (ports, image names, env keys)            |
| 2   | `plan`     | `ResolvedSpec` → `Recipe[]`       | Selects applicable recipes from the registry; deterministic ordering                                  |
| 3   | `render`   | `Recipe[]` → `VirtualFile[]`      | EJS render of each template into an in-memory tree. **No disk writes.**                               |
| 4   | `merge`    | `VirtualFile[]` → `VirtualFile[]` | Resolves collisions: `package.json` deep-merge, `.env` union, `tsconfig` merge, YAML merge            |
| 5   | `codemod`  | tree → tree                       | ts-morph AST edits (providers, middleware wiring, route registration)                                 |
| 6   | `format`   | tree → tree                       | Prettier for JS/TS/JSON/YAML/MD, Ruff for Python, gofmt for Go                                        |
| 7   | `verify`   | tree → `Diagnostic[]`             | Structural assertions: required files present, no `<%` leftovers, valid JSON/YAML, no secret literals |
| 8   | `emit`     | tree → disk / tarball             | Only stage that touches the filesystem                                                                |
| 9   | `vcs`      | disk → remote repo                | Create repo, initial commit, protect branch, set Actions secrets, add teams                           |
| 10  | `register` | → catalog DB                      | Persist spec + repo URL + status; make it visible in the Service Catalog                              |

Failure semantics: stages 1–8 are fully reversible (nothing external touched). Stage 9 is the
only one with side effects — it has an explicit compensating action (§6 of doc 06).

## 5. Compatibility matrix — resolved PRD contradictions

The PRD's option lists are independent, but the options are not. Four hard conflicts exist.
Each is resolved below; the wizard enforces them via progressive disabling with an inline
reason, never a silent failure.

### 5.1 Nuxt (Vue) vs. React-only state libraries

Zustand, Redux Toolkit and React Query/Context are React libraries. Selecting Nuxt maps them
to the closest Vue equivalent; the wizard relabels the options live.

| PRD option    | React (Next / Vite)     | Nuxt (Vue)                         |
| ------------- | ----------------------- | ---------------------------------- |
| Zustand       | `zustand`               | **Pinia**                          |
| Redux Toolkit | `@reduxjs/toolkit`      | **Pinia** (module pattern)         |
| React Query   | `@tanstack/react-query` | **`@tanstack/vue-query`**          |
| Context API   | React Context           | **`provide`/`inject` composables** |

### 5.2 Nuxt vs. React-only design systems

| PRD option           | React           | Nuxt                                      |
| -------------------- | --------------- | ----------------------------------------- |
| Tailwind + Shadcn/ui | `shadcn/ui`     | **`shadcn-vue`**                          |
| Material UI          | `@mui/material` | **Vuetify 3**                             |
| CSS Modules          | CSS Modules     | CSS Modules (native SFC `<style module>`) |

### 5.3 tRPC is Node/TypeScript only

tRPC's value is end-to-end TS inference; there is no FastAPI or Go equivalent.
**Rule:** `paradigm === 'trpc'` ⇒ `runtime === 'node-ts'`. Selecting FastAPI or Go disables the
tRPC card with tooltip _"tRPC requires the Node.js (TypeScript) runtime."_
Additionally tRPC requires a UI layer of `nextjs-app` or `vite-react` to be worth generating a
typed client for; with `ui === null` we still generate the server plus a standalone client package.

### 5.4 ORM availability per runtime

The PRD lists Prisma/Drizzle/Mongoose, all Node-only. Runtime-appropriate equivalents:

| Runtime          | PostgreSQL                                   | MongoDB                | Redis cache |
| ---------------- | -------------------------------------------- | ---------------------- | ----------- |
| Node.js (TS)     | **Prisma** or **Drizzle**                    | **Mongoose**           | `ioredis`   |
| Python (FastAPI) | **SQLModel** (default) or **SQLAlchemy 2.x** | **Beanie** (async ODM) | `redis-py`  |
| Go (Gin/Fiber)   | **GORM** (default) or **sqlc**               | **mongo-go-driver**    | `go-redis`  |

The wizard shows the ORM select _after_ runtime is chosen and only lists valid entries.

### 5.5 Deployment target reshapes Step 4

| Target                  | K8s manifests | ArgoCD | Dockerfile             | CI/CD emits                                                       |
| ----------------------- | ------------- | ------ | ---------------------- | ----------------------------------------------------------------- |
| **AWS EKS**             | ✅ full       | ✅     | ✅ distroless          | build → **ECR** → Argo sync                                       |
| **On-Prem K8s**         | ✅ full       | ✅     | ✅ distroless          | build → **GHCR/DockerHub** → Argo sync                            |
| **Cloudflare / Vercel** | ❌ N/A        | ❌ N/A | ⚠️ optional (API only) | build → **platform deploy** (`vercel deploy` / `wrangler deploy`) |

Choosing Cloudflare/Vercel collapses Step 4 from four sections to two (Container optional,
CI/CD required) and sets `ops.k8s.enabled = false`, `ops.gitops.enabled = false`. This is a
visible branch in the wizard, not a hidden no-op — otherwise users configure HPA settings that
are silently discarded.

### 5.6 Module dependencies

| Page module            | Requires                                                                      |
| ---------------------- | ----------------------------------------------------------------------------- |
| Authentication Layouts | `api.middleware.auth !== 'none'` (or explicit "UI-only mock" acknowledgement) |
| User Management Table  | an API layer + a database (`api !== null && database !== 'none'`)             |
| Stripe Billing Portal  | an API layer (webhook endpoint) + database; injects `STRIPE_*` env keys       |
| Settings / RBAC UI     | `api.middleware.auth !== 'none'` + database                                   |

## 6. Technology choices

| Concern             | Choice                                                                 | Why                                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Portal framework    | Next.js 15 App Router, React 19, TypeScript strict                     | PRD-mandated; Server Actions remove a whole API layer for wizard persistence                                                                                             |
| Portal styling      | Tailwind v4 + shadcn/ui                                                | Dogfoods our own most-common generated stack                                                                                                                             |
| Portal auth         | Auth.js v5 (NextAuth) GitHub provider                                  | Reuses the same GitHub App as provisioning; org membership check gates access                                                                                            |
| Portal DB           | Prisma + SQLite (dev) / Postgres (prod)                                | Same client, zero-setup local dev                                                                                                                                        |
| Template format     | **Hygen-compatible `.ejs.t`**, rendered by our own in-process renderer | Keeps PRD's authoring ergonomics; avoids shelling out to the Hygen CLI from a worker, which breaks streaming logs, error handling and testability. Documented deviation. |
| AST codemods        | `ts-morph` (TS/JS), marker-anchor injection (Python/Go/YAML)           | ts-morph is the only mature TS AST tool; Node has no good Python/Go AST writer, so those use idempotent marker comments                                                  |
| Queue               | `JobQueue` iface → InProcess now, BullMQ 5 later                       | Redis unavailable today; interface makes it a one-file swap                                                                                                              |
| VCS                 | `@octokit/rest` + `@octokit/auth-app`                                  | GitHub App > PAT: scoped, auditable, no personal credential in CI                                                                                                        |
| Validation          | Zod (shared portal ↔ worker ↔ generated projects)                      | One schema definition, reused                                                                                                                                            |
| Tests               | Vitest 3 (unit/golden), Playwright (e2e), custom smoke harness         |                                                                                                                                                                          |
| Build orchestration | Turborepo 2                                                            | Remote-cacheable, matches monorepo shape                                                                                                                                 |

> Versions are indicative. Phase 0 pins exact versions via `npm view <pkg> version` at scaffold
> time and records them in `docs/VERSIONS.md`. No version is hardcoded from memory.

## 7. Security model

1. **GitHub App, not PAT.** Installation token minted per job, ~1h TTL, scoped to the target org.
   Private key in env only, never in the repo, never logged.
2. **Portal access gate.** Auth.js `signIn` callback verifies the user is an active member of the
   configured org. Non-members are rejected at the session boundary, not just in the UI.
3. **No secret materialization.** Generated projects get `.env.example` with empty keys plus a
   `SECRETS.md` naming what to set. The generator refuses to emit a real secret value — stage 7
   `verify` fails the job on any high-entropy literal matching known key shapes.
4. **Generated container hardening.** Distroless/`scratch` final stage, non-root `USER 10001`,
   read-only root filesystem, dropped capabilities, pinned base image digests.
5. **Template injection.** All spec-derived values are escaped in EJS by default (`<%=`).
   Raw interpolation (`<%-`) is allowed only in a reviewed allowlist of template locations.
   Slug values are re-validated at render time, not trusted from the request.
6. **Input hardening.** Slug regex is anchored, length-capped, and blocklists reserved names
   (`.git`, `con`, `aux`, org-reserved words) — it becomes a filesystem path and a repo name.

## 8. Non-goals (from PRD §4, restated as build constraints)

- No Spotify Backstage adoption — catalog is a purpose-built Next.js surface.
- No cluster provisioning — we emit manifests and ArgoCD `Application` YAML only. Terraform
  output is **cluster-adjacent resources** (ECR repo, IAM role for IRSA, S3 state), never an EKS cluster.
- No client-facing multi-tenant login — single internal org, one auth boundary.
- No automated schema rollback — migrations are generated; `down` paths are documented, not executed.
