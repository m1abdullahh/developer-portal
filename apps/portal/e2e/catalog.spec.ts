import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { signIn } from './sign-in';

/**
 * The catalog dashboard (doc 07 §2, §7).
 *
 * The unit tests hold the query model — parsing, filtering, counting. What they cannot show is
 * that the page is wired to it: that clicking a filter really moves the URL, that the URL alone
 * really reproduces the view, that typing searches without a submit. Those are the acceptance
 * criteria, and they are claims about a browser.
 *
 * The database is shared, so every assertion is scoped to this run's own client names. Nothing
 * here assumes the suite's services are the only ones in the catalog.
 */
const runId = Math.random().toString(36).slice(2, 8);

interface SeededCatalog {
  /** Client of three services: Shop Web, Ledger, Reports. */
  clientA: string;
  /** Client of two: Marketing Site, Legacy Gateway. */
  clientB: string;
}
let fleet: SeededCatalog;

/** The seed runs in its own Node process — see the note at the top of catalog-seed.mjs. */
function seedScript(command: 'seed' | 'unseed'): string {
  return execFileSync('node', [path.join(__dirname, 'catalog-seed.mjs'), command, runId], {
    encoding: 'utf8',
    env: process.env,
  });
}

test.beforeAll(() => {
  fleet = JSON.parse(seedScript('seed')) as SeededCatalog;
});

test.afterAll(() => {
  seedScript('unseed');
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

/** The service cards or rows currently shown. */
function services(page: Page) {
  return page.getByRole('link', {
    name: /^(Shop Web|Ledger|Reports|Marketing Site|Legacy Gateway)$/,
  });
}

test('filters compose, and the URL is the view', async ({ page, context }) => {
  await page.goto(`/catalog?client=${encodeURIComponent(fleet.clientA)}`);
  await expect(services(page)).toHaveCount(3);
  await expect(page.getByText(/^3 of \d+ services$/)).toBeVisible();

  // A second facet narrows within the first…
  await page.locator('summary', { hasText: 'Runtime' }).click();
  await page.getByRole('link', { name: /Go \(Gin\)/ }).click();
  await expect(page).toHaveURL(/runtime=go-gin/);
  await expect(page).toHaveURL(/client=Catalog/);
  await expect(services(page)).toHaveCount(1);
  await expect(services(page)).toHaveText('Ledger');

  // …a second value in the same facet widens it again: any-of within, all-of across.
  await page.getByRole('link', { name: /Python \(FastAPI\)/ }).click();
  await expect(page).toHaveURL(/runtime=go-gin,python-fastapi/);
  await expect(services(page)).toHaveCount(2);

  // The link is the view: a fresh tab with nothing but the URL shows the same two services.
  const shared = await context.newPage();
  await shared.goto(page.url());
  await expect(services(shared)).toHaveCount(2);
  await expect(shared.getByRole('list', { name: 'Active filters' })).toContainText('Go (Gin)');
  await shared.close();

  // Each filter comes off on its own, and Escape closes the menu it was chosen from. Removing
  // the first of two values is the case that once changed the URL and re-rendered nothing: as a
  // repeated key, the router saw the same last value and called it the same page.
  await page.keyboard.press('Escape');
  await page
    .getByRole('list', { name: 'Active filters' })
    .getByRole('link', { name: /Go \(Gin\)/ })
    .click();
  await expect(page).not.toHaveURL(/go-gin/);
  await expect(services(page)).toHaveText('Reports');
});

test('search is debounced, server-side, and keeps the filters', async ({ page }) => {
  await page.goto(`/catalog?client=${encodeURIComponent(fleet.clientA)}`);

  // No submit: typing alone moves the URL. The term is only in the description.
  await page.getByRole('searchbox').fill('double-entry');
  await expect(page).toHaveURL(/q=double-entry/);
  await expect(page).toHaveURL(/client=Catalog/);
  await expect(services(page)).toHaveCount(1);
  await expect(services(page)).toHaveText('Ledger');

  // Tags are searched too, and a search with no match keeps the filter bar on the page.
  await page.getByRole('searchbox').fill('retail');
  await expect(services(page)).toHaveText('Shop Web');

  await page.getByRole('searchbox').fill('nothing-is-called-this');
  await expect(page.getByText('No services match these filters.')).toBeVisible();
  await expect(page.locator('summary', { hasText: 'Runtime' })).toBeVisible();

  await page.getByRole('link', { name: 'Clear filters and search' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole('searchbox')).toHaveValue('');
});

test('sorts, and switches between grid and table', async ({ page }) => {
  const scoped = `/catalog?client=${encodeURIComponent(fleet.clientA)}`;

  await page.goto(scoped);
  await expect(services(page)).toHaveText(['Shop Web', 'Reports', 'Ledger']); // recently updated

  await page
    .getByRole('navigation', { name: 'Sort services' })
    .getByRole('link', { name: 'Name' })
    .click();
  await expect(page).toHaveURL(/sort=name/);
  await expect(services(page)).toHaveText(['Ledger', 'Reports', 'Shop Web']);

  // What needs attention first: failing, then running, then passing.
  await page
    .getByRole('navigation', { name: 'Sort services' })
    .getByRole('link', { name: 'CI status' })
    .click();
  // The order happens to match the sort by name, so wait on the URL, not on the list.
  await expect(page).toHaveURL(/sort=ci/);
  await expect(services(page)).toHaveText(['Ledger', 'Reports', 'Shop Web']);
  await expect(page.getByText('CI failing')).toHaveCount(1);

  await page
    .getByRole('navigation', { name: 'Layout' })
    .getByRole('link', { name: 'Table' })
    .click();
  await expect(page).toHaveURL(/view=table/);
  await expect(page).toHaveURL(/sort=ci/);
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(4); // header + three services
  await expect(rows.nth(1)).toContainText('Ledger');
  await expect(rows.nth(1)).toContainText('payments');
});

test('a service the reconciler has not seen reads as unknown, never as passing', async ({
  page,
}) => {
  await page.goto(`/catalog?client=${encodeURIComponent(fleet.clientB)}&q=marketing`);
  await expect(services(page)).toHaveText('Marketing Site');
  await expect(page.getByText('CI status not checked yet')).toHaveCount(1);
  await expect(page.getByText('CI passing')).toHaveCount(0);
});

test('shows the fleet, with the provision time measured from real jobs', async ({ page }) => {
  await page.goto(`/catalog?client=${encodeURIComponent(fleet.clientA)}`);
  const stats = page.getByRole('region', { name: 'Fleet statistics' });

  // Fleet-wide: filtering to three services must not turn the strip into a result count.
  await expect(stats.getByText('Services', { exact: true })).toBeVisible();
  await expect(stats.getByText('Failing CI')).toBeVisible();

  // The seeded jobs guarantee at least three records, so the tile shows a duration, not a dash.
  const tile = stats.locator('div', { hasText: 'Median provision time' }).last();
  await expect(tile).toContainText(/\d+ (s|min|h)/);
  await expect(tile).toContainText(/Submit to repository ready · \d+ jobs/);
});
