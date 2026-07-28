import { notFound, redirect } from 'next/navigation';
import { getPrisma, readStages } from '@idp/db';
import { JobProgress } from '../../../components/JobProgress';
import { currentUser } from '../../../lib/session';
import { getQueue } from '../../../lib/provisioning';

export const dynamic = 'force-dynamic';

/**
 * The job page renders its initial state on the server.
 *
 * A client-side fetch would show an empty progress list for one round trip — precisely when the
 * user is most anxious to see something happen. The SSE stream then takes over from this
 * snapshot.
 */
export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser().catch(() => null))) redirect('/signin');

  const { id } = await params;

  const live = await getQueue().get(id);
  if (live) {
    return (
      <Page title="Provisioning">
        <JobProgress
          jobId={id}
          initial={{
            id: live.id,
            status: live.status,
            stages: live.stages,
            warnings: live.warnings,
            repoUrl: live.repoUrl ?? null,
            errorMessage: live.errorMessage ?? null,
            org: live.spec.meta.repo.org,
            slug: live.spec.meta.slug,
          }}
        />
      </Page>
    );
  }

  const stored = await getPrisma().provisionJob.findUnique({ where: { id } });
  if (!stored) notFound();

  return (
    <Page title="Provisioning">
      <JobProgress
        jobId={id}
        initial={{
          id: stored.id,
          status: stored.status,
          stages: readStages(stored.stages, stored.id),
          warnings: JSON.parse(stored.warnings) as Array<{ code: string; message: string }>,
          repoUrl: stored.repoUrl,
          errorMessage: stored.errorMessage,
          org: stored.org,
          slug: stored.slug,
        }}
      />
    </Page>
  );
}

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
