---
to: server/api/health.ts
---
/**
 * Liveness probe.
 *
 * The path is contractual: the generated Kubernetes deployment points its probes here, and the
 * deployable contract in the generator names `/api/health` for this image. Renaming it without
 * updating the chart causes rolling restarts that look like an application crash.
 *
 * `server/` sits at the repository root rather than under `app/` — it is Nitro's directory, not
 * Vue's, and nothing in it ships to the browser. A file at `server/api/health.ts` is served at
 * `/api/health` with no registration step, the same way `app/pages/` becomes routes.
 */
export default defineEventHandler(() => ({
  status: 'ok',
  service: '<%= spec.meta.slug %>',
  uptime: process.uptime(),
}));
