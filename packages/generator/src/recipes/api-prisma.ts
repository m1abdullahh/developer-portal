/**
 * PostgreSQL + Prisma.
 *
 * Contributes the schema, the client singleton, a local Postgres service, and the readiness
 * check that fills the `idp:readiness-checks` marker in the base recipe's health route.
 *
 * The Prisma 7 handling here (no `url` in the datasource, explicit driver adapter, manual .env
 * loading) is not incidental — those are three separate breaking changes that each fail with a
 * message pointing somewhere other than the cause. Encoding them once in a template means no
 * generated project has to rediscover them.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { NODE_TS_RECIPE_ID } from './api-node-ts.js';
import type { Recipe } from '../types.js';

export const PRISMA_RECIPE_ID = 'api.db.postgres-prisma';

export const prismaRecipe: Recipe = {
  id: PRISMA_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [NODE_TS_RECIPE_ID],

  appliesTo: (spec: ProjectSpec) =>
    spec.api?.database === 'postgres' &&
    spec.api.orm === 'prisma' &&
    spec.api.runtime === 'node-ts',

  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'db', 'postgres-prisma'), ctx, PRISMA_RECIPE_ID),

  packageJson: () => ({
    dependencies: dependencyMap(['@prisma/client', '@prisma/adapter-pg', 'pg']),
    devDependencies: dependencyMap(['prisma', '@types/pg']),
    scripts: {
      'db:generate': 'prisma generate',
      'db:migrate': 'prisma migrate dev',
      'db:deploy': 'prisma migrate deploy',
      'db:studio': 'prisma studio',
    },
  }),

  env: (ctx) => [
    {
      key: 'DATABASE_URL',
      example: `postgresql://postgres:postgres@localhost:5432/${ctx.spec.meta.slug.replace(/-/g, '_')}`,
      required: true,
      description: 'PostgreSQL connection string',
      // Marked secret so production credentials are never written into .env.example, even
      // though the local development value is harmless.
      secret: true,
    },
  ],

  gitignore: () => ['src/generated/', 'prisma/*.db'],

  codemods: () => [
    // Extends the env schema so a missing DATABASE_URL stops the process at boot rather than
    // surfacing as a connection error on the first query.
    {
      file: 'src/config/env.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'env-schema',
        lines: ["DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),"],
        priority: 10,
        recipeId: PRISMA_RECIPE_ID,
      },
    },
    // Readiness reflects the database; liveness deliberately does not (doc 03 §5).
    {
      file: 'src/routes/health.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'readiness-checks',
        lines: ["checks['database'] = (await checkDatabase()) ? 'ok' : 'error';"],
        priority: 10,
        recipeId: PRISMA_RECIPE_ID,
      },
    },
    {
      file: 'src/routes/health.ts',
      kind: 'addImport',
      args: { module: '../lib/prisma.js', named: ['checkDatabase'] },
    },
  ],

  readme: () => ({
    order: README_ORDER.database,
    heading: 'Database',
    body: [
      'PostgreSQL via Prisma.',
      '',
      '```bash',
      'docker compose up -d postgres   # start the local database',
      'npm run db:migrate              # create and apply a migration',
      'npm run db:studio               # browse the data',
      '```',
      '',
      '**Prisma 7 notes.** The connection string is no longer in `schema.prisma` — it lives in',
      '`prisma.config.ts` for CLI commands and is passed to `PrismaClient` through a driver',
      'adapter at runtime. Prisma also no longer auto-loads `.env`, which `prisma.config.ts`',
      'does explicitly.',
      '',
      'Migrations are generated, never applied automatically in production. `npm run db:deploy`',
      'is a deliberate step; rollbacks remain manual by design.',
      '',
      '`/ready` reports database connectivity. `/health` does not — a liveness probe that checks',
      'the database restarts every pod at once during a brief outage.',
    ].join('\n'),
  }),

  postInstall: () => ['docker compose up -d postgres', 'npm run db:migrate'],
};
