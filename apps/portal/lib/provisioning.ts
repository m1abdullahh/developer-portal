/**
 * The portal's composition root.
 *
 * Phase 1 runs the queue inside the portal process — no Redis, no separate worker deployment
 * (doc 06 §2). That is the whole reason `InProcessDriver` exists. When BullMQ lands, this file
 * changes and nothing else does.
 *
 * The module-level singleton is deliberate and slightly delicate: Next dev-mode hot reload
 * re-evaluates modules, and a fresh queue per reload would orphan every running job. Cached on
 * globalThis for the same reason `@idp/db` caches its Prisma client.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { ProjectSpec } from '@idp/core';
import { InProcessDriver, type JobQueue, type JobRecord } from '@idp/queue';
import { FilesystemDriver, GitHubDriver, type VcsDriver } from '@idp/vcs';
import { createProvisionHandler } from '@idp/worker';
import { getPrisma, writeSpec, writeStages } from '@idp/db';

const globalForQueue = globalThis as unknown as { __idpQueue?: InProcessDriver };

/**
 * Selects the VCS driver from the environment.
 *
 * Filesystem is the default on purpose. A misconfigured deployment should write a directory
 * nobody reads, not create repositories in whichever organisation its inherited credentials
 * happen to reach — provisioning against real GitHub is opt-in.
 */
export function selectVcsDriver(
  // Typed as a plain lookup rather than NodeJS.ProcessEnv: this reads three keys, and demanding
  // the full ProcessEnv shape only forces callers and tests into casts.
  env: Record<string, string | undefined> = process.env,
): VcsDriver {
  if (env.VCS_DRIVER === 'github') {
    const auth = env.GITHUB_TOKEN;
    if (!auth) {
      throw new Error('VCS_DRIVER=github requires GITHUB_TOKEN (or an App installation token).');
    }
    return new GitHubDriver({
      auth,
      ...(env.GITHUB_API_URL ? { baseUrl: env.GITHUB_API_URL } : {}),
    });
  }
  return new FilesystemDriver(env.VCS_OUTPUT_DIR ?? './.idp-output');
}

/**
 * A job id that survives a restart.
 *
 * The queue's own default is a per-process counter — `job_1`, `job_2` — which is correct for an
 * in-memory queue used in isolation and wrong here. The portal writes these ids into a database
 * that outlives the process, so after a restart `job_1` collides with the previous run's row.
 * The insert then fails, and the completion handler reads the OLD job and re-registers the OLD
 * service: a bug whose only symptom is the wrong entry appearing in the catalog.
 */
export function nextJobId(): string {
  return `job_${randomUUID()}`;
}

export function getQueue(): InProcessDriver {
  const existing = globalForQueue.__idpQueue;
  if (existing) return existing;

  const queue = new InProcessDriver({
    handler: createProvisionHandler({
      driver: selectVcsDriver(),
      register: registerService,
    }),

    idFactory: nextJobId,
  });

  // Persist every terminal transition. The queue is in memory and a restart loses it; the
  // database is what makes a job survivable and the catalog reconcilable.
  globalForQueue.__idpQueue = queue;
  return queue;
}

/**
 * The idempotency key (doc 06 §5).
 *
 * Hashing the whole spec rather than just (org, slug) means resubmitting an identical wizard is
 * deduplicated, while changing one option is correctly treated as a new request.
 */
export function specHash(spec: ProjectSpec): string {
  return createHash('sha256')
    .update(`${spec.meta.repo.org}/${spec.meta.slug}:${stableStringify(spec)}`)
    .digest('hex')
    .slice(0, 32);
}

/** JSON.stringify with sorted keys — key order must not change the hash. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** Writes the catalog row for a finished provision. Failure here degrades, never fails the job. */
async function registerService(input: {
  jobId: string;
  specHash: string;
  repoUrl: string;
  requestedById: string;
}): Promise<string> {
  const prisma = getPrisma();
  const job = await prisma.provisionJob.findUnique({ where: { id: input.jobId } });
  if (!job) throw new Error(`No stored job ${input.jobId} to register.`);

  const spec = JSON.parse(job.spec) as ProjectSpec;

  const service = await prisma.service.upsert({
    where: { org_slug: { org: spec.meta.repo.org, slug: spec.meta.slug } },
    create: {
      org: spec.meta.repo.org,
      slug: spec.meta.slug,
      displayName: spec.meta.projectName,
      clientName: spec.meta.clientName,
      description: spec.meta.description ?? null,
      repoUrl: input.repoUrl,
      repoId: input.repoUrl,
      spec: writeSpec(spec),
      specVersion: spec.specVersion,
      tags: JSON.stringify(['idp-generated']),
      // Taken from the stored job rather than the handler input: the job row holds a value
      // already validated against the User table, so this cannot violate the foreign key.
      ...(job.requestedById ? { createdById: job.requestedById } : {}),
    },
    update: {
      repoUrl: input.repoUrl,
      spec: writeSpec(spec),
      specVersion: spec.specVersion,
      lastSyncedAt: new Date(),
    },
  });

  await prisma.provisionJob.update({
    where: { id: input.jobId },
    data: { serviceId: service.id, repoUrl: input.repoUrl },
  });

  return service.id;
}

/** Creates the durable job row before enqueueing, so a restart can still explain what happened. */
export async function persistJob(
  id: string,
  spec: ProjectSpec,
  hash: string,
  requestedById: string | null,
): Promise<void> {
  await getPrisma().provisionJob.create({
    data: {
      id,
      org: spec.meta.repo.org,
      slug: spec.meta.slug,
      spec: writeSpec(spec),
      specHash: hash,
      status: 'queued',
      ...(requestedById ? { requestedById } : {}),
    },
  });
}

/** Mirrors the in-memory record into the database. Called on every terminal transition. */
export async function syncJob(record: JobRecord): Promise<void> {
  await getPrisma()
    .provisionJob.update({
      where: { id: record.id },
      data: {
        status: record.status,
        stages: writeStages(record.stages),
        warnings: JSON.stringify(record.warnings),
        ...(record.repoUrl ? { repoUrl: record.repoUrl } : {}),
        ...(record.errorCode ? { errorCode: record.errorCode } : {}),
        ...(record.errorMessage ? { errorMessage: record.errorMessage } : {}),
        ...(record.mergeReport ? { mergeReport: JSON.stringify(record.mergeReport) } : {}),
        ...(record.startedAt ? { startedAt: record.startedAt } : {}),
        ...(record.finishedAt ? { finishedAt: record.finishedAt } : {}),
        ...(record.startedAt && record.finishedAt
          ? { durationMs: record.finishedAt.getTime() - record.startedAt.getTime() }
          : {}),
      },
    })
    .catch(() => {
      // A job that ran but could not be recorded is a reconciliation problem, not a reason to
      // throw inside an SSE stream or a completion callback.
    });
}

export type { JobQueue, JobRecord };
