# 01 — Wizard Step 1: Project Metadata & Governance

**Owner:** Engineer 1 (Portal & UI Lead) · **PRD ref:** §3 Step 1 · **Phase:** P1 (spine)

Establishes identity and destination for the generated project. Everything downstream keys off
`meta.slug` and `meta.deploymentTarget`, so this step's validation is load-bearing — a bad slug
produces a broken repo name, a broken K8s resource name, and a broken Docker image tag.

---

## 1. Fields

### 1.1 Project Name (free text)

- 3–64 chars. Used in README title, `package.json.description`, catalog display name.
- Auto-derives the slug on first keystroke; derivation stops once the user edits the slug manually
  (tracked with a `slugTouched` flag) so we never clobber a deliberate choice.

### 1.2 Technical ID Slug — the critical field

PRD example: `acme-health-backend`.

```ts
export const SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const RESERVED_SLUGS = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'lpt1', // Windows device names
  'git',
  'node-modules',
  'dist',
  'build',
  'test', // path collisions
  'api',
  'www',
  'admin',
  'internal',
  'argocd',
  'kube-system',
]);
```

Constraint stack, all enforced server-side too (client validation is UX, not security):

| Rule                              | Reason                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| Matches `SLUG_RE`                 | RFC 1123 label — valid for K8s resource names, DNS labels, Docker tags                         |
| ≤ 48 chars                        | K8s appends suffixes; 63-char label limit needs headroom for `-hpa`, `-ingress`, `-deployment` |
| Not in `RESERVED_SLUGS`           | Windows device names break `git clone` on developer machines                                   |
| No leading/trailing/double hyphen | Enforced by the regex; called out because it's the most common user error                      |
| Unique in target GitHub org       | Live async check (§2)                                                                          |
| Unique in catalog DB              | Prevents two catalog entries pointing at one repo                                              |

**Live availability check.** Debounced 400 ms → `GET /api/validate/slug?slug=&org=`.
Server does `octokit.repos.get()` and a catalog lookup in parallel; returns
`{ available, reason, suggestion }`. On conflict, suggests `slug-2`, `slug-api`, `slug-<year>`.
Failure of the GitHub call is **not** treated as "available" — it returns `unknown` and the
Next button warns rather than blocking, because the authoritative check runs again at job time.

### 1.3 Client Name

2–64 chars. Drives repo topics (`client-acme`), catalog grouping/filtering, and the
`app.kubernetes.io/part-of` label on every generated K8s manifest.

### 1.4 Description

≤ 280 chars, optional. Flows to GitHub repo description, catalog card, and README subtitle.

### 1.5 Deployment Target (radio cards — reshapes Step 4)

| Value               | Label                  | Downstream effect                                                                                        |
| ------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `aws-eks`           | AWS EKS                | K8s + ArgoCD sections enabled; registry defaults to ECR; Terraform stub for ECR + IRSA role              |
| `onprem-k8s`        | On-Premises Kubernetes | K8s + ArgoCD enabled; registry defaults to GHCR; no cloud Terraform                                      |
| `cloudflare-vercel` | Cloudflare / Vercel    | **K8s + ArgoCD sections hidden**; CI/CD emits platform deploy; `vercel.json` / `wrangler.toml` generated |

Each card shows a one-line "what you'll get" summary so the Step 4 consequence is visible here,
not discovered two steps later. Changing this after visiting Step 4 shows a confirm dialog
warning that DevOps selections will reset.

### 1.6 Repository Access & Organization

| Field             | Control                                                                                                | Default                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| GitHub Org        | Select — populated from the authenticated user's org memberships where our App is installed            | Configured `DEFAULT_ORG`                      |
| Visibility        | Radio: Private / Internal                                                                              | Private (PRD: "Automatic private repo setup") |
| Default branch    | Text                                                                                                   | `main`                                        |
| Team access       | Multi-select — `GET /orgs/{org}/teams`, with permission level per team (`push` / `maintain` / `admin`) | Configured default team, `push`               |
| Branch protection | Toggle + detail popover                                                                                | On                                            |

Branch protection applied when enabled: require PR before merge, ≥1 approval, dismiss stale
reviews, require status checks (`lint`, `test`, `build`) to pass, no force-push, no deletion.
Applied _after_ the initial commit — GitHub rejects protection rules on an empty repo.

---

## 2. API surface

| Route                | Method     | Purpose                                                         |
| -------------------- | ---------- | --------------------------------------------------------------- |
| `/api/validate/slug` | GET        | Debounced availability + reason + suggestion                    |
| `/api/github/orgs`   | GET        | Orgs where the GitHub App is installed AND the user is a member |
| `/api/github/teams`  | GET        | Teams within selected org, cached 5 min                         |
| `/api/drafts`        | POST/PATCH | Persist wizard draft (see §3)                                   |

All routes require an authenticated session and re-verify org membership — the client's claimed
org is never trusted.

---

## 3. State & persistence

- Client state: React Hook Form + `zodResolver` against `projectSpecSchema.shape.meta`.
- Wizard container state: **Zustand** store holding the partial spec across all 4 steps
  (dogfooding our own most-recommended state option).
- **Draft persistence:** autosaved to `localStorage` on change (instant), and to the DB via a
  1.5 s-debounced Server Action (survives machine switch). Resuming shows "Draft from
  {relative time}" with a Discard action.
- Step navigation is guarded: Next is disabled until the current step's Zod slice parses. Back
  never validates. Users may jump backwards freely to any visited step via the stepper.

---

## 4. UI composition

```
components/wizard/
├── WizardShell.tsx          stepper, progress, guarded nav, draft indicator
├── steps/Step1Metadata.tsx
├── fields/SlugField.tsx     live availability, suggestion chips, derivation lock
├── fields/DeploymentTargetCards.tsx
├── fields/OrgTeamPicker.tsx
└── SummaryRail.tsx          sticky right rail — live spec summary, visible on all 4 steps
```

The `SummaryRail` is a deliberate addition beyond the PRD: with ~30 decisions across 4 steps,
users lose track of earlier choices. The rail shows a live, collapsible summary and is where the
final cost/consequence of the whole spec is visible before submit.

---

## 5. Acceptance criteria

- [ ] Slug field rejects every invalid form with a specific, actionable message (not "invalid input")
- [ ] Availability check debounces correctly; a network failure warns but does not hard-block
- [ ] Org list contains only orgs where the App is installed _and_ the user is a member
- [ ] Selecting Cloudflare/Vercel visibly changes the Step 4 preview in the stepper
- [ ] Changing deployment target after configuring Step 4 prompts before resetting
- [ ] Refreshing mid-wizard restores all entered data
- [ ] Server rejects a spec whose `meta` fails validation even if the client was bypassed
- [ ] Reserved slug (`con`, `api`, `git`) is rejected with the reason shown
- [ ] Axe: zero critical a11y violations; full keyboard traversal; errors linked via `aria-describedby`
