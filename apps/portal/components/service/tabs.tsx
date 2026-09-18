import Link from 'next/link';
import { Suspense } from 'react';
import { LIFECYCLES } from '@idp/db';
import { setLifecycle } from '../../app/catalog/[org]/[slug]/actions';
import { cn } from '../../lib/cn';
import { facetLabel, formatDuration, relativeTime } from '../../lib/catalog';
import {
  apiContract,
  formatStageMs,
  quickLinks,
  specSheet,
  stageTimeline,
} from '../../lib/service-detail';
import { generatedOutput, type ServiceRecord } from '../../lib/service-detail-data';
import { Badge, Banner, Card, Section, type BadgeTone } from '../ui';
import { Markdown } from './Markdown';
import { AsGenerated, Fact, NotCheckedYet, Pending } from './parts';

// ── Overview ─────────────────────────────────────────────────────────────────

export function OverviewTab({
  service,
  isAdmin,
  now,
}: {
  service: ServiceRecord;
  isAdmin: boolean;
  now: Date;
}) {
  const links = quickLinks({
    repoUrl: service.repoUrl,
    org: service.org,
    slug: service.slug,
    spec: service.spec,
    argocdUrl: process.env.ARGOCD_URL,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Section title="README">
        <Card>
          <Suspense fallback={<Pending what="the README" />}>
            <Readme service={service} />
          </Suspense>
        </Card>
      </Section>

      <aside className="space-y-6">
        <Section title="About">
          <Card>
            <dl className="space-y-3">
              <Fact label="Client">{service.clientName}</Fact>
              <Fact label="Owner team">{service.ownerTeam ?? 'Not assigned'}</Fact>
              <Fact label="Provisioned">
                <time dateTime={service.createdAt.toISOString()}>
                  {relativeTime(service.createdAt, now)}
                </time>
                {service.createdBy ? ` by ${service.createdBy}` : ''}
              </Fact>
              <Fact label="Specification">Version {service.specVersion}</Fact>
            </dl>
          </Card>
        </Section>

        <Section title="Lifecycle">
          <Card>
            {isAdmin ? (
              <form action={setLifecycle} className="flex items-center gap-2">
                <input type="hidden" name="org" value={service.org} />
                <input type="hidden" name="slug" value={service.slug} />
                <label htmlFor="lifecycle" className="sr-only">
                  Lifecycle
                </label>
                <select
                  id="lifecycle"
                  name="lifecycle"
                  defaultValue={service.lifecycle}
                  className="focus-ring min-w-0 flex-1 rounded-[var(--radius)] border bg-[hsl(var(--background))] px-2 py-1.5 text-sm"
                >
                  {LIFECYCLES.map((value) => (
                    <option key={value} value={value}>
                      {facetLabel('lifecycle', value)}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="focus-ring rounded-[var(--radius)] border px-3 py-1.5 text-sm hover:bg-[hsl(var(--muted))]"
                >
                  Save
                </button>
              </form>
            ) : (
              <p className="text-sm">
                {facetLabel('lifecycle', service.lifecycle)}
                <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">
                  Changing it needs the admin role.
                </span>
              </p>
            )}
          </Card>
        </Section>

        <Section title="Quick links">
          <Card>
            {links.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                This repository was written to disk rather than to GitHub, so there is nothing to
                link to.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring underline underline-offset-4"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      </aside>
    </div>
  );
}

async function Readme({ service }: { service: ServiceRecord }) {
  const output = await generatedOutput(service);
  if (!output.ok) return <p className="text-sm">{output.reason}</p>;
  if (output.readme === null) return <p className="text-sm">This project has no README.</p>;
  return (
    <div className="space-y-4">
      <AsGenerated />
      <Markdown source={output.readme} />
    </div>
  );
}

// ── Stack ────────────────────────────────────────────────────────────────────

export function StackTab({ service }: { service: ServiceRecord }) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2">
        {specSheet(service.spec).map((group) => (
          <Card key={group.step}>
            <h3 className="text-sm font-semibold">
              <span className="mr-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">
                Step {group.step}
              </span>
              {group.title}
            </h3>
            {group.absent ? (
              <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">{group.absent}</p>
            ) : (
              <dl className="mt-3 divide-y text-sm">
                {group.rows.map((row) => (
                  <div key={row.label} className="flex justify-between gap-4 py-1.5">
                    <dt className="text-[hsl(var(--muted-foreground))]">{row.label}</dt>
                    <dd className="text-right">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        ))}
      </div>

      <Section
        title="Recipes"
        description="What the generator composed for this specification, and how many files each part contributed."
      >
        <Suspense fallback={<Pending what="the recipe list" />}>
          <Recipes service={service} />
        </Suspense>
      </Section>

      <Section
        title="Specification"
        description="The exact ProjectSpec that produced this repository — the complete record."
      >
        <details className="rounded-[var(--radius)] border">
          <summary className="focus-ring cursor-pointer px-4 py-2 text-sm">Show the JSON</summary>
          <pre className="max-h-[32rem] overflow-auto border-t bg-[hsl(var(--muted))] p-4 text-xs">
            {JSON.stringify(service.spec, null, 2)}
          </pre>
        </details>
      </Section>
    </div>
  );
}

async function Recipes({ service }: { service: ServiceRecord }) {
  const output = await generatedOutput(service);
  if (!output.ok) return <Banner tone="warning">{output.reason}</Banner>;

  return (
    <div className="space-y-2">
      <AsGenerated>
        {output.fileCount} files from {output.recipes.length} recipes.
      </AsGenerated>
      <div className="overflow-x-auto rounded-[var(--radius)] border bg-[hsl(var(--card))]">
        <table className="w-full text-left text-xs">
          <thead className="border-b text-[11px] tracking-wide text-[hsl(var(--muted-foreground))] uppercase">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                Recipe
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Files
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {output.recipes.map((recipe) => (
              <tr key={recipe.recipeId}>
                <th scope="row" className="px-4 py-1.5 font-mono font-normal">
                  {/* Files several recipes contribute to — package.json, the README, .env.example
                      — are produced by the merge phase rather than by any one of them. */}
                  {recipe.recipeId === '<merge>' ? (
                    <span className="font-sans">Merged from several recipes</span>
                  ) : (
                    recipe.recipeId
                  )}
                </th>
                <td className="px-4 py-1.5 text-right tabular-nums">{recipe.files}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── API ──────────────────────────────────────────────────────────────────────

export function ApiTab({ service }: { service: ServiceRecord }) {
  const contract = apiContract(service.spec);
  if (!contract) {
    return <Banner tone="neutral">This is a frontend-only project — it has no API layer.</Banner>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Fact label="Paradigm">{contract.paradigmLabel}</Fact>
        </Card>
        <Card>
          <Fact label="Runtime">{contract.runtimeLabel ?? '—'}</Fact>
        </Card>
        <Card>
          <Fact label="Authentication">{contract.authLabel ?? '—'}</Fact>
        </Card>
      </div>

      <Section
        title="Contract"
        description="Paths fixed by the generator — the same for every service of this paradigm, which is why the portal can state them without asking the service."
      >
        <div className="overflow-x-auto rounded-[var(--radius)] border bg-[hsl(var(--card))]">
          <table className="w-full text-left text-xs">
            <tbody className="divide-y">
              {contract.endpoints.map((endpoint) => (
                <tr key={endpoint.path}>
                  <th scope="row" className="px-4 py-2 font-mono font-normal whitespace-nowrap">
                    {endpoint.path}
                  </th>
                  <td className="px-4 py-2 text-[hsl(var(--muted-foreground))]">
                    {endpoint.purpose}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Banner tone="neutral">
        The rendered reference — OpenAPI for REST, the schema for GraphQL, the router for tRPC — is
        the catalog’s next feature. Until it lands, a running service renders its own at the paths
        above.
      </Banner>
    </div>
  );
}

// ── Deployments ──────────────────────────────────────────────────────────────

export function DeploymentsTab({ service }: { service: ServiceRecord }) {
  const spec = service.spec as { ops?: { k8s?: { enabled?: unknown } } } | null;
  const usesCluster = spec?.ops?.k8s?.enabled === true;

  if (!usesCluster) {
    return (
      <Banner tone="neutral">
        This service deploys to a managed platform, so it has no Helm chart and no ArgoCD
        application — its CD workflow deploys directly. See the Stack tab for the target.
      </Banner>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Fact label="ArgoCD sync">{service.health?.argoSyncStatus ?? <NotCheckedYet />}</Fact>
        </Card>
        <Card>
          <Fact label="ArgoCD health">{service.health?.argoHealth ?? <NotCheckedYet />}</Fact>
        </Card>
        <Card>
          <Fact label="Image deployed">
            <NotCheckedYet />
          </Fact>
        </Card>
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Live status comes from the health reconciler, which is not running yet. Nothing here is
        shown as healthy until something has actually looked.
      </p>

      <Section title="Helm values" description="The chart’s values, per environment.">
        <Suspense fallback={<Pending what="the chart values" />}>
          <HelmValues service={service} />
        </Suspense>
      </Section>
    </div>
  );
}

async function HelmValues({ service }: { service: ServiceRecord }) {
  const output = await generatedOutput(service);
  if (!output.ok) return <Banner tone="warning">{output.reason}</Banner>;
  if (output.helm.length === 0) {
    return <p className="text-sm">The generated project has no values files.</p>;
  }

  return (
    <div className="space-y-2">
      <AsGenerated />
      {output.helm.map((environment, index) => (
        <details
          key={environment.path}
          open={index === 0}
          className="rounded-[var(--radius)] border bg-[hsl(var(--card))]"
        >
          <summary className="focus-ring flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="font-medium">
              {environment.name}
              {environment.name === 'base' ? (
                <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">
                  shared defaults
                </span>
              ) : null}
            </span>
            <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
              {environment.path}
            </span>
          </summary>
          <pre className="max-h-[28rem] overflow-auto border-t bg-[hsl(var(--muted))] p-4 text-xs">
            {environment.content}
          </pre>
        </details>
      ))}
    </div>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────

const JOB_TONES: Record<string, BadgeTone> = {
  completed: 'success',
  completed_with_warnings: 'warning',
  failed: 'danger',
};

export function ActivityTab({ service, now }: { service: ServiceRecord; now: Date }) {
  return (
    <div className="space-y-8">
      <Section
        title="Provisioning history"
        description="Every run of the pipeline for this service, with the time each stage took."
      >
        {service.jobs.length === 0 ? (
          <Card>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No provisioning job is recorded for this service — it was registered another way.
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {service.jobs.map((job) => {
              const timeline = stageTimeline(job.stages);
              return (
                <li key={job.id}>
                  <Card>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="focus-ring font-mono text-xs underline underline-offset-4"
                      >
                        {job.id}
                      </Link>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
                        {job.requestedBy ? <span>{job.requestedBy}</span> : null}
                        <time dateTime={job.createdAt.toISOString()}>
                          {relativeTime(job.createdAt, now)}
                        </time>
                        {job.durationMs !== null ? (
                          <span className="tabular-nums">{formatDuration(job.durationMs)}</span>
                        ) : null}
                        <Badge tone={JOB_TONES[job.status] ?? 'neutral'}>
                          {job.status.replaceAll('_', ' ')}
                        </Badge>
                      </div>
                    </div>

                    {timeline.stages.length > 0 ? (
                      <ol className="mt-4 space-y-1.5">
                        {timeline.stages.map((stage) => (
                          <li
                            key={stage.stage}
                            className="grid grid-cols-[7rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-xs"
                          >
                            <span>{stage.stage}</span>
                            <span className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                              <span
                                className={cn(
                                  'block h-full rounded-full',
                                  stage.outcome === 'failed'
                                    ? 'bg-[hsl(var(--destructive))]'
                                    : 'bg-[hsl(var(--accent))]',
                                )}
                                // At least a sliver, so a fast stage is visible as having run.
                                style={{ width: `${Math.max(stage.share * 100, 1.5)}%` }}
                              />
                            </span>
                            <span className="text-right text-[hsl(var(--muted-foreground))] tabular-nums">
                              {stage.outcome === 'unfinished'
                                ? 'unfinished'
                                : stage.ms === null
                                  ? '—'
                                  : formatStageMs(stage.ms)}
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : null}

                    {job.errorMessage ? (
                      <p className="mt-3 text-xs text-[hsl(var(--destructive))]">
                        {job.errorMessage}
                      </p>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Repository activity">
        <Banner tone="neutral">
          Recent commits and workflow runs are read from GitHub by the health reconciler, which is
          not running yet.
          {service.health?.lastCommitAt ? (
            <> Last commit seen {relativeTime(service.health.lastCommitAt, now)}.</>
          ) : null}
        </Banner>
      </Section>
    </div>
  );
}
