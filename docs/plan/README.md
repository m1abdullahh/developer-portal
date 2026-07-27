# Implementation Plan — Internal Developer Portal & Scaffolding Engine

Planning set for PRD v2.0 (Extensive Stack Scope). Read `00-architecture.md` first — every
other document assumes the contracts defined there.

## Locked decisions

| Decision         | Choice                                                                     | Rationale                                                                                                             |
| ---------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Build sequencing | **Spine-first, then breadth**                                              | One vertical proves the whole pipeline before template volume is added. Integration risk lands in Week 1, not Week 3. |
| VCS integration  | **Real GitHub Org** via Octokit + GitHub App/PAT                           | Available. Still built behind a `VcsDriver` interface with a filesystem dry-run driver for tests.                     |
| Job queue        | **Interface-first**, in-process driver now, BullMQ driver when Redis lands | Redis not yet available; `JobQueue` interface makes the swap a one-file change.                                       |
| Container builds | **Generate + lint only** (hadolint/conftest)                               | Docker not installed on the build machine. Real image builds happen in generated-repo CI.                             |
| Validation       | **Golden-file snapshots + real build smoke tests**                         | A template can render perfectly and still not compile. Smoke matrix catches that.                                     |

## Document index

| #   | Document                                                                        | Covers                                                                                     | Owner (PRD role) |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------- |
| 00  | [Architecture & Contracts](00-architecture.md)                                  | Monorepo, `ProjectSpec`, pipeline stages, Recipe model, **compatibility matrix**, security | All              |
| 01  | [Wizard Step 1 — Metadata & Governance](01-wizard-step1-metadata-governance.md) | Slug validation, deployment target, repo provisioning policy                               | Engineer 1       |
| 02  | [Wizard Step 2 — UI Layer](02-wizard-step2-ui-layer.md)                         | 3 frameworks × 3 styling × 4 state × 4 page modules                                        | Engineer 1 + 2   |
| 03  | [Wizard Step 3 — API & Back-End Layer](03-wizard-step3-api-backend.md)          | 3 runtimes × 3 paradigms × 4 data options × 5 middleware                                   | Engineer 2       |
| 04  | [Wizard Step 4 — DevOps & GitOps](04-wizard-step4-devops-gitops.md)             | Dockerfiles, K8s, Ingress, HPA, ArgoCD, CI/CD, Terraform                                   | Engineer 3       |
| 05  | [Generator Engine](05-generator-engine.md)                                      | Renderer, Recipe composition, AST codemods, merge strategies                               | Engineer 2       |
| 06  | [Orchestration — Queue & VCS](06-orchestration-queue-vcs.md)                    | Job lifecycle, BullMQ, Octokit, idempotency, rollback                                      | Engineer 1 + 3   |
| 07  | [Service Catalog & OpenAPI](07-service-catalog-openapi.md)                      | Catalog dashboard, service detail, OpenAPI viewer, health                                  | Engineer 1       |
| 08  | [Testing & Validation Strategy](08-testing-validation.md)                       | Golden files, smoke matrix, contract tests, CI topology                                    | All              |
| 09  | [Execution Roadmap](09-execution-roadmap.md)                                    | Phase-by-phase task breakdown with acceptance gates                                        | All              |

## Status

Planning documents complete. **Awaiting approval to begin execution.**
Execution starts at Phase 0 in `09-execution-roadmap.md`.
