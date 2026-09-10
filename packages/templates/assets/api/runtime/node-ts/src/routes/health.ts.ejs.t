---
to: src/routes/health.ts
---
import type { FastifyInstance } from 'fastify';

/**
 * Liveness and readiness.
 *
 * These two paths are CONTRACTUAL: the generated Kubernetes deployment points its probes at
 * them (doc 04 §2). Renaming either without updating the chart causes restart loops that look
 * like an application crash.
 *
 * The distinction matters. Liveness answers "is this process wedged?" — if it fails, Kubernetes
 * kills the pod. Readiness answers "can this pod serve traffic right now?" — if it fails, the
 * pod is pulled from the Service but left running. Checking the database in the liveness probe
 * is a classic mistake: a brief database blip would then restart every pod simultaneously,
 * turning a recoverable outage into a total one.
 */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
<% if (spec.api.paradigm === 'rest') { -%>
  // The `schema` metadata is for the OpenAPI document: operationId, tag and description are what
  // a linter — and a generated client — need from every operation. Fastify validates nothing
  // from it. The keys are declared by @fastify/swagger's type augmentation, which only a REST
  // project installs; elsewhere they would be excess properties and fail the typecheck.
<% } -%>
  app.get(
    '/health',
<% if (spec.api.paradigm === 'rest') { -%>
    {
      schema: {
        operationId: 'getHealth',
        tags: ['system'],
        summary: 'Liveness',
        description:
          'Answers whether this process is wedged. Checks nothing downstream, so a dependency ' +
          'outage never restarts the pods.',
      },
    },
<% } -%>
    async () => ({
      status: 'ok',
      service: '<%= spec.meta.slug %>',
      uptime: process.uptime(),
    }),
  );

  app.get(
    '/ready',
<% if (spec.api.paradigm === 'rest') { -%>
    {
      schema: {
        operationId: 'getReadiness',
        tags: ['system'],
        summary: 'Readiness',
        description:
          'Answers whether this pod can serve traffic right now: 200 with every dependency ' +
          'check passing, 503 with the failing ones named.',
      },
    },
<% } -%>
    async (_request, reply) => {
    const checks: Record<string, 'ok' | 'error'> = {};

    // >>> idp:readiness-checks
    // <<< idp:readiness-checks

    const failed = Object.values(checks).some((value) => value === 'error');
    return reply.status(failed ? 503 : 200).send({
      status: failed ? 'unavailable' : 'ready',
      checks,
    });
    },
  );
}
