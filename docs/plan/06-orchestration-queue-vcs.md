# 06 — Orchestration: Job Queue & VCS Integration

**Owner:** Engineer 1 (API/status) + Engineer 3 (queue/worker) · **PRD ref:** §5 Week 2
**Phase:** P1 (in-process queue + real GitHub) → P2 (BullMQ when Redis lands)

Connects the wizard to the generator and the generator to GitHub, with the reliability properties
that matter when a job creates real external resources.

---

## 1. Job lifecycle

```
queued → resolving → generating → pushing → configuring → completed
                                                        ↘ failed → (retry | rolled-back)
```

| State         | Side effects                                        | Reversible             |
| ------------- | --------------------------------------------------- | ---------------------- |
| `queued`      | none                                                | ✅                     |
| `resolving`   | spec validation, slug re-check against GitHub       | ✅                     |
| `generating`  | in-memory tree only                                 | ✅                     |
| `pushing`     | **repo created, commit pushed**                     | ⚠️ compensating action |
| `configuring` | branch protection, teams, secrets, topics, webhooks | ⚠️ idempotent retry    |
| `completed`   | catalog entry written                               | ✅                     |

The design intent: everything expensive and error-prone (generation) happens _before_ anything
external is touched. A generation failure costs nothing but CPU.

## 2. `JobQueue` interface

```ts
export interface JobQueue {
  enqueue(job: ProvisionJob): Promise<JobId>;
  get(id: JobId): Promise<JobRecord | null>;
  subscribe(id: JobId, cb: (e: JobEvent) => void): Unsubscribe;
  cancel(id: JobId): Promise<boolean>; // only before `pushing`
  retry(id: JobId): Promise<JobId>;
}
```

### 2.1 `InProcessDriver` (P1 default — no Redis required)

Bounded concurrency (default 2), in-memory event emitter, job records persisted to the portal DB
so status survives a restart even though in-flight work does not. On boot, any job left in a
non-terminal state is marked `failed` with `reason: 'worker restarted'` — never left hanging.
Adequate for an internal tool with single-digit concurrent provisions.

### 2.2 `BullMQDriver` (P2, when Redis exists)

Same interface. Adds: durable retries with exponential backoff, multi-worker horizontal scale,
job de-duplication by `jobId = hash(org, slug)`, delayed retry, and a dead-letter queue.
Swapping drivers is a single line in the composition root; nothing else changes.

**Why the interface first:** Redis is currently unavailable, and building against BullMQ directly
would either block Phase 1 or force a rewrite later. The interface costs ~40 lines today.

## 3. Progress streaming

`GET /api/jobs/:id/events` — Server-Sent Events. Chosen over WebSockets: one-directional, works
through corporate proxies, auto-reconnects natively, and needs no extra infrastructure.

```ts
type JobEvent =
  | { type: 'stage'; stage: StageName; status: 'start' | 'done' | 'fail'; ms?: number }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'progress'; current: number; total: number; label: string }
  | { type: 'done'; repoUrl: string; catalogId: string; report: MergeReport }
  | { type: 'error'; code: string; message: string; recoverable: boolean };
```

The portal renders a live stage checklist with per-stage timings. Reconnect replays buffered events
via `Last-Event-ID`, so a refreshed tab doesn't lose the run.

## 4. `VcsDriver` interface

```ts
export interface VcsDriver {
  checkAvailability(org: string, name: string): Promise<Availability>;
  createRepo(opts: CreateRepoOpts): Promise<RepoRef>;
  pushTree(repo: RepoRef, files: VirtualFile[], commit: CommitMeta): Promise<Sha>;
  protectBranch(repo: RepoRef, branch: string, rules: ProtectionRules): Promise<void>;
  grantTeams(repo: RepoRef, teams: TeamGrant[]): Promise<void>;
  setSecrets(repo: RepoRef, secrets: SecretRef[]): Promise<void>;
  setTopics(repo: RepoRef, topics: string[]): Promise<void>;
  deleteRepo(repo: RepoRef): Promise<void>; // compensating action only
}
```

### 4.1 `GitHubDriver`

- **Auth:** GitHub App installation token, minted per job, ~1 h TTL, scoped to the target org.
  Chosen over a PAT: scoped permissions, org-level audit trail, no personal credential that dies
  when someone leaves, and independently revocable.
- **Push strategy:** Git Data API, not the Contents API. One `createTree` + `createCommit` +
  `updateRef` for the whole project = **one API call regardless of file count** and one atomic
  commit. The Contents API would be one call per file — ~200 calls, minutes of latency, rate-limit
  pressure, and a partially-pushed repo on failure.
- **Blob handling:** text inline in the tree; binaries uploaded as blobs first.
- **Rate limits:** `@octokit/plugin-throttling` + `plugin-retry`, honouring `Retry-After`.
- **Secrets:** values encrypted client-side with the repo public key via libsodium before upload.
  We only ever set **placeholder** values plus a `SECRETS.md`; real secrets are a human step.

### 4.2 `FilesystemDriver`

Writes to a local directory, no network. Used by every test, the CLI, and "preview" mode in the
portal. Keeps the entire test suite runnable offline and free of GitHub rate limits.

## 5. Idempotency & concurrency

- Job id = `hash(org, slug, specHash)`. Re-submitting an identical spec returns the existing job
  rather than creating a second repo.
- A DB-level unique constraint on `(org, slug)` in the catalog is the real guard — two concurrent
  requests for one slug cannot both succeed regardless of what the queue does.
- `pushTree` is safe to retry: if the ref already exists at the expected SHA, it's a no-op.
- `configuring` operations are all idempotent (PUT-semantics), so the whole phase can be replayed.

## 6. Failure handling & rollback

| Failure point                             | Behaviour                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Validation / generation                   | Fail fast, full diagnostics, no external effect. Retry is free.                                                                                                                                                    |
| Repo creation                             | Retry ×3 with backoff. On `name already exists` → fail with a targeted message and a rename suggestion.                                                                                                            |
| Push                                      | Retry ×3. On persistent failure → **compensating action**: delete the just-created repo (only if we created it _in this job_ and it has no commits from anyone else), then fail.                                   |
| Post-configure (protection/teams/secrets) | **Do not roll back the repo.** Mark job `completed_with_warnings`, list exactly what failed, and offer a "Retry configuration" button. A working repo missing branch protection is far better than a deleted repo. |
| Catalog write                             | Retry; the repo exists regardless, and a background reconciler re-imports orphaned repos by topic.                                                                                                                 |

Rollback is deliberately conservative — automatic deletion of a repo someone may already have
cloned is worse than the problem it solves. Deletion is only ever attempted within the same job,
on a repo we created, with zero foreign commits.

## 7. Observability

- Structured logs (Pino) with `jobId`, `org`, `slug`, `stage`, `durationMs`.
- Per-stage timings persisted to the job record → a "slowest stage" view in the portal.
- Counters: jobs by status, failure by stage, generation duration histogram, GitHub rate-limit
  remaining. Exposed at `/metrics` in Prometheus format.
- Every job stores its full `ProjectSpec` and `MergeReport` — reproducing any past generation is
  `idp generate --spec <stored>`.

## 8. Acceptance criteria

- [ ] Driver swap (InProcess → BullMQ) requires changing exactly one composition-root line
- [ ] Submitting the same spec twice returns one job and creates one repo
- [ ] Two concurrent requests for the same slug: one succeeds, one fails with a clear message
- [ ] Whole project pushes as a single atomic commit via the Git Data API
- [ ] SSE stream reconnects and replays missed events after a client disconnect
- [ ] Generation failure leaves zero external side effects
- [ ] Push failure deletes only a repo created in that same job with no foreign commits
- [ ] Post-configure failure yields `completed_with_warnings`, never a deleted repo
- [ ] GitHub rate-limit exhaustion backs off and recovers rather than failing the job
- [ ] No token, private key, or secret value appears in any log line
- [ ] Worker restart mid-job leaves no job stuck in a non-terminal state
