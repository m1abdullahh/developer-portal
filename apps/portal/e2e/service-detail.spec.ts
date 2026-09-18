import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { signIn } from './sign-in';

/**
 * Service detail (doc 07 §3).
 *
 * The tabs' content is unit-tested as data — the spec sheet, the timelines, the quick links. What
 * only a browser can show is that the page is assembled from it: that three tabs really do
 * regenerate the repository from the stored specification and stream it in, that a tab is an
 * address, that the old one-segment address still finds its service, and that the lifecycle
 * editor writes and is refused to nobody it should not be.
 *
 * Shares the catalog suite's seeded fleet (see catalog-seed.mjs), under its own run id.
 */
const runId = Math.random().toString(36).slice(2, 8);
let fleet: { clientA: string; clientB: string; prefix: string };

function seedScript(command: 'seed' | 'unseed'): string {
  return execFileSync('node', [path.join(__dirname, 'catalog-seed.mjs'), command, runId], {
    encoding: 'utf8',
    env: process.env,
  });
}

test.beforeAll(() => {
  fleet = JSON.parse(seedScript('seed')) as typeof fleet;
});

test.afterAll(() => {
  seedScript('unseed');
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('opens from the catalog at an address that names the organisation', async ({ page }) => {
  await page.goto(`/catalog?client=${encodeURIComponent(fleet.clientA)}`);
  await page.getByRole('link', { name: 'Ledger', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/catalog/[^/]+/${fleet.prefix}-ledger$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Ledger' })).toBeVisible();
  await expect(page.getByText('CI failing')).toBeVisible();

  // The README is regenerated from the stored spec and streamed in; it says what it is.
  await expect(page.getByText(/as generated, not as the repository stands today/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Ledger' })).toBeVisible();

  // The address this page had before: the ID alone. It still resolves, to the canonical one.
  const canonical = page.url();
  await page.goto(`/catalog/${fleet.prefix}-ledger`);
  await expect(page).toHaveURL(canonical);
});

test('a tab is an address, and each shows what the stored specification says', async ({ page }) => {
  await page.goto(`/catalog?client=${encodeURIComponent(fleet.clientA)}`);
  await page.getByRole('link', { name: 'Ledger', exact: true }).click();
  const tabs = page.getByRole('navigation', { name: 'Service sections' });

  await tabs.getByRole('link', { name: 'Stack' }).click();
  await expect(page).toHaveURL(/tab=stack/);
  await expect(page.getByText('Go (Gin)')).toBeVisible();
  // An API-only project says so, rather than showing an empty UI group.
  await expect(page.getByText(/No UI layer/)).toBeVisible();
  await expect(page.getByText(/\d+ files from \d+ recipes/)).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'api.runtime.go-gin' })).toBeVisible();

  await tabs.getByRole('link', { name: 'API' }).click();
  await expect(page.getByRole('rowheader', { name: '/openapi.json' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: '/ready' })).toBeVisible();

  await tabs.getByRole('link', { name: 'Deployments' }).click();
  await expect(page).toHaveURL(/tab=deployments/);
  // Nothing is shown as healthy until something has looked.
  await expect(page.getByText('Not checked yet')).toHaveCount(3);
  for (const file of [
    'values.yaml',
    'values-dev.yaml',
    'values-staging.yaml',
    'values-prod.yaml',
  ]) {
    await expect(page.getByText(`deploy/${file}`, { exact: true })).toBeVisible();
  }

  await tabs.getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByRole('link', { name: `${fleet.prefix}-job-1` })).toBeVisible();
  await expect(page.getByText('completed', { exact: true })).toBeVisible();

  // A reload of a tab's address lands on that tab.
  await page.reload();
  await expect(tabs.getByRole('link', { name: 'Activity' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('a service on a managed platform has no chart to show, and says so', async ({ page }) => {
  await page.goto(`/catalog?client=${encodeURIComponent(fleet.clientB)}&q=marketing`);
  await page.getByRole('link', { name: 'Marketing Site', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Service sections' })
    .getByRole('link', { name: 'Deployments' })
    .click();
  await expect(page.getByText(/deploys to a managed platform/)).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Service sections' })
    .getByRole('link', { name: 'API' })
    .click();
  await expect(page.getByText(/frontend-only project/)).toBeVisible();
});

test('an admin changes the lifecycle, and the catalog follows', async ({ page }) => {
  const scoped = `/catalog?client=${encodeURIComponent(fleet.clientA)}`;
  await page.goto(scoped);
  await page.getByRole('link', { name: 'Reports', exact: true }).click();

  await page.getByLabel('Lifecycle').selectOption('DEPRECATED');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('header').getByText('Deprecated')).toBeVisible();

  await page.goto(`${scoped}&lifecycle=DEPRECATED`);
  await expect(page.getByRole('link', { name: 'Reports', exact: true })).toBeVisible();
  await expect(page.getByText(/^1 of \d+ services$/)).toBeVisible();
});

test('an address that names nothing is a 404, not an empty page', async ({ page }) => {
  const response = await page.goto('/catalog/no-such-org/no-such-service');
  expect(response?.status()).toBe(404);
});
