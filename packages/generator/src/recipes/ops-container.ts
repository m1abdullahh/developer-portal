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
import { README_ORDER } from '../merge/readme.js';
import { NEXTJS_APP_RECIPE_ID } from './ui-nextjs-app.js';
import { VITE_REACT_RECIPE_ID } from './ui-vite-react.js';
import { NODE_TS_RECIPE_ID } from './api-node-ts.js';
import type { Recipe } from '../types.js';

const containersEnabled = (spec: ProjectSpec): boolean => spec.ops.container.strategy !== 'none';

export const CONTAINER_NEXT_RECIPE_ID = 'ops.container.next';

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
