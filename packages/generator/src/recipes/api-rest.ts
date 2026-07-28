/**
 * REST with an auto-generated OpenAPI 3.0 document.
 *
 * The PRD requires the spec be generated, not written by hand (§3 Step 3). The chain is
 * Zod schema → JSON Schema → OpenAPI, so one definition drives runtime validation, the
 * document, and the handler's TypeScript types. A hand-maintained spec drifts from the
 * implementation within weeks; this one cannot, because there is nothing to keep in sync.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { MIDDLEWARE_PRIORITY } from '../codemod/markers.js';
import { NODE_TS_RECIPE_ID } from './api-node-ts.js';
import type { Recipe } from '../types.js';

export const REST_RECIPE_ID = 'api.paradigm.rest';

export const restRecipe: Recipe = {
  id: REST_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [NODE_TS_RECIPE_ID],

  appliesTo: (spec: ProjectSpec) => spec.api?.paradigm === 'rest' && spec.api.runtime === 'node-ts',

  files: (ctx) => loadTemplateDir(templatePath('api', 'paradigm', 'rest'), ctx, REST_RECIPE_ID),

  packageJson: () => ({
    dependencies: dependencyMap([
      '@fastify/swagger',
      '@scalar/fastify-api-reference',
      'fastify-type-provider-zod',
    ]),
  }),

  codemods: () => [
    {
      file: 'src/server.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'plugins',
        // Registered at `openapi` priority so it runs before routes are added — @fastify/swagger
        // can only document routes that are registered after it.
        lines: ['await registerOpenApi(app);'],
        priority: MIDDLEWARE_PRIORITY.openapi,
        recipeId: REST_RECIPE_ID,
      },
    },
    {
      file: 'src/server.ts',
      kind: 'addImport',
      args: { module: './plugins/openapi.js', named: ['registerOpenApi'] },
    },
  ],

  readme: () => ({
    order: README_ORDER.backend,
    heading: 'API Documentation',
    body: [
      '| Path | What |',
      '| --- | --- |',
      '| `/docs` | Interactive API reference (Scalar) |',
      '| `/openapi.json` | OpenAPI 3.0 document |',
      '',
      'The document is generated from route schemas, never hand-written. Define a route with a',
      'Zod schema and it appears in the docs automatically, with request validation and handler',
      'types derived from the same definition:',
      '',
      '```ts',
      "app.withTypeProvider<ZodTypeProvider>().get('/widgets', {",
      '  schema: {',
      "    tags: ['widgets'],",
      '    querystring: paginationQuerySchema,',
      '    response: { 200: paginatedSchema(widgetSchema), ...commonResponses },',
      '  },',
      '}, handler);',
      '```',
      '',
      '`/openapi.json` is a contract: the Service Catalog fetches the document from exactly that',
      'path, so changing it removes this service’s docs from the portal.',
    ].join('\n'),
  }),
};
