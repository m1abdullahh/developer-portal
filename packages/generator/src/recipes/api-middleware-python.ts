/**
 * The five middleware recipes from PRD §3 Step 3, for FastAPI.
 *
 * Same five options, same environment variable names, same error envelope and the same effective
 * request-handling order as the Node runtime — a spec should produce a service that behaves the
 * same way regardless of which language it is written in. What differs is everything about how
 * that is achieved, which is why these are separate recipes rather than a branch inside the Node
 * ones.
 *
 * ── Starlette applies middleware in reverse, so these are inserted in reverse ─
 * `app.add_middleware(X)` inserts X at position 0 of the user middleware list, and the stack is
 * then built by wrapping from the end. The consequence: **the last one added is the outermost**,
 * i.e. the first to see an incoming request. Fastify's `register` is the opposite — first
 * registered, first to run.
 *
 * MIDDLEWARE_PRIORITY declares the order requests must be processed in, identically for every
 * runtime, and every one of those positions is load-bearing:
 *
 *   logging 10 → cors 20 → rateLimit 30 → validation 40 → auth 50
 *
 * To land that order under LIFO semantics, the calls have to appear in the file in *descending*
 * priority. So each contribution below negates its priority, and the generated `create_app` reads
 * rate-limit-first — with a comment in the template saying why. Emitting them in ascending order
 * would look right, read right, and put the logger innermost where it never sees a request the
 * rate limiter rejected.
 *
 * Two of the five register no middleware at all: validation installs an exception handler and auth
 * exposes route dependencies. Both are order-independent, and both still go through the region so
 * the file reads uniformly and so their startup-time checks run.
 */

import { templatePath } from '@idp/templates';
import { pythonRequirements, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { MIDDLEWARE_PRIORITY } from '../codemod/markers.js';
import { MIDDLEWARE_ENV } from '../runtime-contract.js';
import { PYTHON_FASTAPI_RECIPE_ID } from './api-python-fastapi.js';
import { PYTHON_PERMISSIONS_RECIPE_ID } from './policy-permissions.js';
import type { CodemodOp, EnvVar, Recipe } from '../types.js';

const isPython = (spec: ProjectSpec): boolean => spec.api?.runtime === 'python-fastapi';

/**
 * Registers an install call in the plugins region, carrying its own import.
 *
 * ── Why the import is function-local, and inside the region ──────────────────
 * The `addImport` codemod is ts-morph, which cannot parse a `.py` file at all — the same wall the
 * Vue port hit with `.vue`. The obvious alternative, a second marker region at the top of the
 * file, breaks on ruff's import sorting (rule `I`): contributions arrive in priority order and
 * isort wants them alphabetical, so a correct generation would fail its own lint step.
 *
 * Keeping the import with its call sidesteps both. Each block is separated from the next by a
 * statement, so no two imports form a sortable block, and a contribution is self-contained — one
 * recipe adds one unit, and reading the region tells you where each install came from.
 *
 * Module-level imports are not free of that constraint the way these are, and the cost here is a
 * dict lookup in `sys.modules` per call to `create_app`.
 *
 * The priority negation is the other half of this function's job — see the note at the top of the
 * file. Applied here, once, so no individual recipe can forget it.
 */
function installCall(
  recipeId: string,
  call: string,
  importFrom: string,
  named: string,
  priority: number,
): CodemodOp[] {
  return [
    {
      file: 'app/main.py',
      kind: 'insertAtMarker',
      args: {
        marker: 'plugins',
        lines: [`from ${importFrom} import ${named}`, '', call],
        priority: -priority,
        recipeId,
      },
    },
  ];
}

/** Declares a pydantic-settings field in the env-schema region. */
function envField(recipeId: string, lines: string[], priority: number): CodemodOp {
  return {
    file: 'app/config.py',
    kind: 'insertAtMarker',
    args: { marker: 'env-schema', lines, priority, recipeId },
  };
}

/** Adds PEP 508 requirement strings to the pyproject dependency region. */
function dependencies(recipeId: string, requirements: string[], priority: number): CodemodOp {
  return {
    file: 'pyproject.toml',
    kind: 'insertAtMarker',
    args: { marker: 'dependencies', lines: requirements.map((r) => `"${r}",`), priority, recipeId },
  };
}

// ── logging ──────────────────────────────────────────────────────────────────

export const PY_LOGGING_RECIPE_ID = 'api.middleware.logging-python';

export const pyLoggingRecipe: Recipe = {
  id: PY_LOGGING_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [PYTHON_FASTAPI_RECIPE_ID],
  appliesTo: (spec) => isPython(spec) && spec.api!.middleware.logging,
  files: (ctx) =>
    loadTemplateDir(
      templatePath('api', 'middleware', 'python', 'logging'),
      ctx,
      PY_LOGGING_RECIPE_ID,
    ),
  // No dependency. The JSON formatter is stdlib `logging` and the middleware is Starlette's own
  // base class — structlog would be a second logging library for output this already produces.
  codemods: () =>
    installCall(
      PY_LOGGING_RECIPE_ID,
      'install_request_context(app)',
      'app.middleware.request_context',
      'install_request_context',
      MIDDLEWARE_PRIORITY.logging,
    ),
  readme: () => ({
    order: README_ORDER.operations,
    heading: 'Logging',
    body: [
      'Structured JSON logs, one object per line, with `authorization`, `cookie`, `password`,',
      '`token`, `secret` and `api_key` redacted — without that, logging a request writes a live',
      'bearer token into log storage, where it is retained and indexed.',
      '',
      'Every request carries an `X-Request-Id`, propagated from the inbound header when present so',
      'one id follows a request across services rather than each hop inventing its own. The id is',
      'held in a `ContextVar`, so a log line emitted deep inside a handler carries it too.',
      '',
      'A `ContextVar` rather than a thread-local: under asyncio many requests share one thread, and',
      'a thread-local would leak one request’s id into another’s lines under concurrency.',
    ].join('\n'),
  }),
};

// ── cors ─────────────────────────────────────────────────────────────────────

export const PY_CORS_RECIPE_ID = 'api.middleware.cors-python';

export const pyCorsRecipe: Recipe = {
  id: PY_CORS_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [PYTHON_FASTAPI_RECIPE_ID],
  appliesTo: (spec) => isPython(spec) && spec.api!.middleware.cors,
  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'middleware', 'python', 'cors'), ctx, PY_CORS_RECIPE_ID),
  env: () => MIDDLEWARE_ENV.cors as unknown as EnvVar[],
  codemods: () => [
    ...installCall(
      PY_CORS_RECIPE_ID,
      'install_cors(app)',
      'app.middleware.cors',
      'install_cors',
      MIDDLEWARE_PRIORITY.cors,
    ),
    // Declaring the variable in env() only writes it to .env.example. Code reading
    // `settings.CORS_ORIGINS` also needs the field on the Settings model, or it does not exist at
    // runtime and pydantic raises an AttributeError with no hint as to why.
    envField(
      PY_CORS_RECIPE_ID,
      ['CORS_ORIGINS: str = "http://localhost:3000"'],
      MIDDLEWARE_PRIORITY.cors,
    ),
  ],
  readme: () => ({
    order: README_ORDER.backend,
    heading: 'CORS',
    body: [
      'Allowed origins come from `CORS_ORIGINS` (comma-separated), never a wildcard.',
      '',
      '`allow_origins=["*"]` with `allow_credentials=True` is rejected by every browser, so an API',
      'configured that way fails every authenticated cross-origin request while appearing correct',
      'in every server-side test. Starlette will not stop you — `install_cors` raises at startup.',
    ].join('\n'),
  }),
};

// ── rate limiting ────────────────────────────────────────────────────────────

export const PY_RATE_LIMIT_RECIPE_ID = 'api.middleware.rate-limit-python';

export const pyRateLimitRecipe: Recipe = {
  id: PY_RATE_LIMIT_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [PYTHON_FASTAPI_RECIPE_ID],
  appliesTo: (spec) => isPython(spec) && spec.api!.middleware.rateLimit,
  files: (ctx) =>
    loadTemplateDir(
      templatePath('api', 'middleware', 'python', 'rate-limit'),
      ctx,
      PY_RATE_LIMIT_RECIPE_ID,
    ),
  /*
   * Hand-written rather than slowapi, and the reason is the probe exemption.
   *
   * slowapi is decorator-per-route; applying a limit globally means its middleware, and exempting
   * a route from that means decorating the route — but `/health` and `/ready` belong to the
   * runtime recipe, which does not know whether a rate limiter exists. Rate-limiting the probes
   * makes Kubernetes fail the liveness check and restart a pod whose only fault was being probed
   * on schedule.
   *
   * The alternative was to make the runtime template import from a middleware that may not be
   * installed. Roughly fifty lines of fixed-window counting, with no 0.x dependency, was the
   * smaller cost.
   */
  codemods: () => [
    ...installCall(
      PY_RATE_LIMIT_RECIPE_ID,
      'install_rate_limit(app)',
      'app.middleware.rate_limit',
      'install_rate_limit',
      MIDDLEWARE_PRIORITY.rateLimit,
    ),
    envField(
      PY_RATE_LIMIT_RECIPE_ID,
      ['RATE_LIMIT_MAX: int = 100', 'RATE_LIMIT_WINDOW: str = "1 minute"'],
      MIDDLEWARE_PRIORITY.rateLimit,
    ),
  ],
  env: () => MIDDLEWARE_ENV.rateLimit as unknown as EnvVar[],
  readme: (ctx) => ({
    order: README_ORDER.backend,
    heading: 'Rate Limiting',
    body: ctx.spec.api?.cache
      ? [
          'Redis-backed, so the limit is shared across replicas.',
          '',
          'That matters as soon as the autoscaler adds a pod: with per-instance counters a limit of',
          '100 becomes 100 × replicas, and the effective limit changes whenever it scales.',
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
          '',
          'Fixed window rather than sliding, matching the Node runtime so the two behave identically',
          'at a boundary. The whole counter map is cleared at each window rollover, which is also',
          'what bounds memory: a dict keyed by client address with per-key expiry is a denial-of-',
          'service vector rather than a rate limiter.',
        ].join('\n'),
  }),
};

// ── validation ───────────────────────────────────────────────────────────────

export const PY_VALIDATION_RECIPE_ID = 'api.middleware.validation-python';

export const pyValidationRecipe: Recipe = {
  id: PY_VALIDATION_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [PYTHON_FASTAPI_RECIPE_ID],
  appliesTo: (spec) => isPython(spec) && spec.api!.middleware.validation,
  files: (ctx) =>
    loadTemplateDir(
      templatePath('api', 'middleware', 'python', 'validation'),
      ctx,
      PY_VALIDATION_RECIPE_ID,
    ),
  /*
   * No REST dependency, unlike the Node recipe.
   *
   * That one requires the REST recipe because Fastify needs a Zod type provider installed before
   * anything validates. FastAPI validates through Pydantic natively, in every paradigm — so this
   * recipe is not adding validation, it is replacing the *shape of the error* with the envelope
   * every runtime in this portal returns.
   */
  codemods: () =>
    installCall(
      PY_VALIDATION_RECIPE_ID,
      'install_validation_errors(app)',
      'app.lib.validation_error',
      'install_validation_errors',
      MIDDLEWARE_PRIORITY.validation,
    ),
  readme: () => ({
    order: README_ORDER.backend,
    heading: 'Request Validation',
    body: [
      'Pydantic models validate every request and produce the OpenAPI document from the same',
      'definition.',
      '',
      'Failures return **422** with per-field detail rather than FastAPI’s default `detail` array,',
      'so a client can map errors back to form fields without knowing the framework’s convention:',
      '',
      '```json',
      '{ "error": "Unprocessable Entity", "statusCode": 422,',
      '  "details": [{ "field": "email", "message": "value is not a valid email address" }] }',
      '```',
      '',
      'The default body nests a `loc` array whose first element names the request part — `body`,',
      '`query`, `path` — so `email` arrives as `["body", "email"]`. That element is dropped here,',
      'making `field` the path the caller actually sent.',
      '',
      '422 rather than 400 distinguishes well-formed-but-invalid from malformed.',
    ].join('\n'),
  }),
};

// ── auth ─────────────────────────────────────────────────────────────────────

export const PY_AUTH_JWT_RECIPE_ID = 'api.middleware.auth-jwt-python';

export const pyAuthJwtRecipe: Recipe = {
  id: PY_AUTH_JWT_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [PYTHON_FASTAPI_RECIPE_ID, PYTHON_PERMISSIONS_RECIPE_ID],
  appliesTo: (spec) => isPython(spec) && spec.api!.middleware.auth === 'jwt',
  files: (ctx) =>
    loadTemplateDir(
      templatePath('api', 'middleware', 'python', 'auth-jwt'),
      ctx,
      PY_AUTH_JWT_RECIPE_ID,
    ),
  env: () => MIDDLEWARE_ENV.auth as unknown as EnvVar[],
  codemods: () => [
    ...installCall(
      PY_AUTH_JWT_RECIPE_ID,
      'install_auth(app)',
      'app.middleware.auth',
      'install_auth',
      MIDDLEWARE_PRIORITY.auth,
    ),
    envField(
      PY_AUTH_JWT_RECIPE_ID,
      ['JWT_SECRET: str', 'JWT_EXPIRES_IN: str = "15m"'],
      MIDDLEWARE_PRIORITY.auth,
    ),
    dependencies(PY_AUTH_JWT_RECIPE_ID, pythonRequirements(['PyJWT']), MIDDLEWARE_PRIORITY.auth),
  ],
  readme: () => ({
    order: README_ORDER.backend,
    heading: 'Authentication',
    body: [
      'JWT bearer tokens, exposed as route dependencies rather than global middleware:',
      '',
      '```python',
      '@router.get("/private")',
      'async def private(user: AuthenticatedUser = Depends(current_user)): ...',
      '',
      '',
      '@router.delete("/thing/{id}", dependencies=[Depends(require_permission("delete"))])',
      'async def remove(id: str): ...',
      '```',
      '',
      'Dependencies rather than middleware because global authentication would also intercept',
      '`/health`, `/ready` and `/docs` — the probes would return 401 and Kubernetes would restart a',
      'perfectly healthy pod.',
      '',
      'Roles and permissions live in `app/lib/permissions.py`, the single definition shared with',
      'the UI’s route guards so the two enforcement points cannot drift.',
      '',
      '`algorithms=["HS256"]` is passed explicitly and never includes `none`. Accepting the',
      'algorithm named in the token’s own header is the classic JWT forgery.',
      '',
      'Failed verification returns a generic 401. Distinguishing "expired" from "malformed" from',
      '"bad signature" would hand an attacker a free oracle.',
    ].join('\n'),
  }),
};

export const PYTHON_MIDDLEWARE_RECIPES: readonly Recipe[] = [
  pyLoggingRecipe,
  pyCorsRecipe,
  pyRateLimitRecipe,
  pyValidationRecipe,
  pyAuthJwtRecipe,
];
