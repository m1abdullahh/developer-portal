import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * The suite drives the portal the way a person does — clicking through five wizard steps and
 * watching a real provision run — which is the one thing no unit test can assert. Everything it
 * touches is real except the remote: `VCS_DRIVER=filesystem` writes the generated project to a
 * temporary directory instead of creating a GitHub repository, so the suite is safe to run on
 * every commit and cannot leave anything behind in an organisation.
 */
export default defineConfig({
  testDir: './e2e',
  // Serial. The portal runs one in-process queue and one SQLite file; parallel workers would
  // race each other's drafts and slugs rather than testing anything useful.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    /*
     * `localhost`, not `127.0.0.1`.
     *
     * Next 16 blocks cross-origin requests to dev resources, and it treats those two as
     * different origins. Served on localhost but browsed as 127.0.0.1, the client chunks are
     * refused: the page renders its server HTML, never hydrates, and every input becomes an
     * uncontrolled text box. Typing appears to work while no state changes at all — which looks
     * exactly like a broken wizard rather than a broken test setup.
     */
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    video: 'off',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // `next dev` rather than a production build: the development sign-in is refused when
  // NODE_ENV=production by design, and without it the suite could not authenticate at all.
  webServer: {
    command: 'npx next dev --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NODE_ENV: 'development',
      AUTH_SECRET: 'e2e-secret-not-used-outside-tests-0123456789abcdef',
      AUTH_URL: 'http://localhost:3100',
      AUTH_TRUST_HOST: 'true',
      AUTH_DEV_LOGIN: 'e2e',
      AUTH_DEV_ROLE: 'admin',
      // No GitHub credentials: sign-in falls back to the development provider, and provisioning
      // writes to disk. Neither reaches the network.
      VCS_DRIVER: 'filesystem',
      VCS_OUTPUT_DIR: './.idp-output/e2e',
      NEXT_PUBLIC_GITHUB_ORG: 'e2e-org',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
