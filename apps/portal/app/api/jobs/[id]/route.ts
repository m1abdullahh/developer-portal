/**
 * A single job's state.
 *
 * Reads the in-memory queue first and falls back to the database. The order matters: the queue
 * holds live stage timings for a running job, while the database is the only source for a job
 * from before the last restart.
 */

import { getPrisma, readStages } from '@idp/db';
import { authErrorResponse, requireUser } from '../../../../lib/session';
import { getQueue } from '../../../../lib/provisioning';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  const live = await getQueue().get(id);
  if (live) {
    return Response.json({
      id: live.id,
      status: live.status,
      stages: live.stages,
      warnings: live.warnings,
      repoUrl: live.repoUrl ?? null,
      errorMessage: live.errorMessage ?? null,
      org: live.spec.meta.repo.org,
      slug: live.spec.meta.slug,
      source: 'queue',
    });
  }

  const stored = await getPrisma().provisionJob.findUnique({ where: { id } });
  if (!stored) return Response.json({ error: 'No such job.' }, { status: 404 });

  return Response.json({
    id: stored.id,
    status: stored.status,
    stages: readStages(stored.stages, stored.id),
    warnings: JSON.parse(stored.warnings) as unknown[],
    repoUrl: stored.repoUrl,
    errorMessage: stored.errorMessage,
    org: stored.org,
    slug: stored.slug,
    durationMs: stored.durationMs,
    source: 'database',
  });
}
