/**
 * Node.js + Fastify — the P1 spine's API base recipe.
 *
 * Fastify rather than Express (a documented deviation from the PRD, which names only
 * "Node.js/TypeScript"): its plugin model maps directly onto our middleware recipes, and its
 * JSON-schema validation is the same schema that produces the OpenAPI document, so one
 * definition serves runtime validation, docs and types.
 *
 * Owns `src/server.ts`, which declares the marker regions every middleware recipe injects into.
 * Registration ORDER lives in MIDDLEWARE_PRIORITY, not in this template — that way it is
 * identical across Node, Python and Go rather than re-derived per runtime.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import type { Recipe } from '../types.js';

export const NODE_TS_RECIPE_ID = 'api.runtime.node-ts';

export const nodeTsRecipe: Recipe = {
  id: NODE_TS_RECIPE_ID,
  phase: 'base',
  layer: 'api',

  appliesTo: (spec: ProjectSpec) => spec.api?.runtime === 'node-ts',

  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'runtime', 'node-ts'), ctx, NODE_TS_RECIPE_ID),

  packageJson: (ctx) => ({
    dependencies: dependencyMap([
      'fastify',
      'zod',
      'pino',
      ...(ctx.spec.api?.middleware.logging ? (['pino-pretty'] as const) : []),
    ]),
    devDependencies: dependencyMap(['typescript', '@types/node', 'tsx', 'vitest', 'eslint']),
  }),

  env: () => [
    {
      key: 'PORT',
      example: '3001',
      required: false,
      description: 'HTTP port the API listens on',
    },
    {
      key: 'LOG_LEVEL',
      example: 'info',
      required: false,
      description: 'Pino log level (fatal, error, warn, info, debug, trace)',
    },
  ],

  gitignore: () => ['dist/', '*.tsbuildinfo', 'coverage/'],

  readme: () => ({
    order: README_ORDER.backend,
    heading: 'API',
    body: [
      'Fastify with TypeScript. `src/server.ts` builds the app; `src/index.ts` starts it and',
      'handles graceful shutdown.',
      '',
      '| Endpoint | Purpose |',
      '| --- | --- |',
      '| `GET /health` | Liveness — is the process wedged? Failing this restarts the pod. |',
      '| `GET /ready` | Readiness — can it serve now? Failing this removes it from the Service. |',
      '',
      'Both paths are referenced by the Kubernetes probes in `deploy/`, so keep them stable.',
      '',
      '`/ready` checks dependencies; `/health` deliberately does not. Checking the database in',
      'a liveness probe means one brief database blip restarts every pod at once, turning a',
      'recoverable outage into a total one.',
      '',
      'Shutdown drains in-flight requests on SIGTERM. Without that, every rolling update drops',
      'the requests already in progress on each terminating pod.',
    ].join('\n'),
  }),

  postInstall: () => ['npm install', 'npm run dev'],
};
