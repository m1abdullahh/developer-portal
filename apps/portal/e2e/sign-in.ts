import { expect, type Page } from '@playwright/test';

/**
 * Signs in through the development credentials provider.
 *
 * Waits for the redirect *away* from /signin rather than for any element containing "e2e" — the
 * sign-in button itself reads "Development sign-in (e2e)", so a text match succeeds instantly on
 * the page we are trying to leave, and the next navigation then races the session cookie.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/signin');
  await page.getByRole('button', { name: /development sign-in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/signin'), { timeout: 30_000 });

  // The role badge only renders for an authenticated session, so it proves the cookie landed.
  await expect(page.getByText('admin', { exact: true })).toBeVisible();
}
