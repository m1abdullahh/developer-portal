/**
 * Container recipes.
 *
 * One per deployable, each declaring its own layer so the Dockerfile lands beside the app it
 * builds. In a UI+API project that produces apps/web/Dockerfile and apps/api/Dockerfile with
 * their own build contexts — which is correct, because they are two images, two Deployments
 * and two rollout lifecycles.
 *
 * Both images are multi-stage and end on distroless: no shell, no package manager, no
 * coreutils. A compromised process has almost nothing to pivot with.
 */

import { templatePath } from '@idp/templates';
import type { ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { NEXTJS_APP_RECIPE_ID } from './ui-nextjs-app.js';
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
