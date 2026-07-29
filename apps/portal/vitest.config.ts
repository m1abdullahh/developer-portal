import { defineConfig } from 'vitest/config';

/**
 * Vitest and Playwright both claim `*.spec.ts` by default.
 *
 * Without this exclusion `npm test` tries to execute the browser suite in Node, where
 * `@playwright/test`'s `test()` throws immediately — a red suite that says nothing about the
 * code. The two runners cover different things and are invoked separately: `npm test` for unit
 * tests, `npm run e2e` for the browser.
 */
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/.next/**', 'e2e/**'],
  },
});
