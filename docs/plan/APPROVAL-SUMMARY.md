# Approval Summary — Internal Developer Portal & Scaffolding Engine

**For:** Engineering Leadership · **Re:** PRD v2.0 · **Status:** Plan complete, awaiting go-ahead
**Full detail:** `docs/plan/` (11 documents)

---

## 1. The ask

Approve the implementation plan so build can start. Three decisions need sign-off (§4).

## 2. What we're building

A self-service portal where an engineer completes a 4-step wizard and gets a production-ready
private GitHub repo — frontend, backend, Dockerfile, Kubernetes/Helm, ArgoCD and CI/CD — with no
manual YAML or Docker work. **Target: 3–5 days → under 10 minutes.**

## 3. Key finding: the option matrix is not buildable as written

The PRD's wizard offers 3 UI frameworks × 3 design systems × 4 state libraries × 3 runtimes ×
3 API paradigms × 4 data options = **~660,000 possible combinations.** Authoring templates per
combination is impossible.

**Our approach: 22 composable "recipes" instead of thousands of templates.** Each recipe
contributes files, dependencies and code-injections; the engine composes them in memory, merges
conflicts, applies AST edits, and validates before writing anything. This is what makes the scope
fit the timeline.

We also found **four internal contradictions in the PRD's option lists.** All are resolved in the
plan rather than discovered mid-build:

| Issue                                               | Resolution                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Nuxt is Vue, but all 4 state options are React-only | Auto-substitute Vue equivalents (Pinia, vue-query); wizard relabels live       |
| tRPC cannot run on Python or Go                     | Locked to the Node runtime; other runtimes show the reason                     |
| Prisma / Drizzle / Mongoose are Node-only           | Runtime-appropriate ORM lists (SQLModel, GORM, etc.)                           |
| Cloudflare/Vercel has no Kubernetes layer           | Step 4 visibly collapses to 2 sections instead of silently discarding settings |

## 4. Decisions needing sign-off

| #   | Decision                                                                                                                                     | Why                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | **Build order: spine-first, not layer-by-layer.** Week 1 delivers one complete working stack end-to-end; remaining options are added on top. | Integration risk lands in Week 1 when there is room to fix it, not Week 3. Final scope is unchanged. |
| 2   | **Four technical deviations from the PRD** (details below)                                                                                   | Each removes a known failure mode; all documented in-plan                                            |
| 3   | **Validation includes real build tests, not just snapshots** (~15% extra effort)                                                             | A template can look perfect and still not compile. Without this we ship broken combinations.         |

**The four deviations:**

- Keep Hygen's template _format_, but render in-process rather than shelling out to the Hygen CLI — the CLI cannot stream progress to the portal or merge across recipes.
- Emit a **Helm chart** instead of raw Kubernetes YAML — ArgoCD consumes it natively and it gives dev/staging/prod from one chart instead of three copies.
- Use **Fastify** for the Node runtime (PRD says "Node.js/TypeScript" without naming a framework).
- Add **PodDisruptionBudget + NetworkPolicy** to generated charts — cheap now, expensive to retrofit.

## 5. Timeline

Sequenced in 5 phases mapped onto the PRD's 3 weeks and its 3-engineer ownership split:

| Phase  | Content                                                                                                                | PRD week            |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------- |
| P0     | Monorepo, shared schema, database, CI                                                                                  | Week 1              |
| **P1** | **Full working spine** — Next.js + Node/REST + Postgres + Docker + Helm + ArgoCD + CI/CD + wizard + GitHub integration | Week 1–2            |
| P2     | Remaining UI options (Vite, Nuxt, MUI, CSS Modules, all state libraries, 4 page modules)                               | Week 2 (parallel)   |
| P3     | Remaining API options (FastAPI, Go, GraphQL, tRPC, all ORMs)                                                           | Week 2–3 (parallel) |
| P4     | Service Catalog, OpenAPI viewer, DevOps breadth, dogfood test                                                          | Week 3              |

**Honest read on the 3-week target:** with 3 engineers, P0–P1 plus most of P2/P3 is achievable, and
the portal will be demonstrably provisioning real repos by end of Week 2. Fully validating _every_
option combination realistically extends past Week 3. The spine-first order means we always have a
shippable product at any cut-off point — we would trim breadth, never the working pipeline.

## 6. What we need to start

| Need                                                           | Blocking?                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Approval of §4                                                 | **Yes**                                                                        |
| GitHub App in the target org (App ID, private key, install ID) | Not immediately — needed for the Week 1–2 gate                                 |
| Redis instance                                                 | No — built behind an interface; in-process queue until it exists               |
| Docker on the build machine                                    | No — containers are statically validated; real builds run in generated-repo CI |

## 7. Success gate

Provision a real internal project through the portal and measure wizard-start → green CI.
**Must be under 10 minutes**, published against the 3–5 day baseline. That single number is how we
report success against the PRD's core metric.

---

**Decision requested:** approve §4 (build order, four deviations, validation approach) to begin P0.
