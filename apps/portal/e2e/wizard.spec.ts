import { expect, test } from '@playwright/test';
import { signIn } from './sign-in';
import { API_PARADIGMS, API_RUNTIMES, AUTH_MODES, DATABASES } from '../lib/labels';

/**
 * The wizard happy path (doc 08).
 *
 * This is the only test that exercises what the product actually is: a person clicking through
 * five steps and getting a repository. Everything below the UI already has tests; what none of
 * them can prove is that the steps connect — that a choice in step 3 disables the right option in
 * step 2, that the guarded navigation lets you through, that submitting reaches a real pipeline.
 *
 * The remote is the only thing stubbed. `VCS_DRIVER=filesystem` means the provision is real
 * through every stage and lands on disk instead of GitHub.
 */

/** A slug that cannot collide with another run — the duplicate guard is doing its job. */
function uniqueSlug(): string {
  return `e2e-svc-${Math.random().toString(36).slice(2, 8)}`;
}

test.beforeEach(async ({ page }) => {
  await signIn(page);

  // Drafts survive between sessions by design — that is the feature. It also means a test that
  // reached step 4 leaves the next one opening at step 4, where the fields it expects do not
  // exist. Clearing through the real endpoint keeps each test starting from step 1.
  await page.evaluate(() => fetch('/api/drafts', { method: 'DELETE' }));
});

test('provisions a project end to end', async ({ page }) => {
  const slug = uniqueSlug();

  await page.goto('/new');
  await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();

  // ── Step 1 ─────────────────────────────────────────────────────────────────
  await page.getByLabel('Project name').fill('E2E Service');
  await page.getByLabel('Technical ID').fill(slug);
  await page.getByLabel('Client', { exact: false }).first().fill('E2E Client');
  await page.getByLabel('GitHub organisation').fill('e2e-org');

  await page.getByRole('button', { name: 'Continue' }).click();

  // ── Step 2 ─────────────────────────────────────────────────────────────────
  await expect(page.getByRole('heading', { name: 'Frontend' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // ── Step 3 ─────────────────────────────────────────────────────────────────
  await expect(page.getByRole('heading', { name: 'Backend' })).toBeVisible();

  /*
   * An option with no recipe is shown rather than hidden, and says why. That honesty is a
   * deliberate design decision, so it is worth asserting.
   *
   * Derived from the label table rather than naming an option, because naming one is wrong by
   * construction: this assertion read `Nuxt` until Nuxt shipped, at which point it failed on main
   * — and retargeting it at `python-fastapi` would have bought exactly one release before failing
   * again. What is being tested is the *property*, and the property outlives every individual
   * option.
   *
   * The enabled assertion below is not decoration. Once every option ships this loop has nothing
   * to iterate, and a test whose only assertions are inside an empty loop passes while proving
   * nothing.
   */
  await expect(page.getByRole('radio', { name: 'REST + OpenAPI' })).toBeEnabled();

  const unavailable = [API_RUNTIMES, API_PARADIGMS, DATABASES, AUTH_MODES]
    .flatMap((table) => Object.values(table))
    .filter((meta) => meta.comingIn);

  for (const meta of unavailable) {
    await expect(
      page.getByRole('radio', { name: meta.label }),
      `"${meta.label}" is marked as arriving in ${meta.comingIn}, so it must render disabled`,
    ).toBeDisabled();
  }

  await page.getByRole('button', { name: 'Continue' }).click();

  // ── Step 4 ─────────────────────────────────────────────────────────────────
  await expect(page.getByRole('heading', { name: 'DevOps' })).toBeVisible();

  // The preview pane renders through the real pipeline; give it time to return.
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dockerfile/ }).first()).toBeVisible({
    timeout: 40_000,
  });

  await page.getByRole('button', { name: 'Continue' }).click();

  // ── Step 5 ─────────────────────────────────────────────────────────────────
  // `exact` matters: "Review" is a substring of the preview pane's own "Preview" heading.
  await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create project' }).click();

  // ── Provisioning ───────────────────────────────────────────────────────────
  await expect(page).toHaveURL(/\/jobs\//, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Provisioning' })).toBeVisible();

  // Streamed over SSE, one stage at a time.
  await expect(page.getByText('Push to GitHub')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/^Completed/)).toBeVisible({ timeout: 90_000 });

  // ── Catalog ────────────────────────────────────────────────────────────────
  await page.goto('/catalog');
  await expect(page.getByRole('link', { name: 'E2E Service' }).first()).toBeVisible();

  // This run's own service: the database outlives a run, so "E2E Service" alone is ambiguous.
  await page.goto(`/catalog?q=${slug}`);
  await page.getByRole('link', { name: 'E2E Service' }).click();
  await expect(page).toHaveURL(new RegExp(`/catalog/e2e-org/${slug}$`));

  // The stored spec is the provenance record — it is the point of the catalog. The Stack tab
  // reads the choices back in the wizard's own words, and keeps the JSON itself one click away.
  await page
    .getByRole('navigation', { name: 'Service sections' })
    .getByRole('link', { name: 'Stack' })
    .click();
  await expect(page.getByText(slug, { exact: true })).toBeVisible();
  await page.getByText('Show the JSON').click();
  await expect(page.getByText('specVersion')).toBeVisible();

  // And the run that made it is on the Activity tab, stage by stage.
  await page
    .getByRole('navigation', { name: 'Service sections' })
    .getByRole('link', { name: 'Activity' })
    .click();
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
  await expect(page.getByText('render', { exact: true })).toBeVisible();
});

test('blocks navigation until the required fields are valid', async ({ page }) => {
  await page.goto('/new');

  // Step 1 starts incomplete, so Continue must not be available. Guarded navigation is what
  // stops someone reaching the review screen and meeting four errors at once.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();

  await page.getByLabel('Project name').fill('Valid Name');
  await page.getByLabel('Client', { exact: false }).first().fill('Valid Client');
  await page.getByLabel('GitHub organisation').fill('e2e-org');

  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

test('applies the compatibility matrix as options change', async ({ page }) => {
  await page.goto('/new');
  await page.getByLabel('Project name').fill('Matrix Check');
  await page.getByLabel('Client', { exact: false }).first().fill('Matrix Client');
  await page.getByLabel('GitHub organisation').fill('e2e-org');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Backend' })).toBeVisible();

  /*
   * Contradiction 3 from the PRD: tRPC's whole value is end-to-end TypeScript inference, so it
   * cannot target Python or Go. Under the default runtime, Node, it is a real choice; choose
   * FastAPI and it must become unavailable *and say why*; go back and it must return.
   *
   * This used to assert only that tRPC was disabled, which passed for the wrong reason — it had
   * no recipe yet, and the assertion could not tell a coming-soon note from the matrix. It then
   * failed the day tRPC shipped. This is the assertion it was always meant to be.
   */
  const trpc = page.getByRole('radio', { name: /tRPC/ });
  await expect(trpc).toBeEnabled();

  await page.getByRole('radio', { name: API_RUNTIMES['python-fastapi'].label }).click();
  await expect(trpc).toBeDisabled();
  await expect(trpc).toContainText('tRPC requires the Node.js (TypeScript) runtime');

  // Anchored at the start: while tRPC is unavailable its own card names the Node runtime in its
  // reason, so the unanchored label matches two radios.
  await page.getByRole('radio', { name: /^Node\.js \(TypeScript\)/ }).click();
  await expect(trpc).toBeEnabled();

  // Removing the database must remove the ORM section entirely rather than offering an ORM
  // with nothing to talk to.
  await expect(page.getByText('ORM / data access')).toBeVisible();
  await page.getByRole('radio', { name: /^None/ }).first().click();
  await expect(page.getByText('ORM / data access')).toBeHidden();
});

test('reshapes step 4 for a platform with no cluster', async ({ page }) => {
  await page.goto('/new');
  await page.getByLabel('Project name').fill('Vercel Target');
  await page.getByLabel('Client', { exact: false }).first().fill('Vercel Client');
  await page.getByLabel('GitHub organisation').fill('e2e-org');

  // Contradiction 5: a managed platform has no Kubernetes layer, so those sections do not
  // render at all — showing them disabled would imply they could be enabled.
  await page.getByRole('radio', { name: /Cloudflare \/ Vercel/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'DevOps' })).toBeVisible();
  // Scoped to the heading: "Container image" also appears in an option's description text.
  await expect(page.getByRole('heading', { name: 'Container image' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kubernetes' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'GitOps' })).toBeHidden();
});
