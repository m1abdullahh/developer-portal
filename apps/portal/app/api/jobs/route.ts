/**
 * Job submission.
 *
 * The trust boundary. The wizard validates as a courtesy to the user; this endpoint validates
 * because it is the only thing standing between a crafted request and the generator. A client
 * that skips the UI entirely must still be rejected — which is why the full ProjectSpec schema
 * runs here, not a subset (doc 00 §3).
 */

import { parseProjectSpec } from '@idp/core';
import { getPrisma } from '@idp/db';
import { authErrorResponse, requireProvisioner, requireUser } from '../../../lib/session';
import { getQueue, persistJob, specHash, syncJob } from '../../../lib/provisioning';
import { ensureUser } from '../../../lib/users';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await requireProvisioner();
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let spec;
  try {
    spec = parseProjectSpec(await request.json());
  } catch (error) {
    return Response.json(
      {
        error: 'The configuration is not valid.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 422 },
    );
  }

  const prisma = getPrisma();
  const hash = specHash(spec);

  // The database unique constraint on (org, slug) is the real guard against two concurrent
  // provisions claiming one name; this check exists to return a helpful message rather than a
  // constraint violation.
  const existing = await prisma.service
    .findUnique({ where: { org_slug: { org: spec.meta.repo.org, slug: spec.meta.slug } } })
    .catch(() => null);

  if (existing) {
    return Response.json(
      { error: `${spec.meta.repo.org}/${spec.meta.slug} already exists in the catalog.` },
      { status: 409 },
    );
  }

  // Resolved before enqueueing: `ProvisionJob.requestedById` is a foreign key, so recording who
  // asked for a repository requires the user row to exist first.
  const requestedById = await ensureUser(user).catch(() => null);

  const queue = getQueue();
  const id = await queue.enqueue({
    spec,
    requestedById: requestedById ?? user.login,
    specHash: hash,
  });

  // Enqueue is idempotent by specHash, so a double submit returns the same id — and must not
  // then try to insert a second row for it.
  const alreadyStored = await prisma.provisionJob.findUnique({ where: { id } }).catch(() => null);
  if (!alreadyStored) {
    await persistJob(id, spec, hash, requestedById).catch((cause: unknown) => {
      // A job that runs but was not recorded is recoverable, so this does not fail the request.
      // It is logged rather than swallowed: a silent failure here once let a duplicate job id go
      // unnoticed, and the symptom appeared much later as the wrong service in the catalog.
      console.error(`Failed to persist job ${id}:`, cause);
    });
  }

  // Mirror the final state into the database once the job settles. Deliberately not awaited:
  // the response must return the job id immediately so the browser can start streaming.
  void queue.waitFor(id).then((record) => (record ? syncJob(record) : undefined));

  return Response.json({ id }, { status: 202 });
}

export async function GET(): Promise<Response> {
  try {
    await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobs = await getPrisma().provisionJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      org: true,
      slug: true,
      status: true,
      repoUrl: true,
      createdAt: true,
      finishedAt: true,
      durationMs: true,
    },
  });

  return Response.json({ jobs });
}
