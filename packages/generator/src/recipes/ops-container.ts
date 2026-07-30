/**
 * Container recipes.
 *
 * One per deployable, each declaring its own layer so the Dockerfile lands beside the app it
 * builds. In a UI+API project that produces apps/web/Dockerfile and apps/api/Dockerfile with
 * their own build contexts — which is correct, because they are two images, two Deployments
 * and two rollout lifecycles.
 *
 * The Node images are multi-stage and end on distroless: no shell, no package manager, no
 * coreutils. A compromised process has almost nothing to pivot with. The SPA image goes further
 * and contains no Node runtime at all — a Vite build is just files.
 */

import { templatePath } from '@idp/templates';
import type { ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { registerDeployableContract } from '../deployable-contract.js';
import { README_ORDER } from '../merge/readme.js';
import { NEXTJS_APP_RECIPE_ID } from './ui-nextjs-app.js';
import { VITE_REACT_RECIPE_ID } from './ui-vite-react.js';
import { NODE_TS_RECIPE_ID } from './api-node-ts.js';
import type { Recipe } from '../types.js';

const containersEnabled = (spec: ProjectSpec): boolean => spec.ops.container.strategy !== 'none';

export const CONTAINER_NEXT_RECIPE_ID = 'ops.container.next';

/*
 * Next serves its probe from `app/api/health/route.ts`, so the path carries the `/api` prefix the
 * App Router gives every route handler. Readiness points at the same endpoint: a Next server has
 * no dependency to be un-ready for, and a second route returning an identical 200 would be
 * ceremony rather than a signal.
 */
registerDeployableContract({
  recipeId: CONTAINER_NEXT_RECIPE_ID,
  port: 3000,
  livenessPath: '/api/health',
  readinessPath: '/api/health',
  runAsUser: 65532,
  writablePaths: ['/tmp'],
});

export const containerNextRecipe: Recipe = {
  id: CONTAINER_NEXT_RECIPE_ID,
  phase: 'integration',
  // 'ui', not 'ops': the Dockerfile belongs beside the app it builds, and its build context
  // is that directory.
  layer: 'ui',
  requires: [NEXTJS_APP_RECIPE_ID],

  appliesTo: (spec) => containersEnabled(spec) && spec.ui?.framework === 'nextjs-app',

  files: (ctx) =>
    loadTemplateDir(templatePath('ops', 'container', 'next'), ctx, CONTAINER_NEXT_RECIPE_ID),

  readme: () => ({
    order: README_ORDER.deployment,
    heading: 'Container (web)',
    body: [
      '```bash',
      'docker build -t web:local apps/web    # or . in a UI-only project',
      '```',
      '',
      'Multi-stage, ending on `gcr.io/distroless/nodejs22-debian12:nonroot` — no shell, no',
      'package manager, running as UID 65532.',
      '',
      'Depends on `output: "standalone"` in `next.config.ts`. Without it the runner stage has no',
      '`server.js` and the container exits immediately, while `npm run build` still succeeds',
      'locally — so the failure only appears at image build time.',
    ].join('\n'),
  }),
};

export const CONTAINER_SPA_NGINX_RECIPE_ID = 'ops.container.spa-nginx';

/*
 * Every value here differs from the distroless images, which is the reason this contract exists.
 * 8080 because UID 101 cannot bind a privileged port; `/healthz` because that is the location
 * nginx.conf defines; `/var/cache/nginx` because nginx buffers request bodies and proxy responses
 * to disk and the root filesystem is read-only.
 */
registerDeployableContract({
  recipeId: CONTAINER_SPA_NGINX_RECIPE_ID,
  port: 8080,
  livenessPath: '/healthz',
  readinessPath: '/healthz',
  runAsUser: 101,
  writablePaths: ['/tmp', '/var/cache/nginx'],
});

/**
 * Static SPA image for Vite.
 *
 * A separate recipe rather than a branch inside the Next one: the two images share no stages,
 * no base, and no runtime. Vite emits files, so the result is nginx serving a directory with no
 * Node process in it at all.
 *
 * Without this, a Vite project with containers enabled generated no web Dockerfile whatsoever —
 * a silent absence, since the Next recipe correctly declines to apply and nothing else claimed
 * the slot.
 */
export const containerSpaNginxRecipe: Recipe = {
  id: CONTAINER_SPA_NGINX_RECIPE_ID,
  phase: 'integration',
  layer: 'ui',
  requires: [VITE_REACT_RECIPE_ID],

  appliesTo: (spec) => containersEnabled(spec) && spec.ui?.framework === 'vite-react',

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ops', 'container', 'spa-nginx'),
      ctx,
      CONTAINER_SPA_NGINX_RECIPE_ID,
    ),

  readme: () => ({
    order: README_ORDER.deployment,
    heading: 'Container (web)',
    body: [
      '```bash',
      'docker build -t web:local apps/web    # or . in a UI-only project',
      '```',
      '',
      'nginx serving the static `dist/` output. There is no Node runtime in the final image.',
      '',
      'It listens on **8080**, not 80 — the unprivileged nginx image runs as UID 101, which cannot',
      'bind a port below 1024. Adjust your Service and probes accordingly if you change it.',
      '',
      '`nginx.conf` falls back to `index.html` for unknown paths, which is what makes client-side',
      'routing work. Without it, navigating inside the app succeeds but reloading that page 404s.',
      '',
      'Hashed assets are cached for a year and `index.html` is never cached — it is the map to',
      'those filenames, and a cached copy keeps requesting the previous deploy long after it is',
      'gone.',
    ].join('\n'),
  }),
};

export const CONTAINER_NODE_API_RECIPE_ID = 'ops.container.node-api';

/*
 * The only deployable whose two probe paths genuinely differ. `/ready` checks the database, so a
 * Postgres outage removes the pod from the Service; `/health` does not, so the same outage does
 * not also restart it. Pointing both at the same route would turn a dependency blip into a crash
 * loop — the failure the split exists to prevent.
 */
registerDeployableContract({
  recipeId: CONTAINER_NODE_API_RECIPE_ID,
  port: 3001,
  livenessPath: '/health',
  readinessPath: '/ready',
  runAsUser: 65532,
  writablePaths: ['/tmp'],
});

export const containerNodeApiRecipe: Recipe = {
  id: CONTAINER_NODE_API_RECIPE_ID,
  phase: 'integration',
  layer: 'api',
  requires: [NODE_TS_RECIPE_ID],

  appliesTo: (spec) => containersEnabled(spec) && spec.api?.runtime === 'node-ts',

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ops', 'container', 'node-api'),
      ctx,
      CONTAINER_NODE_API_RECIPE_ID,
    ),

  readme: () => ({
    order: README_ORDER.deployment,
    heading: 'Container (api)',
    body: [
      '```bash',
      'docker build -t api:local apps/api    # or . in an API-only project',
      '```',
      '',
      'Multi-stage distroless, non-root (UID 65532), read-only root filesystem in Kubernetes.',
      '',
      'Dependency install is a separate stage from the build so `node_modules` layers cache',
      'across source-only changes rather than reinstalling on every commit.',
    ].join('\n'),
  }),
};
