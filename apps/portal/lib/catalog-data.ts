/**
 * The catalog's one trip to the database.
 *
 * Everything else about `/catalog` is pure (`./catalog`); this is the part that is not, kept
 * apart so the rest can be tested without a database and so the page reads as what it shows
 * rather than how it fetched it.
 */

import { getPrisma, readSpecUnchecked, readStringArray } from '@idp/db';
import { deriveStack, normaliseCiStatus, type CatalogEntry } from './catalog';

export interface CatalogData {
  entries: CatalogEntry[];
  /** Durations of the provisioning jobs that succeeded, newest first. */
  provisionDurationsMs: number[];
}

/**
 * Far above any fleet this portal is built for; a guard against an unbounded read rather than a
 * page size. Filtering happens in memory (see `./catalog` for why), so everything is loaded.
 */
const MAX_SERVICES = 5_000;

/** Enough jobs for the median to be the fleet's, few enough to stay a cheap query. */
const MAX_JOB_SAMPLES = 500;

export async function loadCatalog(): Promise<CatalogData> {
  const prisma = getPrisma();

  const [services, jobs] = await Promise.all([
    prisma.service.findMany({
      include: { health: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_SERVICES,
    }),
    prisma.provisionJob.findMany({
      where: {
        status: { in: ['completed', 'completed_with_warnings'] },
        durationMs: { not: null },
      },
      select: { durationMs: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_JOB_SAMPLES,
    }),
  ]);

  const entries = services.map((service): CatalogEntry => {
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
      // One corrupt column must cost that row its tags or badges, not cost the fleet its catalog.
      tags: attempt(() => readStringArray(service.tags, 'tags', service.id), []),
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
      ...deriveStack(attempt(() => readSpecUnchecked(service.spec, service.id), null)),
      ciStatus: normaliseCiStatus(service.health?.ciStatus),
      lastCommitAt: service.health?.lastCommitAt ?? null,
    };
  });

  return {
    entries,
    provisionDurationsMs: jobs.flatMap((job) => (job.durationMs === null ? [] : [job.durationMs])),
  };
}

function attempt<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}
