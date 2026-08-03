/**
 * PostgreSQL + SQLModel, the Python half of the database layer.
 *
 * SQLModel because it is SQLAlchemy and Pydantic in one class: the same declaration is the table
 * and the request model, which is the Python analogue of the Zod-schema-drives-everything property
 * the Node spine has. The alternative, plain SQLAlchemy, means writing each shape twice and
 * keeping them in sync by hand.
 *
 * Migrations are Alembic. SQLModel has no migration tool of its own, and the thing people reach
 * for instead — `SQLModel.metadata.create_all()` — creates missing tables and **never alters an
 * existing one**. It works perfectly on an empty database, which is exactly where it gets adopted,
 * and then silently does nothing the first time a column changes.
 */

import { templatePath } from '@idp/templates';
import { pythonRequirements, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { PYTHON_FASTAPI_RECIPE_ID } from './api-python-fastapi.js';
import type { Recipe } from '../types.js';

export const SQLMODEL_RECIPE_ID = 'api.db.postgres-sqlmodel';

export const sqlmodelRecipe: Recipe = {
  id: SQLMODEL_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [PYTHON_FASTAPI_RECIPE_ID],

  appliesTo: (spec: ProjectSpec) =>
    spec.api?.database === 'postgres' &&
    spec.api.orm === 'sqlmodel' &&
    spec.api.runtime === 'python-fastapi',

  files: async (ctx) => [
    ...(await loadTemplateDir(
      templatePath('api', 'db', 'postgres-sqlmodel'),
      ctx,
      SQLMODEL_RECIPE_ID,
    )),
    // Same local Postgres service the Prisma recipe emits, from the same template. It lived inside
    // that recipe until this one needed it, which meant this project's README told you to run
    // `docker compose up -d postgres` against a file nothing generated.
    ...(await loadTemplateDir(
      templatePath('api', 'db', 'postgres-compose'),
      ctx,
      SQLMODEL_RECIPE_ID,
    )),
  ],

  env: (ctx) => [
    {
      key: 'DATABASE_URL',
      example: `postgresql://postgres:postgres@localhost:5432/${ctx.spec.meta.slug.replace(/-/g, '_')}`,
      required: true,
      description: 'PostgreSQL connection string',
      // Marked secret so production credentials never reach .env.example, even though the local
      // development value is harmless.
      secret: true,
    },
  ],

  gitignore: () => ['*.db', '*.sqlite3'],

  codemods: () => [
    {
      file: 'pyproject.toml',
      kind: 'insertAtMarker',
      args: {
        marker: 'dependencies',
        lines: pythonRequirements(['sqlmodel', 'alembic', 'asyncpg']).map((r) => `"${r}",`),
        priority: 20,
        recipeId: SQLMODEL_RECIPE_ID,
      },
    },
    // Extends the settings model so a missing DATABASE_URL stops the process at boot rather than
    // surfacing as a connection error on the first query. No default: a database URL that falls
    // back to localhost in production connects to nothing and reports it as a timeout.
    {
      file: 'app/config.py',
      kind: 'insertAtMarker',
      args: {
        marker: 'env-schema',
        lines: ['DATABASE_URL: str'],
        priority: 10,
        recipeId: SQLMODEL_RECIPE_ID,
      },
    },
    // Readiness reflects the database; liveness deliberately does not (doc 03 §5).
    {
      file: 'app/routes/health.py',
      kind: 'insertAtMarker',
      args: {
        marker: 'readiness-checks',
        lines: [
          'from app.db.session import check_database',
          '',
          'checks["database"] = "ok" if await check_database() else "error"',
        ],
        priority: 10,
        recipeId: SQLMODEL_RECIPE_ID,
      },
    },
    // Disposes the pool on SIGTERM. Without it every rolling update leaks connections until the
    // server times them out, and the symptom appears on a *different* pod, as an inability to
    // connect once the database's connection limit fills.
    {
      file: 'app/main.py',
      kind: 'insertAtMarker',
      args: {
        marker: 'shutdown',
        lines: ['from app.db.session import close_database', '', 'await close_database()'],
        priority: 10,
        recipeId: SQLMODEL_RECIPE_ID,
      },
    },
  ],

  readme: () => ({
    order: README_ORDER.database,
    heading: 'Database',
    body: [
      'PostgreSQL via SQLModel (SQLAlchemy 2 + Pydantic), with Alembic for migrations.',
      '',
      '```bash',
      'docker compose up -d postgres                              # start the local database',
      'uv run alembic revision --autogenerate -m "initial schema"  # write a migration',
      'uv run alembic upgrade head                                 # apply it',
      '```',
      '',
      'Define a model in `app/models/` and **import it in `app/models/__init__.py`**. Alembic',
      'compares the database against `SQLModel.metadata`, and a model in a module nobody imports',
      'is absent from that metadata — so autogenerate emits an empty migration, or one that drops',
      'the table it cannot see.',
      '',
      'Read what autogenerate produces before applying it. It is good at additions and unreliable',
      'about renames: a renamed column is detected as a drop plus an add, which applies cleanly',
      'and discards the data in it.',
      '',
      '`DATABASE_URL` may be written in the plain `postgresql://` form — Helm, psql and every',
      'managed provider emit that. `async_url()` rewrites it to `postgresql+asyncpg://`, because',
      'passing the sync form to an async engine raises an error naming neither the variable nor',
      'the fix.',
      '',
      '`/ready` reports database connectivity. `/health` does not — a liveness probe that checks',
      'the database restarts every pod at once during a brief outage.',
    ].join('\n'),
  }),

  postInstall: () => [
    'docker compose up -d postgres',
    'uv run alembic revision --autogenerate -m "initial schema"',
    'uv run alembic upgrade head',
  ],
};
