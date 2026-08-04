/**
 * PostgreSQL + Drizzle — the second Node ORM.
 *
 * Prisma generates a client from its own schema language; Drizzle IS TypeScript — the schema is a
 * module, the queries are typed against it directly, and there is no generate step and no
 * generated directory to copy into the container. What `drizzle-kit generate` produces is plain
 * SQL migrations diffed from that module, which is the same posture as Alembic and goose: the SQL
 * is committed, reviewed and applied deliberately.
 *
 * The recipe mirrors the Prisma one everywhere the difference is not the point: same
 * DATABASE_URL contract, same readiness wiring, same shared Postgres compose service.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { NODE_TS_RECIPE_ID } from './api-node-ts.js';
import type { Recipe } from '../types.js';

export const DRIZZLE_RECIPE_ID = 'api.db.postgres-drizzle';

export const drizzleRecipe: Recipe = {
  id: DRIZZLE_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [NODE_TS_RECIPE_ID],

  appliesTo: (spec: ProjectSpec) =>
    spec.api?.database === 'postgres' &&
    spec.api.orm === 'drizzle' &&
    spec.api.runtime === 'node-ts',

  files: async (ctx) => [
    ...(await loadTemplateDir(
      templatePath('api', 'db', 'postgres-drizzle'),
      ctx,
      DRIZZLE_RECIPE_ID,
    )),
    ...(await loadTemplateDir(
      templatePath('api', 'db', 'postgres-compose'),
      ctx,
      DRIZZLE_RECIPE_ID,
    )),
  ],

  packageJson: () => ({
    dependencies: dependencyMap(['drizzle-orm', 'pg']),
    devDependencies: dependencyMap(['drizzle-kit', '@types/pg']),
    scripts: {
      'db:generate': 'drizzle-kit generate',
      'db:migrate': 'drizzle-kit migrate',
      'db:studio': 'drizzle-kit studio',
    },
  }),

  env: (ctx) => [
    {
      key: 'DATABASE_URL',
      example: `postgresql://postgres:postgres@localhost:5432/${ctx.spec.meta.slug.replace(/-/g, '_')}`,
      required: true,
      description: 'PostgreSQL connection string',
      secret: true,
    },
  ],

  codemods: () => [
    // A missing DATABASE_URL stops the process at boot rather than surfacing as a connection
    // error on the first query.
    {
      file: 'src/config/env.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'env-schema',
        lines: ["DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),"],
        priority: 10,
        recipeId: DRIZZLE_RECIPE_ID,
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
        recipeId: DRIZZLE_RECIPE_ID,
      },
    },
    {
      file: 'src/routes/health.ts',
      kind: 'addImport',
      args: { module: '../db/index.js', named: ['checkDatabase'] },
    },
  ],

  readme: () => ({
    order: README_ORDER.database,
    heading: 'Database',
    body: [
      'PostgreSQL via Drizzle. The schema lives in `src/db/schema.ts` — TypeScript, not a schema',
      'language — and queries are typed against it directly, so there is no generate step.',
      '',
      '```bash',
      'docker compose up -d postgres   # start the local database',
      'npm run db:generate             # diff schema.ts into a SQL migration in ./drizzle',
      'npm run db:migrate              # apply committed migrations',
      'npm run db:studio               # browse the data',
      '```',
      '',
      'Declare every table in (or re-export it from) `src/db/schema.ts`. `db:generate` diffs that',
      'one module against the migration journal, so a table defined elsewhere is invisible to',
      'migrations — the same trap as an unimported model in Alembic.',
      '',
      'Commit the `drizzle/` directory. The SQL in it is what deploys; the TypeScript schema is',
      'what develops.',
      '',
      'Read what `db:generate` produces before applying it: a renamed column is detected as a',
      'drop plus an add, which applies cleanly and discards the data in it.',
      '',
      '`/ready` reports database connectivity. `/health` does not — a liveness probe that checks',
      'the database restarts every pod at once during a brief outage.',
    ].join('\n'),
  }),

  postInstall: () => ['docker compose up -d postgres', 'npm run db:generate', 'npm run db:migrate'],
};
