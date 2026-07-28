import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPrisma, readSpecUnchecked, readStages, readStringArray } from '@idp/db';
import { Badge, Banner, Card, Section } from '../../../components/ui';

export const dynamic = 'force-dynamic';

/**
 * Service detail.
 *
 * The stored ProjectSpec is shown in full. It is the provenance record — the exact object that
 * produced this repository — so someone asking "why does this service have rate limiting" gets
 * an answer here rather than by reading the generated code.
 */
export default async function ServiceDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const service = await getPrisma()
    .service.findFirst({
      where: { slug },
      include: { health: true, jobs: { orderBy: { createdAt: 'desc' }, take: 5 } },
    })
    .catch(() => null);

  if (!service) notFound();

  const spec = readSpecUnchecked(service.spec, service.id) as Record<string, unknown>;
  const tags = readStringArray(service.tags, 'tags', service.id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/catalog"
            className="focus-ring text-xs text-[hsl(var(--muted-foreground))] underline underline-offset-4"
          >
            ← Catalog
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{service.displayName}</h1>
          <p className="font-mono text-sm text-[hsl(var(--muted-foreground))]">
            {service.org}/{service.slug}
          </p>
          {service.description ? <p className="mt-2 text-sm">{service.description}</p> : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge tone={service.lifecycle === 'PRODUCTION' ? 'success' : 'neutral'}>
            {service.lifecycle.toLowerCase()}
          </Badge>
          {tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Client</p>
          <p className="text-sm font-medium">{service.clientName}</p>
        </Card>
        <Card>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Repository</p>
          <a
            href={service.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-ring text-sm underline underline-offset-4 break-all"
          >
            {service.repoUrl}
          </a>
        </Card>
        <Card>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Spec version</p>
          <p className="text-sm font-medium">v{service.specVersion}</p>
        </Card>
      </div>

      {/* Health is populated by the reconciler, which does not exist yet. Saying so is more
          useful than rendering empty fields that look like a broken integration. */}
      {service.health ? (
        <Section title="Health">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">CI</p>
              <p className="text-sm">{service.health.ciStatus ?? 'unknown'}</p>
            </Card>
            <Card>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">ArgoCD sync</p>
              <p className="text-sm">{service.health.argoSyncStatus ?? 'unknown'}</p>
            </Card>
            <Card>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Open PRs</p>
              <p className="text-sm">{service.health.openPrCount ?? '—'}</p>
            </Card>
          </div>
        </Section>
      ) : (
        <Banner tone="neutral">
          No health data yet. The reconciler that populates CI and ArgoCD status arrives in a later
          phase.
        </Banner>
      )}

      <Section title="Provisioning history">
        <div className="space-y-2">
          {service.jobs.map((job) => (
            <Card key={job.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <Link
                  href={`/jobs/${job.id}`}
                  className="focus-ring font-mono text-xs underline underline-offset-4"
                >
                  {job.id}
                </Link>
                <div className="flex items-center gap-3">
                  {job.durationMs ? (
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      {(job.durationMs / 1000).toFixed(1)}s
                    </span>
                  ) : null}
                  <Badge
                    tone={
                      job.status === 'completed'
                        ? 'success'
                        : job.status === 'failed'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {job.status}
                  </Badge>
                </div>
              </div>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                {readStages(job.stages, job.id).filter((s) => s.status === 'done').length} stages
                completed · {job.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        title="Specification"
        description="The exact ProjectSpec that generated this repository."
      >
        <pre className="max-h-[32rem] overflow-auto rounded-[var(--radius)] border bg-[hsl(var(--muted))] p-4 text-xs">
          {JSON.stringify(spec, null, 2)}
        </pre>
      </Section>
    </div>
  );
}
