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
import { PYTHON_FASTAPI_RECIPE_ID } from './api-python-fastapi.js';
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

export const REST_PYTHON_RECIPE_ID = 'api.paradigm.rest-python';

/**
 * The same paradigm for FastAPI, which arrives most of the way there already.
 *
 * FastAPI derives an OpenAPI document from route signatures and Pydantic models with no help, so
 * unlike the Node recipe there is no plugin to register and no type provider to install — the
 * chain the PRD asks for is the framework's default behaviour.
 *
 * What is missing is everything the framework cannot infer: `info.description`, `contact`, the
 * bearer security scheme, `servers`, and the shared error/pagination shapes every route reports.
 * A document without those still validates as OpenAPI and still fails a Spectral lint, and a
 * generated client built from it has no base URL and no way to send a token.
 */
export const restPythonRecipe: Recipe = {
  id: REST_PYTHON_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [PYTHON_FASTAPI_RECIPE_ID],

  appliesTo: (spec: ProjectSpec) =>
    spec.api?.paradigm === 'rest' && spec.api.runtime === 'python-fastapi',

  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'paradigm', 'rest-python'), ctx, REST_PYTHON_RECIPE_ID),

  codemods: () => [
    {
      file: 'app/main.py',
      kind: 'insertAtMarker',
      args: {
        marker: 'plugins',
        lines: ['from app.lib.openapi import install_openapi', '', 'install_openapi(app)'],
        /*
         * Negated, like every Python contribution to this region — Starlette applies middleware in
         * the reverse of the order it is added (see api-middleware-python.ts). This one registers
         * no middleware at all, so its position is cosmetic; negating it anyway keeps the region
         * in one consistent order rather than leaving one entry sorted against the grain.
         */
        priority: -MIDDLEWARE_PRIORITY.openapi,
        recipeId: REST_PYTHON_RECIPE_ID,
      },
    },
  ],

  readme: () => ({
    order: README_ORDER.backend,
    heading: 'API Documentation',
    body: [
      '| Path | What |',
      '| --- | --- |',
      '| `/docs` | Interactive API reference (Swagger UI) |',
      '| `/openapi.json` | OpenAPI 3.1 document |',
      '',
      'The document is generated from route signatures and Pydantic models, never hand-written.',
      'Annotate a route and it appears in the docs automatically, with request validation and the',
      'response schema derived from the same definition:',
      '',
      '```python',
      'from app.schemas.common import COMMON_RESPONSES, Page, PaginationQuery',
      '',
      '@router.get("/widgets", response_model=Page[Widget], responses=COMMON_RESPONSES)',
      'async def list_widgets(query: Annotated[PaginationQuery, Query()]) -> Page[Widget]: ...',
      '```',
      '',
      '`responses=COMMON_RESPONSES` is worth attaching. A generated client only handles the status',
      'codes the document declares, so an undocumented 429 becomes an unhandled exception in every',
      'consumer the first time the rate limiter fires.',
      '',
      '`/openapi.json` is a contract: the Service Catalog fetches the document from exactly that',
      'path, so changing it removes this service’s docs from the portal.',
    ].join('\n'),
  }),
};
