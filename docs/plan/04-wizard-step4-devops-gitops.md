# 04 — Wizard Step 4: DevOps, Containerization & GitOps

**Owner:** Engineer 3 (DevOps & GitOps Lead) · **PRD ref:** §3 Step 4
**Phase:** P1 spine = Dockerfile + K8s + ArgoCD + CI for the Node/Next path; P4 = full breadth

This step delivers the PRD's headline promise: _zero manual YAML/Docker configuration_.
It is also the step most shaped by Step 1's deployment target (doc 00 §5.5).

> **Environment constraint:** Docker is not installed on the build machine. We generate and
> **statically validate** container/K8s artefacts (hadolint, kubeconform, `helm template`,
> conftest policies). Real image builds are exercised by the _generated repo's own_ CI, and by
> the smoke matrix once Docker is available. This is called out in doc 08 as a known coverage gap.

---

## 1. Containerization (`ops.container`)

Multi-stage, security-hardened, per runtime.

### 1.1 Node.js / Next.js

```dockerfile
# 1 deps      node:22-bookworm-slim  → npm ci --omit=dev
# 2 builder   node:22-bookworm-slim  → npm ci && npm run build
# 3 runner    gcr.io/distroless/nodejs22-debian12:nonroot
```

- Next.js uses `output: 'standalone'`, so stage 3 copies only `.next/standalone`, `.next/static`, `public`.
- Distroless has no shell — health checks are done by the K8s probe, not `HEALTHCHECK`.
- `USER 65532:65532` (distroless `nonroot`), `WORKDIR /app`, `ENV NODE_ENV=production`.

### 1.2 Vite SPA

Builder stage produces `dist/`; final stage is `nginxinc/nginx-unprivileged:alpine` on port 8080
with the SPA history-fallback `nginx.conf` from the framework recipe.

### 1.3 Python / FastAPI

`python:3.12-slim` builder with `uv sync --frozen` into a venv →
`gcr.io/distroless/python3-debian12:nonroot` final, venv copied in, `PYTHONDONTWRITEBYTECODE=1`.

### 1.4 Go

`golang:1.23-alpine` builder → `CGO_ENABLED=0 go build -ldflags="-s -w -extldflags=-static"` →
`gcr.io/distroless/static-debian12:nonroot` final. Single static binary; smallest image of the three.

### 1.5 Hardening applied to all

| Control         | Implementation                                                                         |
| --------------- | -------------------------------------------------------------------------------------- |
| Non-root        | `USER 65532:65532`; never `USER root` in the final stage                               |
| Minimal base    | Distroless by default; alpine only where a shell is genuinely required                 |
| Pinned bases    | Image digests pinned (`@sha256:…`), refreshed by a scheduled Renovate PR               |
| Layer caching   | Manifest files copied before source so dependency layers cache                         |
| `.dockerignore` | Excludes `.git`, `node_modules`, `.env`, tests, docs                                   |
| No secrets      | Build args for non-sensitive config only; verify stage fails on secret-shaped literals |
| Multi-arch      | Optional `linux/amd64,linux/arm64` via buildx when `ops.container.multiArch`           |
| SBOM            | `docker buildx --sbom=true` + Trivy scan in CI                                         |

---

## 2. Kubernetes manifests (`ops.k8s`) — skipped when target is Cloudflare/Vercel

Emitted as a **Helm chart** rather than raw manifests. Rationale: the PRD asks for parameterised
manifests across environments; raw YAML would require one full copy per environment, while a chart
gives dev/staging/prod as three small values files. ArgoCD consumes Helm charts natively, and
`helm template` gives us a free CI validation step. Documented deviation.

```
deploy/
├── Chart.yaml
├── values.yaml              defaults from the spec
├── values-dev.yaml  values-staging.yaml  values-prod.yaml
└── templates/
    ├── deployment.yaml      probes, resources, securityContext, topology spread
    ├── service.yaml
    ├── ingress.yaml         nginx | traefik annotations
    ├── hpa.yaml
    ├── configmap.yaml
    ├── secret.yaml          ExternalSecret ref — never literal values
    ├── serviceaccount.yaml  IRSA annotation on EKS
    ├── pdb.yaml             PodDisruptionBudget
    └── networkpolicy.yaml   default-deny egress+ingress with explicit allows
```

**Deployment defaults:** `RollingUpdate maxUnavailable=0 maxSurge=1`, liveness on `/health`,
readiness on `/ready` (the paths fixed by doc 03 §5), `terminationGracePeriodSeconds: 30`,
`securityContext: { runAsNonRoot: true, readOnlyRootFilesystem: true, allowPrivilegeEscalation: false,
capabilities: { drop: [ALL] }, seccompProfile: RuntimeDefault }`, and topology spread across zones.

**Ingress:** nginx or traefik annotation sets — TLS via cert-manager `ClusterIssuer`, configurable
host, path-based routing, and (nginx) rate-limit annotations that complement the app-level limiter.

**HPA:** `autoscaling/v2`, CPU + memory targets, with scale-down stabilisation set to 300 s to
prevent flapping.

**PDB and NetworkPolicy are additions beyond the PRD.** Without a PDB, a node drain can take every
replica down at once; without a NetworkPolicy, generated services are flat-network reachable.
Both are cheap to generate and expensive to retrofit.

---

## 3. GitOps — ArgoCD (`ops.gitops`) — skipped for Cloudflare/Vercel

```
gitops/
├── application.yaml            ArgoCD Application → the deploy/ chart
├── application-staging.yaml
├── application-prod.yaml
└── project.yaml                AppProject with source/destination allowlists
```

- `spec.source` points at the generated repo path `deploy/` with the environment values file.
- `spec.destination` uses the cluster from Step 1 + namespace from `ops.k8s.namespace`.
- Sync policy per `ops.gitops.syncPolicy`: `manual`, `auto` (automated sync), or `auto-prune`
  (automated + prune + selfHeal). Prod defaults to `manual` regardless of the selection unless the
  user explicitly opts in — an auto-pruning production app is a foot-gun we should not default to.
- `syncOptions: CreateNamespace=true`, retry with exponential backoff, `ignoreDifferences` for
  HPA-managed `replicas` (otherwise Argo fights the autoscaler forever — a classic and confusing failure).
- **App-of-apps note:** we emit the `Application` manifest into the generated repo _and_ optionally
  open a PR against a central GitOps repo (`ops.gitops.argoRepoUrl`) registering it. That PR is
  never auto-merged.

---

## 4. CI/CD — GitHub Actions (`ops.cicd`)

```
.github/workflows/
├── ci.yml           PR: lint → typecheck → test → build → (docker build, no push)
├── cd.yml           main: build+push image → update chart tag → commit → Argo syncs
├── security.yml     scheduled: Trivy, npm/pip/go audit, CodeQL, secret scan
└── release.yml      tag: changelog, GitHub Release, semver image tag
```

**`ci.yml`** — matrix over the project's own runtimes, dependency caching, coverage upload, and a
`docker build` without push to validate the Dockerfile on every PR.

**`cd.yml`** — the GitOps hand-off, and the part most often built wrong:

1. Build + push image tagged with the commit SHA (immutable — never `latest` for deployments).
2. Update `deploy/values-<env>.yaml` `image.tag` to that SHA.
3. Commit that change back to the repo ("GitOps commit").
4. ArgoCD detects the commit and syncs. **The pipeline does not `kubectl apply`.**

Step 4 is the whole point of GitOps and is why we don't call `argocd app sync` from CI — the repo
is the source of truth. An optional `argocd app wait` step polls for sync health and fails the
pipeline on a failed rollout, giving a deploy result in the Actions log.

**Registry auth:** ECR via OIDC role assumption (no long-lived AWS keys), GHCR via the built-in
`GITHUB_TOKEN`, DockerHub via repo secrets. OIDC is the default for ECR — static AWS keys in repo
secrets are the single most common leak vector in this pipeline shape.

**Vercel/Cloudflare variant:** `cd.yml` becomes `vercel deploy --prod` or `wrangler deploy`, with
preview deploys on PRs; no image build, no chart update.

---

## 5. Terraform (`aws-eks` target only)

Per PRD anti-scope, **no cluster provisioning.** Scope is strictly cluster-adjacent:

```
infra/terraform/
├── main.tf         provider, S3+DynamoDB backend config
├── ecr.tf          ECR repo, lifecycle policy, image scanning
├── iam.tf          IRSA role + policy for the workload's service account
├── secrets.tf      AWS Secrets Manager entries (names only, values managed outside)
└── variables.tf outputs.tf
```

Emitted with `terraform plan` in CI but **never** `apply` — application is a human action.
A header comment in `main.tf` states this explicitly.

---

## 6. Wizard UI behaviour

- Section visibility driven by `meta.deploymentTarget`; the Cloudflare/Vercel path shows two
  sections instead of four with an explanatory banner.
- Resource requests/limits use presets (XS/S/M/L) with an "advanced" disclosure for raw values —
  most users should not hand-type CPU millicores.
- **Live YAML preview pane**: as options change, a syntax-highlighted preview of the resulting
  `deployment.yaml` and `Dockerfile` renders. This is the single highest-value trust-builder in the
  wizard — users will not accept generated infrastructure they cannot see beforehand.
- Final review screen before submit: full spec summary, file-tree preview of what will be created,
  and the target repo URL.

---

## 7. Acceptance criteria

- [ ] Generated Dockerfiles pass `hadolint` with zero errors, for all four runtime variants
- [ ] Final stages run as non-root with a read-only root filesystem
- [ ] `helm template` renders without error for every combination and environment values file
- [ ] `kubeconform --strict` validates all rendered manifests against the target K8s version
- [ ] Conftest/OPA policies pass: no `latest` tags, no privileged, resources always set, probes always set
- [ ] HPA `ignoreDifferences` present so ArgoCD does not fight the autoscaler
- [ ] ArgoCD `Application` YAML validates against the CRD schema
- [ ] Production sync policy defaults to manual unless explicitly overridden
- [ ] `cd.yml` updates the chart tag and commits — it never runs `kubectl apply`
- [ ] ECR path uses OIDC; no static AWS credentials appear in any generated workflow
- [ ] Cloudflare/Vercel target emits no K8s or ArgoCD files at all
- [ ] `terraform validate` passes; no `apply` step exists in any generated workflow
