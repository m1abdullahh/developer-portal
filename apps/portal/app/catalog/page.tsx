import Link from 'next/link';
import { hasRole } from '@idp/db';
import {
  ActiveFilters,
  Pager,
  SortLinks,
  ViewToggle,
} from '../../components/catalog/CatalogToolbar';
import { CatalogSearch } from '../../components/catalog/CatalogSearch';
import { FacetMenu } from '../../components/catalog/FacetMenu';
import { FacetMenuDismiss } from '../../components/catalog/FacetMenuDismiss';
import { FleetStatsStrip } from '../../components/catalog/FleetStatsStrip';
import { ServiceGrid, ServiceTable } from '../../components/catalog/ServiceViews';
import { Banner, Card } from '../../components/ui';
import {
  applyCatalogQuery,
  catalogHref,
  catalogParams,
  clearFilters,
  facetOptions,
  facetsInUse,
  fleetStats,
  isFiltered,
  paginate,
  parseCatalogQuery,
  type RawSearchParams,
} from '../../lib/catalog';
import { loadCatalog, type CatalogData } from '../../lib/catalog-data';
import { currentUser } from '../../lib/session';

export const dynamic = 'force-dynamic';

/**
 * The service catalog (doc 07 §2).
 *
 * The page is a function of its URL: `searchParams` parse to a query, the query filters the
 * fleet, and every control below is a link to the URL of the view it produces. Nothing about the
 * view lives anywhere else, which is what makes a filtered catalog something you can paste into a
 * message and have the other person see the same thing.
 */
export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await currentUser().catch(() => null);
  const canProvision = user !== null && hasRole(user.role, 'provisioner');
  const query = parseCatalogQuery(await searchParams);
  const now = new Date();

  let data: CatalogData;
  try {
    data = await loadCatalog();
  } catch (error) {
    // An unreadable database is not an empty catalog, and must not look like one.
    console.error('[catalog] could not load services', error);
    return (
      <div className="space-y-6">
        <Heading canProvision={canProvision} />
        <Banner tone="danger">
          <p className="font-medium">The catalog could not be read.</p>
          <p className="mt-1 text-xs">
            The portal database did not answer. If this is a fresh checkout, create it with{' '}
            <code className="font-mono">npm --workspace @idp/db run db:deploy</code>.
          </p>
        </Banner>
      </div>
    );
  }

  const visible = applyCatalogQuery(data.entries, query);
  const page = paginate(visible, query.page);
  const options = facetOptions(data.entries, query);
  const stats = fleetStats(data.entries, data.provisionDurationsMs, now);
  const total = data.entries.length;

  if (total === 0) {
    return (
      <div className="space-y-6">
        <Heading canProvision={canProvision} />
        <Card className="py-10 text-center">
          <p className="text-sm font-medium">No services yet.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-[hsl(var(--muted-foreground))]">
            Every project created through the wizard appears here, with the specification that
            produced it.
          </p>
          {canProvision ? (
            <Link
              href="/new"
              className="focus-ring mt-4 inline-flex rounded-[var(--radius)] bg-[hsl(var(--accent))] px-4 py-2 text-sm font-medium text-[hsl(var(--accent-foreground))] hover:opacity-90"
            >
              Create the first project
            </Link>
          ) : (
            <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
              Creating a project needs the provisioner role.
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Heading canProvision={canProvision} />

      <FleetStatsStrip stats={stats} />

      <section aria-label="Find services" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CatalogSearch
            initial={query.q}
            // Without `page`: a new search starts from its own first page.
            params={catalogParams(query).filter(([key]) => key !== 'q' && key !== 'page')}
          />
          <div className="flex flex-wrap items-center gap-3">
            <SortLinks query={query} />
            <ViewToggle query={query} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {facetsInUse(data.entries).map((facet) => (
            <FacetMenu key={facet} facet={facet} options={options[facet]} query={query} />
          ))}
          <FacetMenuDismiss />
        </div>

        <ActiveFilters query={query} />
      </section>

      <p aria-live="polite" className="text-xs text-[hsl(var(--muted-foreground))]">
        {isFiltered(query)
          ? `${visible.length} of ${total} ${total === 1 ? 'service' : 'services'}`
          : `${total} ${total === 1 ? 'service' : 'services'}`}
        {page.pageCount > 1 ? ` · showing ${page.from}–${page.to}` : ''}
      </p>

      {visible.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="text-sm font-medium">No services match these filters.</p>
          <Link
            href={catalogHref(clearFilters(query))}
            className="focus-ring mt-2 inline-block text-xs underline underline-offset-4"
          >
            Clear filters and search
          </Link>
        </Card>
      ) : query.view === 'table' ? (
        <ServiceTable entries={page.items} now={now} />
      ) : (
        <ServiceGrid entries={page.items} now={now} />
      )}

      <Pager query={query} page={page} />
    </div>
  );
}

function Heading({ canProvision }: { canProvision: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Service catalog</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Every provisioned service, with the specification that produced it.
        </p>
      </div>
      {canProvision ? (
        <Link href="/new" className="focus-ring text-sm underline underline-offset-4">
          New project →
        </Link>
      ) : null}
    </div>
  );
}
