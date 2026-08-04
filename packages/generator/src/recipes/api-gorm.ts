/**
 * PostgreSQL + GORM, with goose for migrations — the Go half of the database layer.
 *
 * GORM for data access because it is the ecosystem's default and its API shape (a typed handle,
 * chainable queries) is what a Go developer expects to find. goose for schema changes because
 * GORM's own AutoMigrate only ever adds — it will not drop a column, tighten a type or backfill
 * data — so it degrades from "the migration tool" to "a trap" the first time a schema change is
 * destructive. Versioned SQL files with an Up and a Down are the same posture Prisma and Alembic
 * take in the other two runtimes.
 *
 * Migrations are embedded in the binary (go:embed) and applied by `go run ./cmd/migrate` — a
 * deliberate step, never at boot. Migrations reaching production because a pod restarted is how a
 * bad migration gets applied at 3am with nobody watching.
 */

import { templatePath } from '@idp/templates';
import { goRequirements, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { GO_GIN_RECIPE_ID } from './api-go-gin.js';
import type { CodemodOp, Recipe } from '../types.js';

export const GORM_RECIPE_ID = 'api.db.postgres-gorm';

const modulePath = (spec: ProjectSpec): string =>
  `github.com/${spec.meta.repo.org}/${spec.meta.slug}`;

export const gormRecipe: Recipe = {
  id: GORM_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [GO_GIN_RECIPE_ID],

  appliesTo: (spec: ProjectSpec) =>
    spec.api?.database === 'postgres' && spec.api.orm === 'gorm' && spec.api.runtime === 'go-gin',

  files: async (ctx) => [
    ...(await loadTemplateDir(templatePath('api', 'db', 'postgres-gorm'), ctx, GORM_RECIPE_ID)),
    // The same local Postgres service the Prisma and SQLModel recipes emit, from the same shared
    // template. Exactly one ORM recipe applies to a given spec, so the path is never claimed twice.
    ...(await loadTemplateDir(templatePath('api', 'db', 'postgres-compose'), ctx, GORM_RECIPE_ID)),
  ],

  env: (ctx) => [
    {
      key: 'DATABASE_URL',
      example: `postgres://postgres:postgres@localhost:5432/${ctx.spec.meta.slug.replace(/-/g, '_')}`,
      required: true,
      description: 'PostgreSQL connection string',
      secret: true,
    },
  ],

  codemods: (ctx): CodemodOp[] => [
    {
      file: 'go.mod',
      kind: 'insertAtMarker',
      args: {
        marker: 'dependencies',
        lines: goRequirements([
          'gorm.io/gorm',
          'gorm.io/driver/postgres',
          'github.com/pressly/goose/v3',
        ]),
        priority: 20,
        recipeId: GORM_RECIPE_ID,
      },
    },
    // The two halves of the variable: the struct field and the parse line. No default — a
    // database URL that falls back to localhost in production connects to nothing and reports it
    // as a timeout.
    {
      file: 'internal/config/config.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'config-fields',
        lines: ['DatabaseURL string'],
        priority: 10,
        recipeId: GORM_RECIPE_ID,
      },
    },
    {
      file: 'internal/config/config.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'env-schema',
        lines: [
          'cfg.DatabaseURL = getString("DATABASE_URL", "")',
          'if cfg.DatabaseURL == "" {',
          '\treturn nil, fmt.Errorf("DATABASE_URL is required")',
          '}',
        ],
        priority: 10,
        recipeId: GORM_RECIPE_ID,
      },
    },
    // Open at startup — lazily, DisableAutomaticPing means no dial — and dispose on shutdown.
    {
      file: 'cmd/api/main.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'startup',
        lines: [
          'if err := db.Open(cfg); err != nil {',
          '\tslog.Error("could not open the database", "err", err)',
          '\tos.Exit(1)',
          '}',
        ],
        priority: 10,
        recipeId: GORM_RECIPE_ID,
      },
    },
    {
      file: 'cmd/api/main.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'shutdown',
        lines: ['db.Close()'],
        priority: 10,
        recipeId: GORM_RECIPE_ID,
      },
    },
    {
      file: 'cmd/api/main.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'imports',
        lines: [`"${modulePath(ctx.spec)}/internal/db"`],
        priority: 10,
        recipeId: GORM_RECIPE_ID,
      },
    },
    // Readiness reflects the database; liveness deliberately does not (doc 03 §5).
    {
      file: 'internal/routes/health.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'readiness-checks',
        lines: [
          'if err := db.Check(c.Request.Context()); err != nil {',
          '\tchecks["database"] = "error"',
          '} else {',
          '\tchecks["database"] = "ok"',
          '}',
        ],
        priority: 10,
        recipeId: GORM_RECIPE_ID,
      },
    },
    {
      file: 'internal/routes/health.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'imports',
        lines: [`"${modulePath(ctx.spec)}/internal/db"`],
        priority: 10,
        recipeId: GORM_RECIPE_ID,
      },
    },
  ],

  readme: () => ({
    order: README_ORDER.database,
    heading: 'Database',
    body: [
      'PostgreSQL via GORM, with goose for versioned SQL migrations.',
      '',
      '```bash',
      'docker compose up -d postgres   # start the local database',
      'go run ./cmd/migrate            # apply migrations',
      '```',
      '',
      'Schema changes are numbered SQL files in `internal/db/migrations/`, each with a',
      '`-- +goose Up` and a `-- +goose Down`. They are embedded in the binary and applied by',
      '`cmd/migrate` — deliberately never at boot, so a bad migration cannot reach production',
      'because a pod restarted.',
      '',
      '**Do not reach for `AutoMigrate`.** It only ever adds — it will not drop a column, tighten',
      'a type or backfill data — so it works perfectly on an empty database and silently does',
      'nothing the first time a change is destructive.',
      '',
      'The connection opens lazily (`DisableAutomaticPing`): boot never requires the database.',
      '`/ready` reports connectivity; `/health` does not — a liveness probe that checks the',
      'database restarts every pod at once during a brief outage.',
    ].join('\n'),
  }),

  postInstall: () => ['docker compose up -d postgres', 'go run ./cmd/migrate'],
};
