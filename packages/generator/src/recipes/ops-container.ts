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
import { pythonVersion, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { registerDeployableContract } from '../deployable-contract.js';
import { README_ORDER } from '../merge/readme.js';
import { NEXTJS_APP_RECIPE_ID } from './ui-nextjs-app.js';
import { VITE_REACT_RECIPE_ID } from './ui-vite-react.js';
import { NUXT_RECIPE_ID } from './ui-nuxt.js';
import { NODE_TS_RECIPE_ID } from './api-node-ts.js';
import { PYTHON_FASTAPI_RECIPE_ID, PYTHON_PORT } from './api-python-fastapi.js';
import { GO_GIN_RECIPE_ID, GO_PORT } from './api-go-gin.js';
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

export const CONTAINER_NUXT_RECIPE_ID = 'ops.container.nuxt';

/*
 * Nitro serves on 3000 and Nuxt's own `server/api/health.ts` answers `/api/health`, so the paths
 * match Next's even though nothing else about the image does. Readiness points at the same route:
 * a Nuxt server has no dependency to be un-ready for.
 */
registerDeployableContract({
  recipeId: CONTAINER_NUXT_RECIPE_ID,
  port: 3000,
  livenessPath: '/api/health',
  readinessPath: '/api/health',
  runAsUser: 65532,
  writablePaths: ['/tmp'],
});

/**
 * The Nuxt image.
 *
 * Separate from the Next one despite both ending on distroless: Nitro bundles its dependencies
 * into `.output`, so there is no deps stage and no node_modules to copy. Sharing a template would
 * mean branching on the framework inside it, which is the coupling the container recipes exist to
 * avoid.
 */
export const containerNuxtRecipe: Recipe = {
  id: CONTAINER_NUXT_RECIPE_ID,
  phase: 'integration',
  layer: 'ui',
  requires: [NUXT_RECIPE_ID],

  appliesTo: (spec) => containersEnabled(spec) && spec.ui?.framework === 'nuxt',

  files: (ctx) =>
    loadTemplateDir(templatePath('ops', 'container', 'nuxt'), ctx, CONTAINER_NUXT_RECIPE_ID),

  readme: () => ({
    order: README_ORDER.deployment,
    heading: 'Container (web)',
    body: [
      '```bash',
      'docker build -t web:local apps/web    # or . in a UI-only project',
      '```',
      '',
      'Multi-stage, ending on `gcr.io/distroless/nodejs22-debian12:nonroot` — no shell, no package',
      'manager, running as UID 65532.',
      '',
      'The runner copies only `.output`. Nitro bundles every dependency it reaches into that',
      'directory, so there is no `node_modules` in the final image at all.',
      '',
      'The build stage deliberately does NOT pass `--ignore-scripts`. Nuxt’s `postinstall` runs',
      '`nuxt prepare`, which writes the generated types the build needs — skipping it fails with',
      'missing `#imports` and nothing that names the cause.',
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

export const CONTAINER_PYTHON_API_RECIPE_ID = 'ops.container.python-api';

/*
 * Same probe paths as the Node API and a different port, which is exactly the case this contract
 * exists for. Before the runtime contract existed, `deployableRecipeId` returned the Node
 * container for any spec with an API layer — so a FastAPI project would have rendered a chart
 * routing to 3001 and probing an image listening on 8000. The chart renders, kubeconform passes,
 * `kubectl apply` succeeds, and the pod never goes Ready.
 */
registerDeployableContract({
  recipeId: CONTAINER_PYTHON_API_RECIPE_ID,
  port: PYTHON_PORT,
  livenessPath: '/health',
  readinessPath: '/ready',
  runAsUser: 65532,
  writablePaths: ['/tmp'],
});

export const containerPythonApiRecipe: Recipe = {
  id: CONTAINER_PYTHON_API_RECIPE_ID,
  phase: 'integration',
  layer: 'api',
  requires: [PYTHON_FASTAPI_RECIPE_ID],

  appliesTo: (spec) => containersEnabled(spec) && spec.api?.runtime === 'python-fastapi',

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ops', 'container', 'python-api'),
      ctx,
      CONTAINER_PYTHON_API_RECIPE_ID,
      { runtime: { port: PYTHON_PORT }, uvVersion: pythonVersion('uv') },
    ),

  readme: () => ({
    order: README_ORDER.deployment,
    heading: 'Container (api)',
    body: [
      '```bash',
      'docker build -t api:local apps/api    # or . in an API-only project',
      '```',
      '',
      'Multi-stage, ending on `gcr.io/distroless/python3-debian12:nonroot` — no shell, no pip,',
      'running as UID 65532 with a read-only root filesystem in Kubernetes.',
      '',
      'The builder is pinned to **python:3.11-slim-bookworm** to match the interpreter in the',
      'distroless image. This is not a preference: a virtualenv built against a different minor',
      'version copies across fine and then fails to import any package with a compiled extension,',
      'because the ABI tag in the `.so` filename no longer matches. The failure appears at',
      'container start, never at build time.',
      '',
      '`PYTHONPATH` points at the venv’s `site-packages` because there is no shell to activate a',
      'virtualenv and no `python` on `PATH` to honour its `pyvenv.cfg`.',
      '',
      'Dependencies install from `uv.lock` with `--frozen`, which fails rather than silently',
      're-resolving when the lockfile is out of date with `pyproject.toml`. Commit `uv.lock`.',
    ].join('\n'),
  }),
};

export const CONTAINER_GO_API_RECIPE_ID = 'ops.container.go-api';

/*
 * Same probe paths as the other two APIs, a third port — the case the contract exists for. 8080
 * matches the nginx SPA image's port, which is fine: they are different images with different
 * probe paths and different UIDs, and the chart asks the contract rather than assuming.
 */
registerDeployableContract({
  recipeId: CONTAINER_GO_API_RECIPE_ID,
  port: GO_PORT,
  livenessPath: '/health',
  readinessPath: '/ready',
  runAsUser: 65532,
  writablePaths: ['/tmp'],
});

export const containerGoApiRecipe: Recipe = {
  id: CONTAINER_GO_API_RECIPE_ID,
  phase: 'integration',
  layer: 'api',
  requires: [GO_GIN_RECIPE_ID],

  appliesTo: (spec) => containersEnabled(spec) && spec.api?.runtime === 'go-gin',

  files: (ctx) =>
    loadTemplateDir(templatePath('ops', 'container', 'go-api'), ctx, CONTAINER_GO_API_RECIPE_ID, {
      runtime: { port: GO_PORT },
    }),

  readme: () => ({
    order: README_ORDER.deployment,
    heading: 'Container (api)',
    body: [
      '```bash',
      'docker build -t api:local apps/api    # or . in an API-only project',
      '```',
      '',
      'Multi-stage, ending on `gcr.io/distroless/static-debian12:nonroot` — not even a libc. CGO',
      'is off and pgx is pure Go, so the image is ca-certificates, tzdata and one static binary,',
      'running as UID 65532 with a read-only root filesystem in Kubernetes.',
      '',
      'The build uses `-trimpath` so panics do not leak the build machine’s paths, and `-s -w` to',
      'strip symbol tables the binary never needs in production.',
      '',
      'Module download is a separate layer from the build, keyed on `go.mod`/`go.sum`, so it',
      'caches across source-only changes. Commit `go.sum` — until then the build resolves modules',
      'fresh each time and is not reproducible.',
    ].join('\n'),
  }),
};
