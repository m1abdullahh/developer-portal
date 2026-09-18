/**
 * The catalog's query model — everything about `/catalog` that is not a database call or markup.
 *
 * Doc 07 §2 asks for filters that live in the URL, search, four sorts, and a fleet stats strip.
 * All of it is here as pure functions over plain data, for two reasons. The URL is an interface:
 * a filtered view is a link someone pastes into a chat, so parsing and serialising it has to be
 * deterministic and tested like any other contract. And the stack facets (framework, runtime,
 * database, deployment target) are read out of each service's stored ProjectSpec rather than
 * from columns of their own — the catalog cannot drift from what was generated because it reads
 * the object the generator consumed — which means they cannot be filtered in SQL. At the scale
 * this portal serves (the acceptance bar is 200 services in under a second; `catalog.test.ts`
 * holds 2,000 to a fraction of that) filtering in memory is simply the smaller design.
 */

import {
  API_RUNTIMES,
  DATABASES,
  DEPLOYMENT_TARGETS,
  UI_FRAMEWORKS,
  type OptionMeta,
} from './labels';

// ── vocabulary ───────────────────────────────────────────────────────────────

export const CATALOG_SORTS = ['updated', 'name', 'created', 'ci'] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const CATALOG_VIEWS = ['grid', 'table'] as const;
export type CatalogView = (typeof CATALOG_VIEWS)[number];

/** In the order the filter bar shows them, which is also their order in a canonical URL. */
export const FACETS = [
  'client',
  'framework',
  'runtime',
  'database',
  'target',
  'lifecycle',
  'team',
  'tag',
] as const;
export type Facet = (typeof FACETS)[number];

export const FACET_TITLES: Record<Facet, string> = {
  client: 'Client',
  framework: 'Framework',
  runtime: 'Runtime',
  database: 'Database',
  target: 'Deployment target',
  lifecycle: 'Lifecycle',
  team: 'Owner team',
  tag: 'Tag',
};

export const SORT_TITLES: Record<CatalogSort, string> = {
  updated: 'Recently updated',
  name: 'Name',
  created: 'Newest',
  ci: 'CI status',
};

export const CI_STATUSES = ['failure', 'pending', 'unknown', 'success'] as const;
export type CiStatus = (typeof CI_STATUSES)[number];

/** What the reconciler has not written yet is unknown, never success (doc 07 §5). */
export function normaliseCiStatus(raw: string | null | undefined): CiStatus {
  return (CI_STATUSES as readonly string[]).includes(raw ?? '') ? (raw as CiStatus) : 'unknown';
}

// ── the rows ─────────────────────────────────────────────────────────────────

export interface CatalogEntry {
  id: string;
  org: string;
  slug: string;
  displayName: string;
  clientName: string;
  description: string | null;
  repoUrl: string;
  lifecycle: string;
  ownerTeam: string | null;
  tags: readonly string[];
  createdAt: Date;
  updatedAt: Date;
  framework: string | null;
  runtime: string | null;
  database: string | null;
  target: string | null;
  ciStatus: CiStatus;
  lastCommitAt: Date | null;
}

export interface StackSummary {
  framework: string | null;
  runtime: string | null;
  database: string | null;
  target: string | null;
}

/**
 * Reads the stack out of a stored spec, defensively rather than through the schema.
 *
 * A service written under an older specVersion must still be listable: a catalog that hides rows
 * it cannot fully parse is worse than one that shows them with fewer badges. `none` is the
 * absence of a database, so it is no value here — there is nothing to badge or to filter by.
 */
export function deriveStack(spec: unknown): StackSummary {
  const root = asRecord(spec);
  const ui = asRecord(root?.['ui']);
  const api = asRecord(root?.['api']);
  const meta = asRecord(root?.['meta']);

  const database = asString(api?.['database']);
  return {
    framework: asString(ui?.['framework']),
    runtime: asString(api?.['runtime']),
    database: database === 'none' ? null : database,
    target: asString(meta?.['deploymentTarget']),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** The values an entry has for a facet — several for tags, one or none for everything else. */
export function facetValues(entry: CatalogEntry, facet: Facet): readonly string[] {
  switch (facet) {
    case 'client':
      return [entry.clientName];
    case 'framework':
      return entry.framework ? [entry.framework] : [];
    case 'runtime':
      return entry.runtime ? [entry.runtime] : [];
    case 'database':
      return entry.database ? [entry.database] : [];
    case 'target':
      return entry.target ? [entry.target] : [];
    case 'lifecycle':
      return [entry.lifecycle];
    case 'team':
      return entry.ownerTeam ? [entry.ownerTeam] : [];
    case 'tag':
      return entry.tags;
  }
}

const FACET_LABELS: Partial<Record<Facet, Record<string, OptionMeta>>> = {
  framework: UI_FRAMEWORKS,
  runtime: API_RUNTIMES,
  database: DATABASES,
  target: DEPLOYMENT_TARGETS,
};

/** The wizard's name for a value where it has one, so a badge reads the way the choice did. */
export function facetLabel(facet: Facet, value: string): string {
  if (facet === 'lifecycle') return value.charAt(0) + value.slice(1).toLowerCase();
  return FACET_LABELS[facet]?.[value]?.label ?? value;
}

// ── the URL ──────────────────────────────────────────────────────────────────

export interface CatalogQuery {
  q: string;
  filters: Record<Facet, readonly string[]>;
  sort: CatalogSort;
  view: CatalogView;
  /** 1-based. Anything that changes *which* services are listed sends it back to 1. */
  page: number;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

const MAX_QUERY_LENGTH = 100;
const MAX_VALUES_PER_FACET = 25;

/*
 * A facet's values travel in ONE parameter, comma-separated: `runtime=go-gin,python-fastapi`.
 *
 * Not as a repeated key, which is what this did first and what `searchParams` models as
 * `string[]`. The App Router identifies a page by its search parameters with the *last* value of
 * a repeated key, so `?runtime=go-gin&runtime=python-fastapi` and `?runtime=python-fastapi` are
 * the same page to it: removing the first filter changed the address bar, fetched the right
 * payload, and rendered nothing. Found by the browser suite (`e2e/catalog.spec.ts`), invisible
 * to everything else — the server was right every time.
 *
 * Values are free text (client names, tags), so a comma or a percent sign inside one is escaped
 * before joining. `%` first, or the escape for `,` would itself be escaped on the way back.
 */
function joinValues(values: readonly string[]): string {
  return values.map((value) => value.replaceAll('%', '%25').replaceAll(',', '%2C')).join(',');
}

function splitValues(raw: string): string[] {
  return raw.split(',').map((part) => part.replaceAll('%2C', ',').replaceAll('%25', '%'));
}

function emptyFilters(): Record<Facet, readonly string[]> {
  return Object.fromEntries(FACETS.map((facet) => [facet, []])) as unknown as Record<
    Facet,
    readonly string[]
  >;
}

export const DEFAULT_QUERY: CatalogQuery = {
  q: '',
  filters: emptyFilters(),
  sort: 'updated',
  view: 'grid',
  page: 1,
};

/**
 * Services per page. Divisible by one, two and three, so the last row of the grid is full at
 * every breakpoint. The page exists because rendering is what costs: the query path handles
 * thousands of services in milliseconds, but two hundred cards of markup took the server over
 * two seconds, against an acceptance bar of one (doc 07 §7).
 */
export const PAGE_SIZE = 48;

const MAX_PAGE = 10_000;

/**
 * Parses whatever arrived in the query string. Never throws and never trusts: an unknown sort is
 * the default sort, a repeated value is one value, and values are sorted so that two links with
 * the same meaning parse to the same query.
 */
export function parseCatalogQuery(params: RawSearchParams): CatalogQuery {
  const first = (key: string): string => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? '';
  };
  const all = (key: string): string[] => {
    const value = params[key];
    // A repeated key is still read — a hand-written link should work — it is just never written.
    const list = (Array.isArray(value) ? value : value === undefined ? [] : [value]).flatMap(
      splitValues,
    );
    const cleaned = list.map((item) => item.trim()).filter((item) => item !== '');
    return [...new Set(cleaned)].sort().slice(0, MAX_VALUES_PER_FACET);
  };

  const sort = first('sort');
  const view = first('view');
  const page = Number.parseInt(first('page'), 10);
  const filters = emptyFilters();
  for (const facet of FACETS) filters[facet] = all(facet);

  return {
    q: first('q').trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH),
    filters,
    sort: (CATALOG_SORTS as readonly string[]).includes(sort) ? (sort as CatalogSort) : 'updated',
    view: (CATALOG_VIEWS as readonly string[]).includes(view) ? (view as CatalogView) : 'grid',
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** The query as `[key, value]` pairs in canonical order — each key once, defaults left out. */
export function catalogParams(query: CatalogQuery): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  if (query.q !== '') pairs.push(['q', query.q]);
  for (const facet of FACETS) {
    const values = [...query.filters[facet]].sort();
    if (values.length > 0) pairs.push([facet, joinValues(values)]);
  }
  if (query.sort !== DEFAULT_QUERY.sort) pairs.push(['sort', query.sort]);
  if (query.view !== DEFAULT_QUERY.view) pairs.push(['view', query.view]);
  if (query.page > 1) pairs.push(['page', String(query.page)]);
  return pairs;
}

/**
 * Pairs to a query string. The separating commas are left readable — they are legal in a query
 * string, and `runtime=go-gin,python-fastapi` is a link a person can read and edit. A comma
 * *inside* a value was escaped to `%2C` before this point, which encodes to `%252C` and is
 * therefore never mistaken for one.
 */
export function catalogSearchString(pairs: ReadonlyArray<readonly [string, string]>): string {
  return pairs
    .map(([key, value]) => `${key}=${encodeURIComponent(value).replaceAll('%2C', ',')}`)
    .join('&');
}

/** The shareable link for a query. The same query always produces the same string. */
export function catalogHref(query: CatalogQuery, base = '/catalog'): string {
  const search = catalogSearchString(catalogParams(query));
  return search === '' ? base : `${base}?${search}`;
}

export function toggleFacet(query: CatalogQuery, facet: Facet, value: string): CatalogQuery {
  const current = query.filters[facet];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value].sort();
  return { ...query, page: 1, filters: { ...query.filters, [facet]: next } };
}

export function clearFilters(query: CatalogQuery): CatalogQuery {
  return { ...query, page: 1, q: '', filters: emptyFilters() };
}

/** A different order is a different first page; a different layout of the same page is not. */
export function withSort(query: CatalogQuery, sort: CatalogSort): CatalogQuery {
  return { ...query, sort, page: 1 };
}

export function activeFilterCount(query: CatalogQuery): number {
  return FACETS.reduce((sum, facet) => sum + query.filters[facet].length, 0);
}

export function isFiltered(query: CatalogQuery): boolean {
  return query.q !== '' || activeFilterCount(query) > 0;
}

// ── filter, search, sort ─────────────────────────────────────────────────────

/** Every whitespace-separated term must appear somewhere in the searchable text. */
function matchesSearch(entry: CatalogEntry, q: string): boolean {
  if (q === '') return true;
  const haystack = [
    entry.displayName,
    entry.slug,
    entry.clientName,
    entry.description ?? '',
    ...entry.tags,
  ]
    .join('\n')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(' ')
    .every((term) => haystack.includes(term));
}

/** Any of the chosen values within a facet, all of the facets together. */
function matchesFilters(entry: CatalogEntry, query: CatalogQuery, except?: Facet): boolean {
  return FACETS.every((facet) => {
    const wanted = query.filters[facet];
    if (facet === except || wanted.length === 0) return true;
    const values = facetValues(entry, facet);
    return wanted.some((value) => values.includes(value));
  });
}

const CI_RANK: Record<CiStatus, number> = { failure: 0, pending: 1, unknown: 2, success: 3 };

const COMPARATORS: Record<CatalogSort, (a: CatalogEntry, b: CatalogEntry) => number> = {
  updated: (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  created: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  name: (a, b) => a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' }),
  // Failing first: the sort exists to answer "what needs attention", not to admire green.
  ci: (a, b) => CI_RANK[a.ciStatus] - CI_RANK[b.ciStatus],
};

export function applyCatalogQuery(
  entries: readonly CatalogEntry[],
  query: CatalogQuery,
): CatalogEntry[] {
  const primary = COMPARATORS[query.sort];
  return entries
    .filter((entry) => matchesSearch(entry, query.q) && matchesFilters(entry, query))
    .sort(
      (a, b) =>
        primary(a, b) ||
        // Ties resolve the same way every time, or a refresh reshuffles the page.
        COMPARATORS.updated(a, b) ||
        a.slug.localeCompare(b.slug),
    );
}

// ── pagination ───────────────────────────────────────────────────────────────

export interface CatalogPage {
  items: CatalogEntry[];
  /** The page actually shown — the requested one, brought back into range. */
  page: number;
  pageCount: number;
  /** 1-based positions of the first and last item shown; both 0 when there is nothing. */
  from: number;
  to: number;
  total: number;
}

/**
 * A page beyond the end shows the last page rather than nothing: a link to page 5 outlives the
 * services that made five pages, and an empty list would read as "no services".
 */
export function paginate(
  entries: readonly CatalogEntry[],
  requested: number,
  size = PAGE_SIZE,
): CatalogPage {
  const total = entries.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, requested), pageCount);
  const start = (page - 1) * size;
  const items = entries.slice(start, start + size);
  return {
    items,
    page,
    pageCount,
    from: items.length === 0 ? 0 : start + 1,
    to: start + items.length,
    total,
  };
}

// ── facet options ────────────────────────────────────────────────────────────

/**
 * The facets worth showing: those some service in the *fleet* has a value for.
 *
 * Decided from the whole fleet, not the current view. Deciding from the view made the filter bar
 * rearrange itself as filters were applied, and vanish entirely on a search with no results —
 * exactly when someone needs it to see what they have filtered by.
 */
export function facetsInUse(entries: readonly CatalogEntry[]): Facet[] {
  return FACETS.filter((facet) => entries.some((entry) => facetValues(entry, facet).length > 0));
}

export interface FacetOption {
  value: string;
  label: string;
  /** How many services the view would hold with this value chosen in this facet. */
  count: number;
  selected: boolean;
}

/**
 * The options each facet offers, with counts.
 *
 * A facet's counts are taken over the entries that pass the search and every *other* facet — not
 * this one. Counting over the fully filtered view would show every unchosen value as zero the
 * moment one is chosen, which is precisely when the counts are needed: they say what adding a
 * second value would bring in. A chosen value stays listed even at zero, so it can be unchosen.
 */
export function facetOptions(
  entries: readonly CatalogEntry[],
  query: CatalogQuery,
): Record<Facet, FacetOption[]> {
  const searched = entries.filter((entry) => matchesSearch(entry, query.q));
  const out = {} as Record<Facet, FacetOption[]>;

  for (const facet of FACETS) {
    const counts = new Map<string, number>();
    for (const entry of searched) {
      if (!matchesFilters(entry, query, facet)) continue;
      for (const value of facetValues(entry, facet)) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    for (const value of query.filters[facet]) {
      if (!counts.has(value)) counts.set(value, 0);
    }

    out[facet] = [...counts.entries()]
      .map(([value, count]) => ({
        value,
        label: facetLabel(facet, value),
        count,
        selected: query.filters[facet].includes(value),
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }
  return out;
}

// ── fleet stats ──────────────────────────────────────────────────────────────

export interface Breakdown {
  value: string;
  label: string;
  count: number;
}

export interface FleetStats {
  total: number;
  byTarget: Breakdown[];
  byRuntime: Breakdown[];
  provisionedThisMonth: number;
  failingCi: number;
  /** Median of the successful provisioning jobs' durations, or null before the first one. */
  medianProvisionMs: number | null;
  provisionSamples: number;
}

function breakdown(entries: readonly CatalogEntry[], facet: Facet): Breakdown[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const value of facetValues(entry, facet)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: facetLabel(facet, value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/**
 * The strip above the catalog. Always the whole fleet, never the filtered view: a number that
 * changes when you type in the search box is a result count, not a fleet statistic.
 *
 * "This month" is the calendar month in UTC, so the tile reads the same for everyone looking at
 * it rather than rolling over at a different hour per timezone.
 */
export function fleetStats(
  entries: readonly CatalogEntry[],
  provisionDurationsMs: readonly number[],
  now: Date,
): FleetStats {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return {
    total: entries.length,
    byTarget: breakdown(entries, 'target'),
    byRuntime: breakdown(entries, 'runtime'),
    provisionedThisMonth: entries.filter((entry) => entry.createdAt.getTime() >= monthStart).length,
    failingCi: entries.filter((entry) => entry.ciStatus === 'failure').length,
    medianProvisionMs: median(provisionDurationsMs),
    provisionSamples: provisionDurationsMs.length,
  };
}

// ── formatting ───────────────────────────────────────────────────────────────

/** `45 s`, `5 min 46 s`, `1 h 02 min` — the unit a person would say it in. */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
}

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** `3 days ago`. Takes `now` rather than reading the clock, so it can be tested and cached. */
export function relativeTime(date: Date, now: Date): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(seconds) >= size) return format.format(Math.trunc(seconds / size), unit);
  }
  return 'just now';
}
