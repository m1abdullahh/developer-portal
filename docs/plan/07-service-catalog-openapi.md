# 07 — Service Catalog & OpenAPI Viewer

**Owner:** Engineer 1 (Portal & UI Lead) · **PRD ref:** §2 deliverables, §5 Week 3 · **Phase:** P4

The portal's second surface. The wizard is used once per project; the catalog is used every day —
it is what makes this a _portal_ rather than a generator. Per PRD anti-scope, this is a
purpose-built Next.js surface, **not** Spotify Backstage.

---

## 1. Catalog data model

```prisma
model Service {
  id             String   @id @default(cuid())
  slug           String
  org            String
  displayName    String
  clientName     String
  description    String?
  repoUrl        String
  repoId         String
  spec           Json     // full ProjectSpec — the provenance record
  specVersion    Int
  lifecycle      Lifecycle @default(EXPERIMENTAL) // EXPERIMENTAL|PRODUCTION|DEPRECATED
  ownerTeam      String?
  tags           String[]
  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  lastSyncedAt   DateTime?
  @@unique([org, slug])
}

model ServiceHealth {           // populated by the reconciler, not written by the wizard
  serviceId       String @id
  ciStatus        String?   // success | failure | pending | unknown
  lastCommitAt    DateTime?
  lastCommitSha   String?
  openPrCount     Int?
  argoSyncStatus  String?   // Synced | OutOfSync | Unknown
  argoHealth      String?   // Healthy | Degraded | Progressing
  openApiUrl      String?
  fetchedAt       DateTime
}

model ProvisionJob { /* id, serviceId?, spec, status, stages Json, error?, timings Json, ... */ }
```

Storing the **full spec** per service is the highest-leverage decision here: it enables "what stack
is this?" answers, fleet-wide queries ("every service still on Express"), regeneration, and drift
analysis — none of which are possible if only the repo URL is kept.

## 2. Catalog dashboard (`/catalog`)

- **Grid/table toggle.** Cards show: name, client, stack badges (framework · runtime · DB ·
  deployment target), lifecycle chip, CI status dot, last-commit relative time, owner team.
- **Filters:** client, framework, runtime, database, deployment target, lifecycle, owner team, tags.
  Filter state lives in the URL query string, so a filtered view is a shareable link.
- **Search:** name, slug, client, description, tags. Debounced, server-side.
- **Sort:** recently updated (default), name, created, CI status.
- **Fleet stats strip:** total services, by deployment target, by runtime, provisioned this month,
  services with failing CI. This is where the PRD's core metric becomes visible — a running
  "median provision time" tile, measured from real job records.
- Empty state links straight into the wizard.

## 3. Service detail (`/catalog/[org]/[slug]`)

| Tab             | Contents                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview**    | README render, repo link, owner team, lifecycle editor, quick links (Actions, ArgoCD, registry, deployed URL)                           |
| **Stack**       | Full `ProjectSpec` rendered as a readable spec sheet — every wizard decision, grouped by step, with the generated-file count per recipe |
| **API**         | OpenAPI viewer (§4) / GraphQL SDL viewer / tRPC router shape                                                                            |
| **Deployments** | Rendered Helm values per environment, ArgoCD sync + health status, image tag currently deployed                                         |
| **Activity**    | Provisioning job history with per-stage timings, recent commits, recent workflow runs                                                   |

**"Regenerate" action:** loads this service's stored spec back into the wizard as a starting point.
It opens a **PR** against the existing repo — it never force-pushes over someone's work. Useful for
adopting an updated template baseline. Diff is shown before the PR is opened.

## 4. OpenAPI viewer

The PRD names this as an Engineer 1 deliverable. Implementation:

- **Source:** the generated service exposes `/openapi.json` at a path fixed by contract (doc 03 §2.1).
  Resolution order: (1) live fetch from the deployed URL if reachable, (2) `openapi.json` committed
  in the repo (generated at build time and committed by CI), (3) unavailable state with an
  explanation of why. Option 2 is what makes this work for services not yet deployed — most of them.
- **Renderer:** Scalar API Reference (React) — modern, fast, good dark mode, far lighter than
  Swagger UI. Rendered client-side from fetched JSON.
- **Caching:** spec cached 5 min in the portal DB with a manual refresh button; ETag honoured.
- **Validation:** the spec is validated before render; an invalid document shows the validation
  errors rather than a blank viewer.
- **GraphQL equivalent:** SDL rendered with syntax highlighting plus a type explorer.
- **Cross-service search (P4 stretch):** search every endpoint across the fleet — "who exposes
  `/users`?" This is only possible because we aggregate specs centrally, and it is the single
  feature people will actually adopt the catalog for.

## 5. Health reconciler

A scheduled job (every 10 min) refreshing `ServiceHealth` for all services:

- GitHub: latest workflow run conclusion, last commit, open PR count.
- ArgoCD: `GET /api/v1/applications/{name}` for sync + health status (when configured and reachable).
- OpenAPI: re-fetch and cache.

Batched with concurrency limits, ETags, and conditional requests to stay well inside GitHub's rate
limit. Failures degrade to `unknown` — the catalog never shows a stale status as if it were current.

**Orphan reconciliation:** repos in the org carrying our `idp-generated` topic that have no catalog
entry are surfaced in an "Unregistered" list with a one-click import. This catches repos created by
a job that failed at the catalog-write step, and repos created before the portal existed.

## 6. Portal auth & access

- Auth.js v5, GitHub provider, org-membership verified in the `signIn` callback.
- Roles: `viewer` (browse catalog), `provisioner` (run the wizard), `admin` (lifecycle edits,
  delete catalog entries, retry jobs). Derived from GitHub team membership, configurable.
- Every provisioning action is attributed to a user and shown in the activity log.

## 7. Acceptance criteria

- [ ] Catalog lists every provisioned service with correct stack badges
- [ ] Filters and search compose correctly and are reflected in the URL
- [ ] Service detail renders the full spec accurately for every stack combination
- [ ] OpenAPI viewer renders from a committed spec when the service is not deployed
- [ ] Invalid OpenAPI shows validation errors, not a blank viewer
- [ ] GraphQL services render SDL; tRPC services render the router shape
- [ ] Health reconciler stays within GitHub rate limits for 100+ services
- [ ] ArgoCD status displays when configured and degrades to `unknown` when not
- [ ] Orphaned repos appear in the Unregistered list and import correctly
- [ ] Regenerate opens a PR and never force-pushes
- [ ] Non-org-members cannot authenticate; `viewer` role cannot reach the wizard
- [ ] Catalog loads in < 1 s with 200 services
