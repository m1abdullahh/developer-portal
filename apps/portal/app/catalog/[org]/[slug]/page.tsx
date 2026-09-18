import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasRole } from '@idp/db';
import { CiDot } from '../../../../components/catalog/ServiceViews';
import { ServiceTabs } from '../../../../components/service/parts';
import {
  ActivityTab,
  ApiTab,
  DeploymentsTab,
  OverviewTab,
  StackTab,
} from '../../../../components/service/tabs';
import { Badge, Banner, type BadgeTone } from '../../../../components/ui';
import { facetLabel, normaliseCiStatus } from '../../../../lib/catalog';
import { parseTab } from '../../../../lib/service-detail';
import { loadService, type ServiceRecord } from '../../../../lib/service-detail-data';
import { currentUser } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

const LIFECYCLE_TONES: Record<string, BadgeTone> = {
  PRODUCTION: 'success',
  EXPERIMENTAL: 'neutral',
  DEPRECATED: 'warning',
};

/**
 * Service detail (doc 07 §3).
 *
 * Everything here is read from the ProjectSpec stored when the service was provisioned. It is
 * the provenance record — the exact object that produced the repository — so someone asking "why
 * does this service have rate limiting" gets an answer here rather than by reading generated
 * code. Only the active tab does any work: the three that need generated output run the pipeline
 * once between them, and only when one of them is opened.
 */
export default async function ServiceDetail({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; slug: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { org, slug } = await params;
  const tab = parseTab((await searchParams).tab);

  let service: ServiceRecord | null;
  try {
    service = await loadService(decodeURIComponent(org), decodeURIComponent(slug));
  } catch (error) {
    // An unreadable database is not a missing service, and must not look like one.
    console.error('[service-detail] could not load the service', error);
    return (
      <Banner tone="danger">The catalog could not be read — the database did not answer.</Banner>
    );
  }
  if (!service) notFound();

  const user = await currentUser().catch(() => null);
  const isAdmin = user !== null && hasRole(user.role, 'admin');
  const now = new Date();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
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

        <div className="flex flex-wrap items-center gap-2">
          <CiDot status={normaliseCiStatus(service.health?.ciStatus)} />
          <Badge tone={LIFECYCLE_TONES[service.lifecycle] ?? 'neutral'}>
            {facetLabel('lifecycle', service.lifecycle)}
          </Badge>
          {service.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      </header>

      <ServiceTabs org={service.org} slug={service.slug} active={tab} />

      {tab === 'overview' ? <OverviewTab service={service} isAdmin={isAdmin} now={now} /> : null}
      {tab === 'stack' ? <StackTab service={service} /> : null}
      {tab === 'api' ? <ApiTab service={service} /> : null}
      {tab === 'deployments' ? <DeploymentsTab service={service} /> : null}
      {tab === 'activity' ? <ActivityTab service={service} now={now} /> : null}
    </div>
  );
}
