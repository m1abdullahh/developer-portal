/**
 * The five middleware recipes from PRD §3 Step 3, for Gin.
 *
 * Same five options, same environment variable names, same error envelope and the same effective
 * request order as the other two runtimes. Gin's `Use` runs middleware in the order it is added —
 * first added, first to see a request — so unlike Starlette there is no inversion: contributions
 * carry their MIDDLEWARE_PRIORITY as-is and the file reads in execution order.
 *
 * Each contribution that needs a package inserts its own import into the file's `idp:imports`
 * region alongside the code that uses it (see api-go-gin.ts for why). Auth and validation
 * register nothing in the plugins region at all: auth is per-route guards whose boot-time check
 * (JWT_SECRET length) lives in config.Load, and validation is a helper future routes call.
 */

import { templatePath } from '@idp/templates';
import { goRequirements, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { MIDDLEWARE_PRIORITY } from '../codemod/markers.js';
import { MIDDLEWARE_ENV } from '../runtime-contract.js';
import { GO_GIN_RECIPE_ID } from './api-go-gin.js';
import { GO_PERMISSIONS_RECIPE_ID } from './policy-permissions.js';
import type { CodemodOp, EnvVar, Recipe } from '../types.js';

const isGo = (spec: ProjectSpec): boolean => spec.api?.runtime === 'go-gin';

const SERVER = 'internal/server/server.go';
const CONFIG = 'internal/config/config.go';

/** The generated project's module path — Go imports are absolute, so every recipe needs it. */
const modulePath = (spec: ProjectSpec): string =>
  `github.com/${spec.meta.repo.org}/${spec.meta.slug}`;

/** Inserts a `r.Use(...)` call into the plugins region and its import into the imports region. */
function useCall(recipeId: string, spec: ProjectSpec, call: string, priority: number): CodemodOp[] {
  return [
    {
      file: SERVER,
      kind: 'insertAtMarker',
      args: { marker: 'plugins', lines: [call], priority, recipeId },
    },
    {
      file: SERVER,
      kind: 'insertAtMarker',
      args: {
        marker: 'imports',
        lines: [`"${modulePath(spec)}/internal/middleware"`],
        priority,
        recipeId,
      },
    },
  ];
}

/** Declares config fields and their parse lines — the two halves of the same variables. */
function configVar(
  recipeId: string,
  fields: string[],
  parse: string[],
  priority: number,
): CodemodOp[] {
  return [
    {
      file: CONFIG,
      kind: 'insertAtMarker',
      args: { marker: 'config-fields', lines: fields, priority, recipeId },
    },
    {
      file: CONFIG,
      kind: 'insertAtMarker',
      args: { marker: 'env-schema', lines: parse, priority, recipeId },
    },
  ];
}

/** Adds pinned module lines to the go.mod dependencies region. */
function goModDeps(recipeId: string, requirements: string[], priority: number): CodemodOp {
  return {
    file: 'go.mod',
    kind: 'insertAtMarker',
    args: { marker: 'dependencies', lines: requirements, priority, recipeId },
  };
}

// ── logging ──────────────────────────────────────────────────────────────────

export const GO_LOGGING_RECIPE_ID = 'api.middleware.logging-go';

export const goLoggingRecipe: Recipe = {
  id: GO_LOGGING_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [GO_GIN_RECIPE_ID],
  appliesTo: (spec) => isGo(spec) && spec.api!.middleware.logging,
  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'middleware', 'go', 'logging'), ctx, GO_LOGGING_RECIPE_ID),
  codemods: (ctx) =>
    useCall(
      GO_LOGGING_RECIPE_ID,
      ctx.spec,
      'r.Use(middleware.RequestContext())',
      MIDDLEWARE_PRIORITY.logging,
    ),
  readme: () => ({
    order: README_ORDER.operations,
    heading: 'Logging',
    body: [
      'Structured JSON logs via slog, one line per request with method, path, status, duration,',
      'client IP and request id — enumerated fields, never a header dump, which is what makes',
      'credential redaction unnecessary by construction.',
      '',
      'Every request carries an `X-Request-Id`, propagated from the inbound header when present so',
      'one id follows a request across services rather than each hop inventing its own.',
    ].join('\n'),
  }),
};

// ── cors ─────────────────────────────────────────────────────────────────────

export const GO_CORS_RECIPE_ID = 'api.middleware.cors-go';

export const goCorsRecipe: Recipe = {
  id: GO_CORS_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [GO_GIN_RECIPE_ID],
  appliesTo: (spec) => isGo(spec) && spec.api!.middleware.cors,
  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'middleware', 'go', 'cors'), ctx, GO_CORS_RECIPE_ID),
  env: () => MIDDLEWARE_ENV.cors as unknown as EnvVar[],
  codemods: (ctx) => [
    ...useCall(
      GO_CORS_RECIPE_ID,
      ctx.spec,
      'r.Use(middleware.CORS(cfg))',
      MIDDLEWARE_PRIORITY.cors,
    ),
    ...configVar(
      GO_CORS_RECIPE_ID,
      ['CORSOrigins string'],
      [
        'cfg.CORSOrigins = getString("CORS_ORIGINS", "http://localhost:3000")',
        // The boot-time check the CORS middleware relies on. origin:* with credentials is
        // rejected by every browser, so an API configured that way fails every authenticated
        // cross-origin request while appearing correct in every server-side test.
        'if strings.Contains(cfg.CORSOrigins, "*") {',
        '\treturn nil, fmt.Errorf("CORS_ORIGINS contains \'*\', which browsers reject when credentials are allowed — list the origins explicitly")',
        '}',
      ],
      MIDDLEWARE_PRIORITY.cors,
    ),
    {
      file: CONFIG,
      kind: 'insertAtMarker',
      args: {
        marker: 'imports',
        lines: ['"strings"'],
        priority: MIDDLEWARE_PRIORITY.cors,
        recipeId: GO_CORS_RECIPE_ID,
      },
    },
  ],
  readme: () => ({
    order: README_ORDER.backend,
    heading: 'CORS',
    body: [
      'Allowed origins come from `CORS_ORIGINS` (comma-separated), never a wildcard.',
      '',
      '`*` with credentials is rejected by every browser, so an API configured that way fails',
      'every authenticated cross-origin request while appearing correct in every server-side',
      'test. `config.Load` refuses to boot on that combination.',
    ].join('\n'),
  }),
};

// ── rate limiting ────────────────────────────────────────────────────────────

export const GO_RATE_LIMIT_RECIPE_ID = 'api.middleware.rate-limit-go';

export const goRateLimitRecipe: Recipe = {
  id: GO_RATE_LIMIT_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [GO_GIN_RECIPE_ID],
  appliesTo: (spec) => isGo(spec) && spec.api!.middleware.rateLimit,
  files: (ctx) =>
    loadTemplateDir(
      templatePath('api', 'middleware', 'go', 'rate-limit'),
      ctx,
      GO_RATE_LIMIT_RECIPE_ID,
    ),
  env: () => MIDDLEWARE_ENV.rateLimit as unknown as EnvVar[],
  codemods: (ctx) => [
    ...useCall(
      GO_RATE_LIMIT_RECIPE_ID,
      ctx.spec,
      'r.Use(middleware.RateLimit(cfg))',
      MIDDLEWARE_PRIORITY.rateLimit,
    ),
    ...configVar(
      GO_RATE_LIMIT_RECIPE_ID,
      // Pre-aligned the way gofmt aligns a field run: names padded so the types share a column.
      // Verified against gofmt -d rather than guessed — an unaligned pair here makes every
      // generated project fail its own CI formatting check.
      ['RateLimitMax    int', 'RateLimitWindow string'],
      [
        'cfg.RateLimitMax = getInt("RATE_LIMIT_MAX", 100)',
        'cfg.RateLimitWindow = getString("RATE_LIMIT_WINDOW", "1 minute")',
      ],
      MIDDLEWARE_PRIORITY.rateLimit,
    ),
  ],
  readme: (ctx) => ({
    order: README_ORDER.backend,
    heading: 'Rate Limiting',
    body: ctx.spec.api?.cache
      ? [
          'Redis-backed, so the limit is shared across replicas.',
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

export const GO_VALIDATION_RECIPE_ID = 'api.middleware.validation-go';

export const goValidationRecipe: Recipe = {
  id: GO_VALIDATION_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [GO_GIN_RECIPE_ID],
  appliesTo: (spec) => isGo(spec) && spec.api!.middleware.validation,
  files: (ctx) =>
    loadTemplateDir(
      templatePath('api', 'middleware', 'go', 'validation'),
      ctx,
      GO_VALIDATION_RECIPE_ID,
    ),
  codemods: () => [
    // validator is already in every gin project transitively; importing it directly makes it a
    // direct requirement, which go.mod must state.
    goModDeps(
      GO_VALIDATION_RECIPE_ID,
      goRequirements(['github.com/go-playground/validator/v10']),
      MIDDLEWARE_PRIORITY.validation,
    ),
  ],
  readme: () => ({
    order: README_ORDER.backend,
    heading: 'Request Validation',
    body: [
      'Struct tags validate every bound request — gin runs go-playground/validator natively.',
      '`middleware.Bind` wraps the bind so failures return the same **422** envelope every runtime',
      'in this portal uses, with per-field detail a form can map back directly:',
      '',
      '```go',
      'var req CreateWidgetRequest',
      'if !middleware.Bind(c, &req) {',
      '\treturn',
      '}',
      '```',
      '',
      '422 rather than 400 distinguishes well-formed-but-invalid from malformed.',
    ].join('\n'),
  }),
};

// ── auth ─────────────────────────────────────────────────────────────────────

export const GO_AUTH_JWT_RECIPE_ID = 'api.middleware.auth-jwt-go';

export const goAuthJwtRecipe: Recipe = {
  id: GO_AUTH_JWT_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [GO_GIN_RECIPE_ID, GO_PERMISSIONS_RECIPE_ID],
  appliesTo: (spec) => isGo(spec) && spec.api!.middleware.auth === 'jwt',
  files: (ctx) =>
    loadTemplateDir(
      templatePath('api', 'middleware', 'go', 'auth-jwt'),
      ctx,
      GO_AUTH_JWT_RECIPE_ID,
    ),
  env: () => MIDDLEWARE_ENV.auth as unknown as EnvVar[],
  codemods: () => [
    goModDeps(
      GO_AUTH_JWT_RECIPE_ID,
      goRequirements(['github.com/golang-jwt/jwt/v5']),
      MIDDLEWARE_PRIORITY.auth,
    ),
    ...configVar(
      GO_AUTH_JWT_RECIPE_ID,
      // Same gofmt pre-alignment as the rate-limit fields above.
      ['JWTSecret    string', 'JWTExpiresIn string'],
      [
        'cfg.JWTSecret = getString("JWT_SECRET", "")',
        // The boot-time check, in the same place every runtime puts it: an API that boots with a
        // four-character secret and rejects every token at runtime is far harder to diagnose
        // than one that refuses to start and says why.
        'if len(cfg.JWTSecret) < 32 {',
        '\treturn nil, fmt.Errorf("JWT_SECRET must be at least 32 characters")',
        '}',
        'cfg.JWTExpiresIn = getString("JWT_EXPIRES_IN", "15m")',
      ],
      MIDDLEWARE_PRIORITY.auth,
    ),
  ],
  readme: () => ({
    order: README_ORDER.backend,
    heading: 'Authentication',
    body: [
      'JWT bearer tokens, exposed as per-route guards rather than global middleware:',
      '',
      '```go',
      'r.GET("/private", middleware.RequireAuth(cfg), handler)',
      'r.DELETE("/thing/:id", middleware.RequirePermission(cfg, permissions.PermissionDelete), handler)',
      '```',
      '',
      'Guards rather than global middleware because a global check would also intercept `/health`,',
      '`/ready` and `/docs` — the probes would return 401 and Kubernetes would restart a perfectly',
      'healthy pod.',
      '',
      'Roles and permissions live in `internal/permissions`, the single definition shared with',
      'every other layer so the enforcement points cannot drift.',
      '',
      '`WithValidMethods` pins HS256 and never includes `none` — accepting the algorithm named in',
      'the token’s own header is the classic JWT forgery.',
      '',
      'Failed verification returns a generic 401. Distinguishing "expired" from "malformed" from',
      '"bad signature" would hand an attacker a free oracle.',
    ].join('\n'),
  }),
};

export const GO_MIDDLEWARE_RECIPES: readonly Recipe[] = [
  goLoggingRecipe,
  goCorsRecipe,
  goRateLimitRecipe,
  goValidationRecipe,
  goAuthJwtRecipe,
];
