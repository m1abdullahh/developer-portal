/**
 * The five middleware recipes from PRD §3 Step 3.
 *
 * Each is independent and each injects into the priority-ordered `idp:plugins` region. The
 * order is declared once in MIDDLEWARE_PRIORITY and is identical across Node, Python and Go —
 * so a spec produces the same request-handling behaviour regardless of runtime, which is the
 * whole reason ordering lives in the engine rather than in each base template.
 *
 *   logging 10 → cors 20 → rateLimit 30 → validation 40 → auth 50 → openapi 60
 *
 * Every one of those positions is load-bearing:
 *   - logging first, so everything below it is traced
 *   - CORS before auth, or preflight OPTIONS (which carry no credentials) get a 401 the
 *     browser reports as an opaque CORS failure
 *   - rate limiting before auth, so unauthenticated floods are rejected before token work
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { MIDDLEWARE_PRIORITY } from '../codemod/markers.js';
import { NODE_TS_RECIPE_ID } from './api-node-ts.js';
import { REST_RECIPE_ID } from './api-rest.js';
import { API_PERMISSIONS_RECIPE_ID } from './policy-permissions.js';
import type { CodemodOp, Recipe } from '../types.js';

const isNode = (spec: ProjectSpec): boolean => spec.api?.runtime === 'node-ts';

/** Registers a plugin call in the marker region and imports the function it calls. */
function registerPlugin(
  recipeId: string,
  call: string,
  importFrom: string,
  named: string,
  priority: number,
): CodemodOp[] {
  return [
    {
      file: 'src/server.ts',
      kind: 'insertAtMarker',
      args: { marker: 'plugins', lines: [call], priority, recipeId },
    },
    {
      file: 'src/server.ts',
      kind: 'addImport',
      args: { module: importFrom, named: [named] },
    },
  ];
}

// ── logging ──────────────────────────────────────────────────────────────────

export const LOGGING_RECIPE_ID = 'api.middleware.logging';

export const loggingRecipe: Recipe = {
  id: LOGGING_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [NODE_TS_RECIPE_ID],
  appliesTo: (spec) => isNode(spec) && spec.api!.middleware.logging,
  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'middleware', 'logging'), ctx, LOGGING_RECIPE_ID),
  codemods: () =>
    registerPlugin(
      LOGGING_RECIPE_ID,
      'await registerRequestContext(app);',
      './plugins/request-context.js',
      'registerRequestContext',
      MIDDLEWARE_PRIORITY.logging,
    ),
  readme: () => ({
    order: README_ORDER.operations,
    heading: 'Logging',
    body: [
      'Structured JSON logs via Pino, with `authorization`, `cookie`, `password`, `token` and',
      '`secret` redacted — without that, logging a request writes a live bearer token into log',
      'storage, where it is retained and indexed.',
      '',
      'Every request carries an `X-Request-Id`, propagated from the inbound header when present',
      'so one id follows a request across services rather than each hop inventing its own.',
    ].join('\n'),
  }),
};

// ── cors ─────────────────────────────────────────────────────────────────────

export const CORS_RECIPE_ID = 'api.middleware.cors';

export const corsRecipe: Recipe = {
  id: CORS_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [NODE_TS_RECIPE_ID],
  appliesTo: (spec) => isNode(spec) && spec.api!.middleware.cors,
  files: (ctx) => loadTemplateDir(templatePath('api', 'middleware', 'cors'), ctx, CORS_RECIPE_ID),
  packageJson: () => ({ dependencies: dependencyMap(['@fastify/cors']) }),
  env: () => [
    {
      key: 'CORS_ORIGINS',
      example: 'http://localhost:3000',
      required: true,
      description: 'Comma-separated list of allowed origins. Never a wildcard with credentials.',
    },
  ],
  codemods: () => [
    ...registerPlugin(
      CORS_RECIPE_ID,
      'await registerCors(app);',
      './plugins/cors.js',
      'registerCors',
      MIDDLEWARE_PRIORITY.cors,
    ),
    // Declaring the variable in env() only writes it to .env.example. Code that reads
    // `env.CORS_ORIGINS` also needs the field in the Zod schema, or it does not exist at
    // runtime and TypeScript reports a missing property with no hint as to why.
    {
      file: 'src/config/env.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'env-schema',
        lines: ["CORS_ORIGINS: z.string().default('http://localhost:3000'),"],
        priority: MIDDLEWARE_PRIORITY.cors,
        recipeId: CORS_RECIPE_ID,
      },
    },
  ],
  readme: () => ({
    order: README_ORDER.backend,
    heading: 'CORS',
    body: [
      'Allowed origins come from `CORS_ORIGINS` (comma-separated), never a wildcard.',
      '',
      '`origin: "*"` with `credentials: true` is rejected by every browser, so an API configured',
      'that way fails every authenticated cross-origin request while appearing correct. The',
      'generator fails the build on that combination.',
    ].join('\n'),
  }),
};

// ── rate limiting ────────────────────────────────────────────────────────────

export const RATE_LIMIT_RECIPE_ID = 'api.middleware.rate-limit';

export const rateLimitRecipe: Recipe = {
  id: RATE_LIMIT_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [NODE_TS_RECIPE_ID],
  appliesTo: (spec) => isNode(spec) && spec.api!.middleware.rateLimit,
  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'middleware', 'rate-limit'), ctx, RATE_LIMIT_RECIPE_ID),
  packageJson: () => ({ dependencies: dependencyMap(['@fastify/rate-limit']) }),
  env: () => [
    { key: 'RATE_LIMIT_MAX', example: '100', required: false, description: 'Requests per window' },
    {
      key: 'RATE_LIMIT_WINDOW',
      example: '1 minute',
      required: false,
      description: 'Rate limit window, e.g. "1 minute"',
    },
  ],
  codemods: () => [
    ...registerPlugin(
      RATE_LIMIT_RECIPE_ID,
      'await registerRateLimit(app);',
      './plugins/rate-limit.js',
      'registerRateLimit',
      MIDDLEWARE_PRIORITY.rateLimit,
    ),
    {
      file: 'src/config/env.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'env-schema',
        lines: [
          'RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),',
          "RATE_LIMIT_WINDOW: z.string().default('1 minute'),",
        ],
        priority: MIDDLEWARE_PRIORITY.rateLimit,
        recipeId: RATE_LIMIT_RECIPE_ID,
      },
    },
  ],
  readme: (ctx) => ({
    order: README_ORDER.backend,
    heading: 'Rate Limiting',
    body: ctx.spec.api?.cache
      ? [
          'Redis-backed, so the limit is shared across replicas.',
          '',
          'That matters as soon as the autoscaler adds a pod: with per-instance counters a limit',
          'of 100 becomes 100 × replicas, and the effective limit changes whenever it scales.',
          '',
          '`/health` and `/ready` are exempt — throttling probes makes Kubernetes restart the pod.',
        ].join('\n')
      : [
          '**In-memory counters — the limit is per instance, not global.**',
          '',
          'With the HPA enabled, a limit of 100 becomes 100 × replica-count and changes silently',
          'whenever the cluster scales. Enable the Redis cache layer in the wizard for global',
          'limits.',
          '',
          '`/health` and `/ready` are exempt — throttling probes makes Kubernetes restart the pod.',
        ].join('\n'),
  }),
};

// ── validation ───────────────────────────────────────────────────────────────

export const VALIDATION_RECIPE_ID = 'api.middleware.validation';

export const validationRecipe: Recipe = {
  id: VALIDATION_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  // Needs the Zod type provider that the REST recipe installs.
  requires: [NODE_TS_RECIPE_ID, REST_RECIPE_ID],
  appliesTo: (spec) =>
    isNode(spec) && spec.api!.middleware.validation && spec.api!.paradigm === 'rest',
  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'middleware', 'validation'), ctx, VALIDATION_RECIPE_ID),
  codemods: () => [
    // Injected as a branch of the ONE error handler, not a second setErrorHandler — Fastify
    // permits only one per scope and the later registration silently discards the earlier.
    {
      file: 'src/server.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'error-cases',
        lines: ['if (tryHandleValidationError(error, reply)) return;'],
        priority: MIDDLEWARE_PRIORITY.validation,
        recipeId: VALIDATION_RECIPE_ID,
      },
    },
    {
      file: 'src/server.ts',
      kind: 'addImport',
      args: { module: './lib/validation-error.js', named: ['tryHandleValidationError'] },
    },
  ],
  readme: () => ({
    order: README_ORDER.backend,
    heading: 'Request Validation',
    body: [
      'Zod schemas validate every request and produce the OpenAPI document from the same',
      'definition.',
      '',
      'Failures return **422** with per-field detail rather than Fastify’s default flattened',
      'string, so a client can map errors back to form fields without parsing prose:',
      '',
      '```json',
      '{ "error": "Unprocessable Entity", "statusCode": 422,',
      '  "details": [{ "field": "email", "message": "Invalid email" }] }',
      '```',
      '',
      '422 rather than 400 distinguishes well-formed-but-invalid from malformed.',
    ].join('\n'),
  }),
};

// ── auth ─────────────────────────────────────────────────────────────────────

export const AUTH_JWT_RECIPE_ID = 'api.middleware.auth-jwt';

export const authJwtRecipe: Recipe = {
  id: AUTH_JWT_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  // The policy this plugin enforces used to be one of its own template files, which put it out of
  // reach of every recipe that does not enable JWT. It is a shared definition now — see
  // policy-permissions.ts for what that mis-scoping cost.
  requires: [NODE_TS_RECIPE_ID, API_PERMISSIONS_RECIPE_ID],
  appliesTo: (spec) => isNode(spec) && spec.api!.middleware.auth === 'jwt',
  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'middleware', 'auth-jwt'), ctx, AUTH_JWT_RECIPE_ID),
  packageJson: () => ({ dependencies: dependencyMap(['@fastify/jwt']) }),
  env: () => [
    {
      key: 'JWT_SECRET',
      example: '',
      required: true,
      description: 'Signing key for access tokens. Use at least 32 random bytes.',
      secret: true,
    },
    {
      key: 'JWT_EXPIRES_IN',
      example: '15m',
      required: false,
      description: 'Access token lifetime',
    },
  ],
  codemods: () => [
    ...registerPlugin(
      AUTH_JWT_RECIPE_ID,
      'await registerAuth(app);',
      './plugins/auth.js',
      'registerAuth',
      MIDDLEWARE_PRIORITY.auth,
    ),
    {
      file: 'src/config/env.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'env-schema',
        lines: [
          "JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),",
          "JWT_EXPIRES_IN: z.string().default('15m'),",
        ],
        priority: MIDDLEWARE_PRIORITY.auth,
        recipeId: AUTH_JWT_RECIPE_ID,
      },
    },
  ],
  readme: () => ({
    order: README_ORDER.backend,
    heading: 'Authentication',
    body: [
      'JWT bearer tokens, exposed as route guards rather than a global hook:',
      '',
      '```ts',
      "app.get('/private', { onRequest: [app.requireAuth] }, handler);",
      "app.delete('/thing/:id', { onRequest: [app.requirePermission('delete')] }, handler);",
      '```',
      '',
      'Guards rather than a global hook because a global `onRequest` would also intercept',
      '`/health`, `/ready` and `/docs` — the probes would return 401 and Kubernetes would',
      'restart a perfectly healthy pod.',
      '',
      'Roles and permissions live in `src/lib/permissions.ts`, the single definition shared with',
      'the UI’s route guards so the two enforcement points cannot drift.',
      '',
      'Failed verification returns a generic 401. Distinguishing "expired" from "malformed" from',
      '"bad signature" would hand an attacker a free oracle.',
    ].join('\n'),
  }),
};

export const MIDDLEWARE_RECIPES: readonly Recipe[] = [
  loggingRecipe,
  corsRecipe,
  rateLimitRecipe,
  validationRecipe,
  authJwtRecipe,
];
