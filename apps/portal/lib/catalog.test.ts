import { describe, expect, it } from 'vitest';
import { spineSpec } from '@idp/core';
import { API_RUNTIMES } from './labels';
import {
  DEFAULT_QUERY,
  applyCatalogQuery,
  catalogHref,
  clearFilters,
  deriveStack,
  facetLabel,
  facetOptions,
  facetsInUse,
  fleetStats,
  formatDuration,
  isFiltered,
  median,
  normaliseCiStatus,
  paginate,
  parseCatalogQuery,
  relativeTime,
  toggleFacet,
  withSort,
  type CatalogEntry,
} from './catalog';

const NOW = new Date('2026-09-18T12:00:00Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 3600 * 1000);
}

let seq = 0;
function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  seq += 1;
  return {
    id: `svc-${seq}`,
    org: 'acme',
    slug: `service-${seq}`,
    displayName: `Service ${seq}`,
    clientName: 'Acme',
    description: null,
    repoUrl: `https://github.com/acme/service-${seq}`,
    lifecycle: 'EXPERIMENTAL',
    ownerTeam: null,
    tags: ['idp-generated'],
    createdAt: daysAgo(10),
    updatedAt: daysAgo(1),
    framework: 'nextjs-app',
    runtime: 'node-ts',
    database: 'postgres',
    target: 'onprem-k8s',
    ciStatus: 'success',
    lastCommitAt: null,
    ...overrides,
  };
}

function slugs(entries: readonly CatalogEntry[]): string[] {
  return entries.map((e) => e.slug);
}

describe('the URL', () => {
  it('parses nothing to the defaults', () => {
    expect(parseCatalogQuery({})).toEqual(DEFAULT_QUERY);
    expect(catalogHref(DEFAULT_QUERY)).toBe('/catalog');
  });

  /** What Next hands the page for a link: every key, with all of its values. */
  function paramsOf(href: string): Record<string, string[]> {
    const search = new URL(href, 'http://portal').searchParams;
    return Object.fromEntries([...new Set(search.keys())].map((key) => [key, search.getAll(key)]));
  }

  it('round-trips a full query through its link', () => {
    const query = parseCatalogQuery({
      q: 'billing api',
      runtime: 'python-fastapi,go-gin',
      lifecycle: 'PRODUCTION',
      tag: 'payments',
      sort: 'ci',
      view: 'table',
    });
    expect(parseCatalogQuery(paramsOf(catalogHref(query)))).toEqual(query);
  });

  it('gives two links with the same meaning the same canonical form', () => {
    const a = parseCatalogQuery({ runtime: 'node-ts,go-gin', client: 'Acme' });
    const b = parseCatalogQuery({ client: 'Acme', runtime: ['go-gin', 'node-ts', 'go-gin'] });
    expect(catalogHref(a)).toBe(catalogHref(b));
    expect(catalogHref(a)).toBe('/catalog?client=Acme&runtime=go-gin,node-ts');
  });

  it('never writes a key twice — the router would treat the link as its last value', () => {
    // `?runtime=go-gin&runtime=python-fastapi` and `?runtime=python-fastapi` are one page to the
    // App Router, so dropping the first filter changed the URL and re-rendered nothing.
    let query = DEFAULT_QUERY;
    for (const value of ['python-fastapi', 'go-gin', 'node-ts']) {
      query = toggleFacet(query, 'runtime', value);
    }
    query = toggleFacet(query, 'tag', 'payments');

    const keys = catalogHref(query)
      .split('?')[1]
      ?.split('&')
      .map((pair) => pair.split('=')[0]);
    expect(keys).toEqual(['runtime', 'tag']);
    expect(new Set(keys).size).toBe(keys?.length);

    // And removing one value always changes the parameter's whole string.
    const fewer = toggleFacet(query, 'runtime', 'go-gin');
    expect(paramsOf(catalogHref(fewer))['runtime']).toEqual(['node-ts,python-fastapi']);
  });

  it('carries free-text values with commas and percent signs intact', () => {
    let query = toggleFacet(DEFAULT_QUERY, 'client', 'Acme, Inc.');
    query = toggleFacet(query, 'client', '100%2C Pure');
    query = toggleFacet(query, 'client', 'Globex');

    const href = catalogHref(query);
    expect(parseCatalogQuery(paramsOf(href)).filters.client).toEqual([
      '100%2C Pure',
      'Acme, Inc.',
      'Globex',
    ]);
    expect(parseCatalogQuery(paramsOf(href))).toEqual(query);
  });

  it('never trusts the query string', () => {
    const query = parseCatalogQuery({
      sort: 'drop table',
      view: ['cards', 'table'],
      q: `   ${'x'.repeat(500)}   `,
      runtime: ['', '  ', 'node-ts,,'],
    });
    expect(query.sort).toBe('updated');
    expect(query.view).toBe('grid');
    expect(query.q).toHaveLength(100);
    expect(query.filters.runtime).toEqual(['node-ts']);
  });

  it('leaves the defaults out of the link', () => {
    const query = parseCatalogQuery({ sort: 'updated', view: 'grid', q: '' });
    expect(catalogHref(query)).toBe('/catalog');
  });

  it('toggles a value in and back out', () => {
    const on = toggleFacet(DEFAULT_QUERY, 'runtime', 'go-gin');
    expect(on.filters.runtime).toEqual(['go-gin']);
    expect(isFiltered(on)).toBe(true);
    expect(toggleFacet(on, 'runtime', 'go-gin')).toEqual(DEFAULT_QUERY);
    // The default is never mutated — it is shared by every request.
    expect(DEFAULT_QUERY.filters.runtime).toEqual([]);
  });

  it('clears filters and search but keeps how the view is arranged', () => {
    const query = parseCatalogQuery({ q: 'x', client: 'Acme', sort: 'name', view: 'table' });
    expect(catalogHref(clearFilters(query))).toBe('/catalog?sort=name&view=table');
  });
});

describe('reading the stack from a stored spec', () => {
  it('reads a current spec', () => {
    const spec = spineSpec();
    expect(deriveStack(spec)).toEqual({
      framework: 'nextjs-app',
      runtime: 'node-ts',
      database: 'postgres',
      target: spec.meta.deploymentTarget,
    });
  });

  it('treats "none" as no database, and a missing layer as no value', () => {
    const apiOnly = spineSpec({ ui: null, api: { database: 'none', orm: 'none' } });
    expect(deriveStack(apiOnly)).toMatchObject({ framework: null, database: null });
  });

  it('survives a spec that no longer parses, or is not a spec at all', () => {
    expect(deriveStack({ api: { runtime: 'express-legacy' }, meta: 7 })).toEqual({
      framework: null,
      runtime: 'express-legacy',
      database: null,
      target: null,
    });
    for (const junk of [null, undefined, 'spec', 42, [], { ui: [] }]) {
      expect(deriveStack(junk)).toEqual({
        framework: null,
        runtime: null,
        database: null,
        target: null,
      });
    }
  });

  it('labels values the way the wizard did, and passes unknown ones through', () => {
    expect(facetLabel('runtime', 'python-fastapi')).toBe(API_RUNTIMES['python-fastapi'].label);
    expect(facetLabel('runtime', 'express-legacy')).toBe('express-legacy');
    expect(facetLabel('lifecycle', 'PRODUCTION')).toBe('Production');
  });

  it('reads an unwritten or unrecognised CI status as unknown, never as success', () => {
    expect(normaliseCiStatus(null)).toBe('unknown');
    expect(normaliseCiStatus('cancelled')).toBe('unknown');
    expect(normaliseCiStatus('failure')).toBe('failure');
  });
});

describe('filtering and search', () => {
  const fleet = [
    entry({ slug: 'shop-web', displayName: 'Shop', clientName: 'Acme', runtime: 'node-ts' }),
    entry({
      slug: 'ledger',
      displayName: 'Ledger',
      clientName: 'Globex',
      runtime: 'go-gin',
      framework: null,
      lifecycle: 'PRODUCTION',
      description: 'Double-entry billing service',
      tags: ['idp-generated', 'payments'],
    }),
    entry({
      slug: 'reports',
      displayName: 'Reports',
      clientName: 'Globex',
      runtime: 'python-fastapi',
      framework: 'nuxt',
      database: null,
    }),
  ];

  it('is any-of within a facet and all-of across facets', () => {
    const either = parseCatalogQuery({ runtime: 'go-gin,python-fastapi' });
    expect(slugs(applyCatalogQuery(fleet, either)).sort()).toEqual(['ledger', 'reports']);

    const both = parseCatalogQuery({ runtime: 'go-gin,python-fastapi', framework: 'nuxt' });
    expect(slugs(applyCatalogQuery(fleet, both))).toEqual(['reports']);
  });

  it('excludes a service with no value for a filtered facet', () => {
    const query = parseCatalogQuery({ database: 'postgres' });
    expect(slugs(applyCatalogQuery(fleet, query)).sort()).toEqual(['ledger', 'shop-web']);
  });

  it('searches name, slug, client, description and tags, case-insensitively', () => {
    const find = (q: string) => slugs(applyCatalogQuery(fleet, parseCatalogQuery({ q })));
    expect(find('SHOP')).toEqual(['shop-web']);
    expect(find('shop-w')).toEqual(['shop-web']);
    expect(find('globex').sort()).toEqual(['ledger', 'reports']);
    expect(find('double-entry')).toEqual(['ledger']);
    expect(find('payments')).toEqual(['ledger']);
    expect(find('nothing-like-this')).toEqual([]);
  });

  it('requires every search term, in any field', () => {
    const find = (q: string) => slugs(applyCatalogQuery(fleet, parseCatalogQuery({ q })));
    expect(find('globex billing')).toEqual(['ledger']);
    expect(find('globex shop')).toEqual([]);
  });

  it('composes search with filters', () => {
    const query = parseCatalogQuery({ q: 'globex', lifecycle: 'PRODUCTION' });
    expect(slugs(applyCatalogQuery(fleet, query))).toEqual(['ledger']);
  });
});

describe('sorting', () => {
  const fleet = [
    entry({ slug: 'b', displayName: 'beta', updatedAt: daysAgo(3), createdAt: daysAgo(30) }),
    entry({
      slug: 'a',
      displayName: 'Alpha',
      updatedAt: daysAgo(1),
      createdAt: daysAgo(40),
      ciStatus: 'failure',
    }),
    entry({
      slug: 'c',
      displayName: 'Gamma',
      updatedAt: daysAgo(2),
      createdAt: daysAgo(5),
      ciStatus: 'pending',
    }),
  ];
  const sorted = (sort: string) => slugs(applyCatalogQuery(fleet, parseCatalogQuery({ sort })));

  it('defaults to recently updated', () => {
    expect(sorted('')).toEqual(['a', 'c', 'b']);
  });

  it('sorts by name without regard to case', () => {
    expect(sorted('name')).toEqual(['a', 'b', 'c']);
  });

  it('sorts by newest', () => {
    expect(sorted('created')).toEqual(['c', 'b', 'a']);
  });

  it('puts what needs attention first when sorting by CI', () => {
    expect(sorted('ci')).toEqual(['a', 'c', 'b']);
  });

  it('breaks ties the same way every time', () => {
    const when = daysAgo(1);
    const twins = [
      entry({ slug: 'z', updatedAt: when }),
      entry({ slug: 'm', updatedAt: when }),
      entry({ slug: 'a', updatedAt: when }),
    ];
    const once = slugs(applyCatalogQuery(twins, parseCatalogQuery({ sort: 'ci' })));
    const again = slugs(applyCatalogQuery([...twins].reverse(), parseCatalogQuery({ sort: 'ci' })));
    expect(once).toEqual(['a', 'm', 'z']);
    expect(again).toEqual(once);
  });

  it('does not reorder the array it was given', () => {
    const before = slugs(fleet);
    applyCatalogQuery(fleet, parseCatalogQuery({ sort: 'name' }));
    expect(slugs(fleet)).toEqual(before);
  });
});

describe('pagination', () => {
  const fleet = Array.from({ length: 100 }, (_, i) => entry({ slug: `p-${i}` }));

  it('shows a page of 48 and says where it is', () => {
    const first = paginate(fleet, 1);
    expect(first).toMatchObject({ page: 1, pageCount: 3, from: 1, to: 48, total: 100 });
    expect(first.items).toHaveLength(48);

    const last = paginate(fleet, 3);
    expect(last).toMatchObject({ from: 97, to: 100 });
    expect(slugs(last.items)).toEqual(['p-96', 'p-97', 'p-98', 'p-99']);
  });

  it('shows the last page for a link that outlived its services, and one page for none', () => {
    expect(paginate(fleet, 99)).toMatchObject({ page: 3, from: 97, to: 100 });
    expect(paginate([], 4)).toMatchObject({ page: 1, pageCount: 1, from: 0, to: 0, items: [] });
  });

  it('keeps the page in the link, and leaves the first page out of it', () => {
    expect(catalogHref(parseCatalogQuery({ page: '3', view: 'table' }))).toBe(
      '/catalog?view=table&page=3',
    );
    expect(catalogHref(parseCatalogQuery({ page: '1' }))).toBe('/catalog');
    for (const junk of ['0', '-2', 'two', '1.5', '']) {
      expect(parseCatalogQuery({ page: junk }).page).toBe(1);
    }
  });

  it('goes back to the first page when the list itself changes, not when its layout does', () => {
    const deep = parseCatalogQuery({ page: '4', client: 'Acme' });
    expect(toggleFacet(deep, 'runtime', 'go-gin').page).toBe(1);
    expect(withSort(deep, 'name').page).toBe(1);
    expect(clearFilters(deep).page).toBe(1);
    expect({ ...deep, view: 'table' as const }.page).toBe(4);
  });
});

describe('facet options', () => {
  const fleet = [
    entry({ runtime: 'node-ts', clientName: 'Acme' }),
    entry({ runtime: 'node-ts', clientName: 'Globex' }),
    entry({ runtime: 'go-gin', clientName: 'Globex' }),
  ];

  it('counts every value, most common first', () => {
    const options = facetOptions(fleet, DEFAULT_QUERY);
    expect(options.runtime.map((o) => [o.value, o.count])).toEqual([
      ['node-ts', 2],
      ['go-gin', 1],
    ]);
    expect(options.runtime[0]?.label).toBe(API_RUNTIMES['node-ts'].label);
  });

  it('counts a facet over the other facets, not over itself', () => {
    const query = parseCatalogQuery({ runtime: 'go-gin' });
    const options = facetOptions(fleet, query);
    // Choosing Go must not zero out Node — the count says what adding Node would bring in.
    expect(options.runtime.map((o) => [o.value, o.count, o.selected])).toEqual([
      ['node-ts', 2, false],
      ['go-gin', 1, true],
    ]);
    // …while the other facets do narrow to the Go services.
    expect(options.client.map((o) => [o.value, o.count])).toEqual([['Globex', 1]]);
  });

  it('narrows counts by the search', () => {
    const options = facetOptions(fleet, parseCatalogQuery({ q: 'acme' }));
    expect(options.runtime.map((o) => [o.value, o.count])).toEqual([['node-ts', 1]]);
  });

  it('keeps a chosen value listed at zero so it can be unchosen', () => {
    const query = parseCatalogQuery({ runtime: 'python-fastapi', client: 'Acme' });
    const option = facetOptions(fleet, query).runtime.find((o) => o.value === 'python-fastapi');
    expect(option).toMatchObject({ count: 0, selected: true });
  });

  it('offers nothing for a facet no service has a value for', () => {
    expect(facetOptions(fleet, DEFAULT_QUERY).team).toEqual([]);
  });

  it('shows a facet because the fleet uses it, whatever the current view holds', () => {
    // No owner team anywhere, so no Owner team menu; everything else the fleet has values for.
    expect(facetsInUse(fleet)).toEqual([
      'client',
      'framework',
      'runtime',
      'database',
      'target',
      'lifecycle',
      'tag',
    ]);
    // A search that matches nothing empties every menu's options — and must not remove the bar.
    const nothing = parseCatalogQuery({ q: 'zzzz' });
    expect(facetOptions(fleet, nothing).runtime).toEqual([]);
    expect(facetsInUse(fleet)).toContain('runtime');
  });
});

describe('fleet stats', () => {
  const fleet = [
    entry({ createdAt: new Date('2026-09-01T00:00:00Z'), target: 'aws-eks' }),
    entry({ createdAt: new Date('2026-08-31T23:59:59Z'), ciStatus: 'failure' }),
    entry({ createdAt: new Date('2026-09-17T08:00:00Z'), runtime: 'go-gin', ciStatus: 'failure' }),
    entry({ createdAt: daysAgo(400), runtime: null, target: 'cloudflare-vercel' }),
  ];

  it('counts the fleet, this calendar month in UTC, and failing CI', () => {
    const stats = fleetStats(fleet, [], NOW);
    expect(stats.total).toBe(4);
    expect(stats.provisionedThisMonth).toBe(2);
    expect(stats.failingCi).toBe(2);
  });

  it('breaks the fleet down by target and runtime, leaving out services with neither', () => {
    const stats = fleetStats(fleet, [], NOW);
    expect(stats.byTarget.map((b) => [b.value, b.count])).toEqual([
      ['onprem-k8s', 2],
      ['aws-eks', 1],
      ['cloudflare-vercel', 1],
    ]);
    expect(stats.byRuntime.map((b) => [b.value, b.count])).toEqual([
      ['node-ts', 2],
      ['go-gin', 1],
    ]);
  });

  it('reports the median provision time, and none before the first job', () => {
    expect(fleetStats(fleet, [], NOW).medianProvisionMs).toBeNull();
    expect(fleetStats(fleet, [9_000, 13_200, 60_000], NOW)).toMatchObject({
      medianProvisionMs: 13_200,
      provisionSamples: 3,
    });
  });

  it('takes the median, not the mean — one stuck job must not move the tile', () => {
    expect(median([10, 12, 11, 3_600_000])).toBe(11.5);
    expect(median([5])).toBe(5);
    expect(median([])).toBeNull();
  });
});

describe('formatting', () => {
  it('formats a duration in the unit a person would say it in', () => {
    expect(formatDuration(13_200)).toBe('13 s');
    expect(formatDuration(346_000)).toBe('5 min 46 s');
    expect(formatDuration(120_000)).toBe('2 min');
    expect(formatDuration(3_720_000)).toBe('1 h 02 min');
  });

  it('formats a time relative to a given now', () => {
    expect(relativeTime(daysAgo(3), NOW)).toBe('3 days ago');
    expect(relativeTime(daysAgo(1), NOW)).toBe('yesterday');
    expect(relativeTime(new Date(NOW.getTime() - 2 * 3600 * 1000), NOW)).toBe('2 hours ago');
    expect(relativeTime(new Date(NOW.getTime() - 20 * 1000), NOW)).toBe('just now');
    expect(relativeTime(daysAgo(21), NOW)).toBe('3 weeks ago');
  });
});

describe('at fleet scale', () => {
  // Doc 07 §7 asks for the catalog to load in under a second with 200 services. Ten times that,
  // through the whole path the page takes, inside a budget that leaves the second to the database
  // and the render.
  it('filters, sorts, counts and summarises 2,000 services well inside the budget', () => {
    const runtimes = ['node-ts', 'python-fastapi', 'go-gin'];
    const clients = Array.from({ length: 40 }, (_, i) => `Client ${i}`);
    const fleet = Array.from({ length: 2_000 }, (_, i) =>
      entry({
        slug: `svc-${i}`,
        displayName: `Service ${i}`,
        clientName: clients[i % clients.length] as string,
        runtime: runtimes[i % 3] as string,
        description: i % 7 === 0 ? 'handles billing and invoices' : 'general service',
        updatedAt: daysAgo(i % 90),
        ciStatus: i % 11 === 0 ? 'failure' : 'success',
      }),
    );
    const query = parseCatalogQuery({ q: 'billing', runtime: 'node-ts,go-gin', sort: 'ci' });

    const started = performance.now();
    const visible = applyCatalogQuery(fleet, query);
    const options = facetOptions(fleet, query);
    const stats = fleetStats(fleet, [], NOW);
    const elapsed = performance.now() - started;

    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((e) => e.runtime !== 'python-fastapi')).toBe(true);
    expect(options.client.length).toBeGreaterThan(0);
    expect(stats.total).toBe(2_000);
    expect(elapsed).toBeLessThan(250);
  });
});
