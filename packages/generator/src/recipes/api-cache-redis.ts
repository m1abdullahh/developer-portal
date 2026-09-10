/**
 * The Redis cache layer (`api.cache`), on all three runtimes.
 *
 * Until this recipe existed the wizard's toggle read "Adds a cache client and a docker-compose
 * service" and added neither: it changed one comment in the rate limiter and made the generated
 * README claim the limiter was Redis-backed. The recipe makes each of those true.
 *
 * Each runtime gets the same three things. A client singleton that connects lazily and fails fast,
 * so a service whose Redis is briefly unavailable still boots and serves `/health` while `/ready`
 * reports the dependency. A cache-aside helper with stampede protection — one load per key per
 * process however many requests miss at once, which is the difference between an expiry and a
 * traffic spike at the source. And a `redis` service in the local compose file.
 *
 * When rate limiting is also on, the limiter's counters move to Redis and the limit becomes global
 * across replicas. In every runtime that limiter fails open: with Redis unreachable requests are
 * served unlimited and the failure is logged, because a limiter that turns a cache outage into a
 * total outage has the wrong failure mode.
 *
 * ── The compose file ─────────────────────────────────────────────────────────
 * `docker-compose.yml` is owned by whichever ORM recipe applies, and two recipes owning one file is
 * a hard error by design (doc 05 §3). So the ORM's template declares a marker region and this
 * recipe inserts its service there — and when there is no database, no compose file exists, so
 * this recipe emits one of its own. Both paths render the same service text from one definition.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, goRequirements, pythonRequirements, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { NODE_TS_RECIPE_ID } from './api-node-ts.js';
import { PYTHON_FASTAPI_RECIPE_ID } from './api-python-fastapi.js';
import { GO_GIN_RECIPE_ID } from './api-go-gin.js';
import { RATE_LIMIT_RECIPE_ID } from './api-middleware.js';
import { PY_RATE_LIMIT_RECIPE_ID } from './api-middleware-python.js';
import { GO_RATE_LIMIT_RECIPE_ID } from './api-middleware-go.js';
import type { CodemodOp, EnvVar, Recipe } from '../types.js';

export const REDIS_CACHE_RECIPE_ID = 'api.cache.redis';
export const REDIS_CACHE_PYTHON_RECIPE_ID = 'api.cache.redis-python';
export const REDIS_CACHE_GO_RECIPE_ID = 'api.cache.redis-go';

const cacheOn = (spec: ProjectSpec): boolean => spec.api?.cache === true;
const hasDatabase = (spec: ProjectSpec): boolean => spec.api?.database !== 'none';

/**
 * The compose service, as lines relative to the `services:` block. One definition for both the
 * marker insertion and the standalone compose file.
 */
export const REDIS_SERVICE_LINES: readonly string[] = [
  'redis:',
  '  image: redis:7-alpine',
  '  restart: unless-stopped',
  '  ports:',
  "    - '6379:6379'",
  '  # No volume: it is a cache. Anything that must survive a restart belongs in the database.',
  '  healthcheck:',
  "    test: ['CMD', 'redis-cli', 'ping']",
  '    interval: 5s',
  '    timeout: 3s',
  '    retries: 5',
];

/** Inserts the service into the ORM recipe's compose file; a standalone file is emitted otherwise. */
function composeCodemod(spec: ProjectSpec, recipeId: string): CodemodOp[] {
  if (!hasDatabase(spec)) return [];
  return [
    {
      file: 'docker-compose.yml',
      kind: 'insertAtMarker',
      args: {
        marker: 'compose-services',
        lines: [...REDIS_SERVICE_LINES],
        priority: 20,
        recipeId,
      },
    },
  ];
}

/** The standalone compose file, for projects with no database and therefore no ORM compose file. */
async function composeFile(ctx: Parameters<NonNullable<Recipe['files']>>[0], recipeId: string) {
  if (hasDatabase(ctx.spec)) return [];
  return loadTemplateDir(templatePath('api', 'cache', 'compose'), ctx, recipeId, {
    redisService: REDIS_SERVICE_LINES.map((line) => `  ${line}`).join('\n'),
  });
}

const envVars: EnvVar[] = [
  {
    key: 'REDIS_URL',
    // A real value, not a blank: the local service has no password, so nothing is disclosed, and a
    // developer who copies .env.example gets a working cache. Production URLs carry credentials
    // and are set from the secret store — see SECRETS.md.
    example: 'redis://localhost:6379',
    required: true,
    description:
      'Redis connection URL. The local compose service has no password; production URLs do.',
  },
];

function cacheReadme(runtime: 'node' | 'python' | 'go', spec: ProjectSpec) {
  const helper = {
    node: '`cached(key, ttlSeconds, load)` in `src/lib/cache.ts`',
    python: '`cached(key, ttl_seconds, load)` in `app/lib/cache.py`',
    go: '`cache.Cached(ctx, key, ttl, load)` in `internal/cache/redis.go`',
  }[runtime];
  const invalidate = {
    node: '`invalidate(...keys)`',
    python: '`invalidate(*keys)`',
    go: '`cache.Invalidate(ctx, keys...)`',
  }[runtime];

  return {
    order: README_ORDER.database,
    heading: 'Cache (Redis)',
    body: [
      '```bash',
      'docker compose up -d redis      # start the local cache',
      '```',
      '',
      `${helper} is cache-aside with stampede protection: a hit returns the stored value, a miss loads`,
      'from the source, stores it with the TTL and returns it — and concurrent misses for one key in',
      'one process wait for a single load rather than each hitting the source. Drop entries with',
      `${invalidate} when the source changes; a cache that is never invalidated is a stale copy with a`,
      'timer.',
      '',
      'Every operation fails open. A Redis outage costs cache hits, not requests: reads fall through',
      'to the source, writes are logged and skipped, and `/ready` reports the dependency so the pod',
      'leaves the Service until Redis returns. `/health` deliberately ignores it.',
      ...(spec.api?.middleware.rateLimit
        ? [
            '',
            'The rate limiter keeps its counters here too, so the limit is global across replicas',
            'rather than per pod.',
          ]
        : []),
      '',
      '`REDIS_URL` has no password locally. In production it does — set it from the secret store, and',
      'never write one into `.env.example`.',
    ].join('\n'),
  };
}

// ── Node ────────────────────────────────────────────────────────────────────

export const redisCacheRecipe: Recipe = {
  id: REDIS_CACHE_RECIPE_ID,
  // 'integration': it edits the rate limiter and the compose file, both emitted by feature recipes.
  phase: 'integration',
  layer: 'api',
  requires: (spec: ProjectSpec) => [
    NODE_TS_RECIPE_ID,
    ...(spec.api?.middleware.rateLimit ? [RATE_LIMIT_RECIPE_ID] : []),
  ],

  appliesTo: (spec: ProjectSpec) => cacheOn(spec) && spec.api?.runtime === 'node-ts',

  files: async (ctx) => [
    ...(await loadTemplateDir(templatePath('api', 'cache', 'redis'), ctx, REDIS_CACHE_RECIPE_ID)),
    ...(await composeFile(ctx, REDIS_CACHE_RECIPE_ID)),
  ],

  packageJson: () => ({ dependencies: dependencyMap(['ioredis']) }),

  env: () => envVars,

  codemods: (ctx): CodemodOp[] => [
    {
      file: 'src/config/env.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'env-schema',
        lines: ["REDIS_URL: z.string().url('REDIS_URL must be a redis:// URL'),"],
        priority: 20,
        recipeId: REDIS_CACHE_RECIPE_ID,
      },
    },
    // Readiness reflects the cache; liveness deliberately does not (doc 03 §5).
    {
      file: 'src/routes/health.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'readiness-checks',
        lines: ["checks['redis'] = (await checkRedis()) ? 'ok' : 'error';"],
        priority: 20,
        recipeId: REDIS_CACHE_RECIPE_ID,
      },
    },
    {
      file: 'src/routes/health.ts',
      kind: 'addImport',
      args: { module: '../lib/redis.js', named: ['checkRedis'] },
    },
    ...(ctx.spec.api?.middleware.rateLimit
      ? ([
          {
            file: 'src/plugins/rate-limit.ts',
            kind: 'insertAtMarker',
            args: {
              marker: 'rate-limit-store',
              lines: [
                '// Shared counters: the limit is global across replicas. skipOnError fails open when',
                '// Redis is unreachable — served unlimited and logged, never a 500 for every request.',
                'redis,',
                'skipOnError: true,',
              ],
              priority: 10,
              recipeId: REDIS_CACHE_RECIPE_ID,
            },
          },
          {
            file: 'src/plugins/rate-limit.ts',
            kind: 'addImport',
            args: { module: '../lib/redis.js', named: ['redis'] },
          },
        ] satisfies CodemodOp[])
      : []),
    ...composeCodemod(ctx.spec, REDIS_CACHE_RECIPE_ID),
  ],

  readme: (ctx) => cacheReadme('node', ctx.spec),

  postInstall: () => ['docker compose up -d redis'],
};

// ── Python ──────────────────────────────────────────────────────────────────

export const redisCachePythonRecipe: Recipe = {
  id: REDIS_CACHE_PYTHON_RECIPE_ID,
  phase: 'integration',
  layer: 'api',
  requires: (spec: ProjectSpec) => [
    PYTHON_FASTAPI_RECIPE_ID,
    ...(spec.api?.middleware.rateLimit ? [PY_RATE_LIMIT_RECIPE_ID] : []),
  ],

  appliesTo: (spec: ProjectSpec) => cacheOn(spec) && spec.api?.runtime === 'python-fastapi',

  files: async (ctx) => [
    ...(await loadTemplateDir(
      templatePath('api', 'cache', 'redis-python'),
      ctx,
      REDIS_CACHE_PYTHON_RECIPE_ID,
    )),
    ...(await composeFile(ctx, REDIS_CACHE_PYTHON_RECIPE_ID)),
  ],

  env: () => envVars,

  codemods: (ctx): CodemodOp[] => [
    {
      file: 'pyproject.toml',
      kind: 'insertAtMarker',
      args: {
        marker: 'dependencies',
        lines: pythonRequirements(['redis']).map((r) => `"${r}",`),
        priority: 40,
        recipeId: REDIS_CACHE_PYTHON_RECIPE_ID,
      },
    },
    {
      file: 'app/config.py',
      kind: 'insertAtMarker',
      args: {
        marker: 'env-schema',
        lines: ['REDIS_URL: str'],
        priority: 20,
        recipeId: REDIS_CACHE_PYTHON_RECIPE_ID,
      },
    },
    {
      file: 'app/routes/health.py',
      kind: 'insertAtMarker',
      args: {
        marker: 'readiness-checks',
        lines: [
          'from app.lib.redis import check_redis',
          '',
          'checks["redis"] = "ok" if await check_redis() else "error"',
        ],
        priority: 20,
        recipeId: REDIS_CACHE_PYTHON_RECIPE_ID,
      },
    },
    {
      file: 'app/main.py',
      kind: 'insertAtMarker',
      args: {
        marker: 'shutdown',
        lines: ['from app.lib.redis import close_redis', '', 'await close_redis()'],
        priority: 20,
        recipeId: REDIS_CACHE_PYTHON_RECIPE_ID,
      },
    },
    ...composeCodemod(ctx.spec, REDIS_CACHE_PYTHON_RECIPE_ID),
  ],

  readme: (ctx) => cacheReadme('python', ctx.spec),

  postInstall: () => ['docker compose up -d redis'],
};

// ── Go ──────────────────────────────────────────────────────────────────────

const modulePath = (spec: ProjectSpec): string =>
  `github.com/${spec.meta.repo.org}/${spec.meta.slug}`;

export const redisCacheGoRecipe: Recipe = {
  id: REDIS_CACHE_GO_RECIPE_ID,
  phase: 'integration',
  layer: 'api',
  requires: (spec: ProjectSpec) => [
    GO_GIN_RECIPE_ID,
    ...(spec.api?.middleware.rateLimit ? [GO_RATE_LIMIT_RECIPE_ID] : []),
  ],

  appliesTo: (spec: ProjectSpec) => cacheOn(spec) && spec.api?.runtime === 'go-gin',

  files: async (ctx) => [
    ...(await loadTemplateDir(
      templatePath('api', 'cache', 'redis-go'),
      ctx,
      REDIS_CACHE_GO_RECIPE_ID,
    )),
    ...(await composeFile(ctx, REDIS_CACHE_GO_RECIPE_ID)),
  ],

  env: () => envVars,

  codemods: (ctx): CodemodOp[] => [
    {
      file: 'go.mod',
      kind: 'insertAtMarker',
      args: {
        marker: 'dependencies',
        lines: goRequirements(['github.com/redis/go-redis/v9']),
        priority: 40,
        recipeId: REDIS_CACHE_GO_RECIPE_ID,
      },
    },
    {
      file: 'internal/config/config.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'config-fields',
        lines: ['RedisURL string'],
        priority: 20,
        recipeId: REDIS_CACHE_GO_RECIPE_ID,
      },
    },
    {
      file: 'internal/config/config.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'env-schema',
        lines: [
          'cfg.RedisURL = getString("REDIS_URL", "")',
          'if cfg.RedisURL == "" {',
          '\treturn nil, fmt.Errorf("REDIS_URL is required")',
          '}',
        ],
        priority: 20,
        recipeId: REDIS_CACHE_GO_RECIPE_ID,
      },
    },
    // Parsed at startup so a malformed URL fails the boot with the key named; nothing dials here.
    {
      file: 'cmd/api/main.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'startup',
        lines: [
          'if err := cache.Open(cfg); err != nil {',
          '\tslog.Error("could not configure redis", "err", err)',
          '\tos.Exit(1)',
          '}',
        ],
        priority: 20,
        recipeId: REDIS_CACHE_GO_RECIPE_ID,
      },
    },
    {
      file: 'cmd/api/main.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'shutdown',
        lines: ['cache.Close()'],
        priority: 20,
        recipeId: REDIS_CACHE_GO_RECIPE_ID,
      },
    },
    {
      file: 'cmd/api/main.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'imports',
        lines: [`"${modulePath(ctx.spec)}/internal/cache"`],
        priority: 20,
        recipeId: REDIS_CACHE_GO_RECIPE_ID,
      },
    },
    {
      file: 'internal/routes/health.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'readiness-checks',
        lines: [
          'if err := cache.Check(c.Request.Context()); err != nil {',
          '\tchecks["redis"] = "error"',
          '} else {',
          '\tchecks["redis"] = "ok"',
          '}',
        ],
        priority: 20,
        recipeId: REDIS_CACHE_GO_RECIPE_ID,
      },
    },
    {
      file: 'internal/routes/health.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'imports',
        lines: [`"${modulePath(ctx.spec)}/internal/cache"`],
        priority: 20,
        recipeId: REDIS_CACHE_GO_RECIPE_ID,
      },
    },
    ...composeCodemod(ctx.spec, REDIS_CACHE_GO_RECIPE_ID),
  ],

  readme: (ctx) => cacheReadme('go', ctx.spec),

  postInstall: () => ['docker compose up -d redis'],
};
