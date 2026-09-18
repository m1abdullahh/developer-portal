/**
 * The service detail page's impure half: the database, and the generator.
 *
 * Three of the five tabs show *generated output* — the README, the recipes with their file
 * counts, the chart's values per environment. None of it is stored. It is regenerated from the
 * service's stored ProjectSpec by the same pipeline that provisioned it, which is possible only
 * because the pipeline is deterministic and filesystem-free (doc 05): the same spec yields the
 * same tree, so there is nothing to keep in sync and nothing to drift.
 *
 * What this shows is therefore the repository *as generated*, not as it stands today. Reading the
 * live repository is the health reconciler's job (doc 07 §5); the page says which one it is
 * showing.
 */

import { createHash } from 'node:crypto';
import { safeParseProjectSpec } from '@idp/core';
import { getPrisma, readSpecUnchecked, readStages, readStringArray } from '@idp/db';
import { createRegistry, runPipeline } from '@idp/generator';
import {
  helmEnvironments,
  recipeFileCounts,
  type HelmEnvironment,
  type RecipeCount,
  type StageEvent,
} from './service-detail';

export interface ServiceJob {
  id: string;
  status: string;
  createdAt: Date;
  durationMs: number | null;
  errorMessage: string | null;
  requestedBy: string | null;
  stages: StageEvent[];
}

export interface ServiceRecord {
  id: string;
  org: string;
  slug: string;
  displayName: string;
  clientName: string;
  description: string | null;
  repoUrl: string;
  lifecycle: string;
  ownerTeam: string | null;
  tags: string[];
  specVersion: number;
  /** The stored spec, unvalidated. `null` only when the column is not JSON at all. */
  spec: unknown;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  health: {
    ciStatus: string | null;
    lastCommitAt: Date | null;
    lastCommitSha: string | null;
    openPrCount: number | null;
    argoSyncStatus: string | null;
    argoHealth: string | null;
    fetchedAt: Date;
  } | null;
  jobs: ServiceJob[];
}

function attempt<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

export async function loadService(org: string, slug: string): Promise<ServiceRecord | null> {
  const service = await getPrisma().service.findUnique({
    where: { org_slug: { org, slug } },
    include: {
      health: true,
      createdBy: { select: { githubLogin: true } },
      jobs: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { requestedBy: { select: { githubLogin: true } } },
      },
    },
  });
  if (!service) return null;

  return {
    id: service.id,
    org: service.org,
    slug: service.slug,
    displayName: service.displayName,
    clientName: service.clientName,
    description: service.description,
    repoUrl: service.repoUrl,
    lifecycle: service.lifecycle,
    ownerTeam: service.ownerTeam,
    // A corrupt column costs this page that field, not the page.
    tags: attempt(() => readStringArray(service.tags, 'tags', service.id), []),
    specVersion: service.specVersion,
    spec: attempt(() => readSpecUnchecked(service.spec, service.id), null),
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    createdBy: service.createdBy?.githubLogin ?? null,
    health: service.health,
    jobs: service.jobs.map((job) => ({
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      durationMs: job.durationMs,
      errorMessage: job.errorMessage,
      requestedBy: job.requestedBy?.githubLogin ?? null,
      stages: attempt(() => readStages(job.stages, job.id), []),
    })),
  };
}

/** For `/catalog/<slug>`, the address this page had before it carried the organisation. */
export async function findServicesBySlug(
  slug: string,
): Promise<Array<{ org: string; slug: string; displayName: string }>> {
  return getPrisma().service.findMany({
    where: { slug },
    select: { org: true, slug: true, displayName: true },
    orderBy: { org: 'asc' },
  });
}

// ── generated output ─────────────────────────────────────────────────────────

export type GeneratedOutput =
  | {
      ok: true;
      readme: string | null;
      fileCount: number;
      recipes: RecipeCount[];
      helm: HelmEnvironment[];
    }
  | { ok: false; reason: string };

/**
 * One pipeline run costs between a third of a second and a second. The three tabs that need it
 * share one run, and a revisit costs nothing: results are kept per *specification* — keyed by its
 * hash, so a regenerated service is a new key and never a stale answer, while a lifecycle edit,
 * which touches the row but not the spec, is not a reason to run the generator again. Bounded,
 * because a cache that grows with the fleet is a leak with a nicer name.
 */
const MAX_CACHED = 32;
const cache = new Map<string, Promise<GeneratedOutput>>();

export function generatedOutput(service: Pick<ServiceRecord, 'spec'>): Promise<GeneratedOutput> {
  const key = createHash('sha1')
    .update(JSON.stringify(service.spec) ?? 'null')
    .digest('hex');
  const hit = cache.get(key);
  if (hit) {
    // Re-insert so the map's order is recency, and the oldest entry is the one to drop.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const run = generate(service.spec);
  cache.set(key, run);
  if (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  // A failed run must not be remembered as the answer.
  void run.then((result) => {
    if (!result.ok) cache.delete(key);
  });
  return run;
}

async function generate(spec: unknown): Promise<GeneratedOutput> {
  const parsed = safeParseProjectSpec(spec);
  if (!parsed.success) {
    return {
      ok: false,
      reason:
        'This service’s stored specification was written under an older schema and no longer ' +
        'validates, so its output cannot be regenerated. The specification itself is shown in full below.',
    };
  }

  try {
    const result = await runPipeline(parsed.data, { registry: createRegistry() });
    const readme = result.files.find((file) => file.path === 'README.md');
    return {
      ok: true,
      readme: typeof readme?.content === 'string' ? readme.content : null,
      fileCount: result.files.length,
      recipes: recipeFileCounts(result.files),
      helm: helmEnvironments(result.files),
    };
  } catch (error) {
    console.error('[service-detail] the pipeline could not regenerate a stored spec', error);
    return {
      ok: false,
      reason:
        'The generator could not reproduce this service’s output from its stored specification.',
    };
  }
}
