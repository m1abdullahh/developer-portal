# 08 — Testing & Validation Strategy

**Owner:** All three engineers · **Phase:** continuous, from P1 day 1

A scaffolding engine has an unusual failure mode: **the output can look perfect and not compile.**
Reviewing generated code by eye does not scale to 576 × 1,152 combinations. The test strategy is
therefore the product's actual quality floor, not an afterthought.

---

## 1. Test pyramid

| Layer                            | Tool                                      | Runs                         | Speed     |
| -------------------------------- | ----------------------------------------- | ---------------------------- | --------- |
| Unit                             | Vitest 3                                  | every commit                 | < 10 s    |
| Golden-file (snapshot)           | Vitest snapshots                          | every commit                 | < 60 s    |
| Contract                         | Vitest                                    | every commit                 | < 20 s    |
| **Smoke (real install + build)** | custom harness                            | PR (subset) + nightly (full) | 10–40 min |
| Static analysis of output        | hadolint, kubeconform, conftest, spectral | every commit                 | < 60 s    |
| E2E portal                       | Playwright                                | PR                           | < 5 min   |

## 2. Golden-file tests

For a curated matrix of specs, generate and snapshot the **entire file tree** (paths + contents).

```
tests/golden/
├── specs/
│   ├── spine-next-node-postgres.json
│   ├── nuxt-vuetify-pinia-fastapi-graphql.json
│   ├── vite-mui-redux-go-rest-mongo.json
│   ├── api-only-trpc-drizzle.json
│   ├── ui-only-vercel.json
│   └── … ~24 curated specs
└── __snapshots__/
```

Catches: accidental template edits, dependency drift, non-determinism, merge regressions.
A snapshot diff on an intentional change is _good_ — it forces review of exactly what changed
across every affected combination. Determinism (doc 05 §6) is what makes this viable.

## 3. Smoke tests — the ones that actually matter

Golden files prove we emit _the expected bytes_. Smoke tests prove those bytes **work**.

```
for each spec in SMOKE_MATRIX:
  generate → temp dir
  install       (npm ci / uv sync / go mod download)
  typecheck     (tsc --noEmit / mypy / go vet)
  lint          (eslint / ruff / golangci-lint)
  build         (next build / vite build / go build)
  unit test     (the generated project's own tests)
  start + probe (boot, GET /health, GET /ready, shut down)
```

**Matrix selection** — full cross-product is thousands of runs, so we use pairwise coverage:

| Tier                | Contents                                                 | When                 |
| ------------------- | -------------------------------------------------------- | -------------------- |
| **T1 — smoke**      | 4 specs covering the spine + one of each framework       | Every PR (~10 min)   |
| **T2 — pairwise**   | ~30 specs; every _pair_ of options appears at least once | Nightly (~40 min)    |
| **T3 — exhaustive** | Every valid combination                                  | Weekly + pre-release |

Pairwise is the key trade: it catches essentially all two-way interaction bugs (which is what
composition bugs are) at ~3% of the cost of exhaustive coverage.

**Known coverage gap:** Docker is not installed on the build machine, so `docker build` of generated
Dockerfiles is not exercised locally. Compensating controls: hadolint on every commit, `docker build`
(no push) in the _generated repo's_ `ci.yml`, and a GitHub-hosted runner job in our own nightly that
does build the images. This gap closes entirely once Docker is available locally — tracked as a P4 task.

## 4. Static analysis of generated artefacts

Runs on generated output in CI, cheap and immediate:

| Target          | Tool                            | Gate                                                                 |
| --------------- | ------------------------------- | -------------------------------------------------------------------- |
| Dockerfile      | `hadolint`                      | zero errors                                                          |
| K8s manifests   | `kubeconform --strict`          | valid against target K8s version                                     |
| Helm chart      | `helm lint` + `helm template`   | renders for every values file                                        |
| K8s policy      | `conftest` / OPA                | no `latest` tags, no privileged, resources set, probes set, non-root |
| OpenAPI         | `spectral`                      | valid 3.0, no rule violations                                        |
| GitHub Actions  | `actionlint`                    | zero errors                                                          |
| Terraform       | `terraform validate` + `tflint` | valid                                                                |
| Secrets         | `gitleaks`                      | zero findings in generated output                                    |
| Generated TS/JS | `eslint` + `tsc`                | zero errors, zero warnings                                           |

## 5. Contract tests

Guard the seams between the three engineers' work — the places where independently-correct code
still fails to integrate:

- **Spec contract:** wizard output parses against `projectSpecSchema`; every enum value in the UI
  has a matching recipe registered (a test that enumerates the registry, so adding a UI option
  without a recipe fails CI immediately).
- **Probe path contract:** every generated K8s manifest's probe paths exist as routes in the
  generated API. Catches the classic "renamed `/healthz` to `/health`" break.
- **OpenAPI path contract:** the catalog's viewer path matches what the API recipes expose.
- **Env contract:** every env key referenced in generated code appears in `.env.example`, and every
  key in `.env.example` is referenced somewhere. Both directions.
- **Version contract:** every dependency in `versions.ts` resolves on the registry (nightly).

## 6. Portal E2E (Playwright)

Complete-wizard-to-repo happy path against a `FilesystemDriver`; validation failure paths; draft
save/restore across reload; deployment-target switch resetting Step 4; SSE progress rendering;
catalog filter/search/detail; auth gate rejecting non-org-members; a11y scan (axe) on every page.

## 7. CI topology (our repo)

```
pr.yml       lint → typecheck → unit → golden → static-analysis → E2E → T1 smoke   (~15 min)
nightly.yml  T2 pairwise smoke + dependency freshness + version contract           (~45 min)
weekly.yml   T3 exhaustive smoke + Trivy + CodeQL                                  (~3 h)
```

PRs stay under ~15 min — slower than that and people stop running them.

## 8. Dogfood test (PRD Week 3 requirement)

The formal acceptance gate. Provision a real internal project end-to-end, then:

1. **Time it.** Wizard start → green CI in the generated repo. Target: **< 10 minutes.**
2. Clone it, `npm install`, run locally — it must work with no manual fixes.
3. Confirm CI passes, image builds and pushes, ArgoCD syncs, pods reach Ready.
4. Have an engineer _not_ on this project use the portal unaided, and record every point of
   confusion. Those observations are the P4 backlog.
5. Publish the measured setup time against the PRD's 3–5 day baseline.

## 9. Acceptance criteria

- [ ] Unit + golden suite runs in < 90 s locally
- [ ] T1 smoke gates every PR; a broken template cannot merge
- [ ] T2 pairwise covers every option pair at least once (verified by a coverage report)
- [ ] Every generated project passes its own lint, typecheck, build and tests
- [ ] Every generated Dockerfile passes hadolint; every manifest passes kubeconform + conftest
- [ ] `gitleaks` finds zero secrets in generated output
- [ ] Contract tests fail when a wizard option has no registered recipe
- [ ] Env contract holds in both directions
- [ ] Playwright covers the full wizard happy path and the auth gate
- [ ] Dogfood run completes in under 10 minutes, measured and documented
