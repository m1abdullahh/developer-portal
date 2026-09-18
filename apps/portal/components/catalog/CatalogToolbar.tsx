import Link from 'next/link';
import { cn } from '../../lib/cn';
import {
  CATALOG_SORTS,
  CATALOG_VIEWS,
  FACETS,
  FACET_TITLES,
  SORT_TITLES,
  catalogHref,
  clearFilters,
  facetLabel,
  isFiltered,
  toggleFacet,
  withSort,
  type CatalogPage,
  type CatalogQuery,
} from '../../lib/catalog';

const SEGMENT =
  'focus-ring px-2.5 py-1.5 text-xs font-medium first:rounded-l-[var(--radius)] last:rounded-r-[var(--radius)]';

function segmentClass(active: boolean): string {
  return cn(
    SEGMENT,
    active
      ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
      : 'hover:bg-[hsl(var(--muted))]',
  );
}

/** Sort, as links: the chosen order is part of the shareable URL like everything else. */
export function SortLinks({ query }: { query: CatalogQuery }) {
  return (
    <nav aria-label="Sort services" className="flex items-center gap-2">
      <span className="text-xs text-[hsl(var(--muted-foreground))]">Sort</span>
      <div className="flex divide-x rounded-[var(--radius)] border">
        {CATALOG_SORTS.map((sort) => (
          <Link
            key={sort}
            href={catalogHref(withSort(query, sort))}
            scroll={false}
            aria-current={query.sort === sort ? 'true' : undefined}
            className={segmentClass(query.sort === sort)}
          >
            {SORT_TITLES[sort]}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function ViewToggle({ query }: { query: CatalogQuery }) {
  return (
    <nav aria-label="Layout" className="flex divide-x rounded-[var(--radius)] border">
      {CATALOG_VIEWS.map((view) => (
        <Link
          key={view}
          href={catalogHref({ ...query, view })}
          scroll={false}
          aria-current={query.view === view ? 'true' : undefined}
          className={segmentClass(query.view === view)}
        >
          {view === 'grid' ? 'Grid' : 'Table'}
        </Link>
      ))}
    </nav>
  );
}

/** What is narrowing the view, each piece removable on its own, and one link to drop it all. */
export function ActiveFilters({ query }: { query: CatalogQuery }) {
  if (!isFiltered(query)) return null;

  const chips: Array<{ key: string; label: string; href: string }> = [];
  if (query.q !== '') {
    chips.push({
      key: 'q',
      label: `“${query.q}”`,
      href: catalogHref({ ...query, q: '', page: 1 }),
    });
  }
  for (const facet of FACETS) {
    for (const value of query.filters[facet]) {
      chips.push({
        key: `${facet}=${value}`,
        label: `${FACET_TITLES[facet]}: ${facetLabel(facet, value)}`,
        href: catalogHref(toggleFacet(query, facet, value)),
      });
    }
  }

  return (
    <ul aria-label="Active filters" className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <li key={chip.key}>
          <Link
            href={chip.href}
            scroll={false}
            className="focus-ring inline-flex items-center gap-1 rounded-full bg-[hsl(var(--accent))]/15 px-2 py-0.5 text-xs font-medium text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/25"
          >
            {chip.label}
            <span aria-hidden>✕</span>
            <span className="sr-only">— remove</span>
          </Link>
        </li>
      ))}
      <li>
        <Link
          href={catalogHref(clearFilters(query))}
          scroll={false}
          className="focus-ring text-xs underline underline-offset-4"
        >
          Clear all
        </Link>
      </li>
    </ul>
  );
}

/** Previous and next, as links — a page of the catalog is an address like any other view. */
export function Pager({ query, page }: { query: CatalogQuery; page: CatalogPage }) {
  if (page.pageCount <= 1) return null;

  const step = (label: string, target: number, enabled: boolean) =>
    enabled ? (
      <Link
        href={catalogHref({ ...query, page: target })}
        className="focus-ring rounded-[var(--radius)] border px-3 py-1.5 text-xs font-medium hover:bg-[hsl(var(--muted))]"
      >
        {label}
      </Link>
    ) : (
      <span
        aria-disabled="true"
        className="rounded-[var(--radius)] border px-3 py-1.5 text-xs font-medium opacity-40"
      >
        {label}
      </span>
    );

  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3">
      {step('← Previous', page.page - 1, page.page > 1)}
      <span className="text-xs text-[hsl(var(--muted-foreground))]">
        Page {page.page} of {page.pageCount}
      </span>
      {step('Next →', page.page + 1, page.page < page.pageCount)}
    </nav>
  );
}
