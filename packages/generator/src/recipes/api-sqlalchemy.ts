/**
 * PostgreSQL + plain SQLAlchemy 2 — the second Python ORM.
 *
 * The difference from SQLModel is one class hierarchy: SQLModel makes one declaration serve as
 * both the table and the Pydantic model, while this option keeps them separate — `Base` models
 * for the database, Pydantic schemas for the API boundary. Teams that prefer the explicit split
 * (different validation on the way in than the shape at rest) pick this; teams that want one
 * definition pick SQLModel. Everything operational is identical: the same async engine, the same
 * Alembic migrations, the same readiness wiring, the same shared Postgres compose service.
 */

import { templatePath } from '@idp/templates';
import { pythonRequirements, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { PYTHON_FASTAPI_RECIPE_ID } from './api-python-fastapi.js';
import type { Recipe } from '../types.js';

export const SQLALCHEMY_RECIPE_ID = 'api.db.postgres-sqlalchemy';

export const sqlalchemyRecipe: Recipe = {
  id: SQLALCHEMY_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [PYTHON_FASTAPI_RECIPE_ID],

  appliesTo: (spec: ProjectSpec) =>
    spec.api?.database === 'postgres' &&
    spec.api.orm === 'sqlalchemy' &&
    spec.api.runtime === 'python-fastapi',

  files: async (ctx) => [
    ...(await loadTemplateDir(
      templatePath('api', 'db', 'postgres-sqlalchemy'),
      ctx,
      SQLALCHEMY_RECIPE_ID,
    )),
    ...(await loadTemplateDir(
      templatePath('api', 'db', 'postgres-compose'),
      ctx,
      SQLALCHEMY_RECIPE_ID,
    )),
  ],

  env: (ctx) => [
    {
      key: 'DATABASE_URL',
      example: `postgresql://postgres:postgres@localhost:5432/${ctx.spec.meta.slug.replace(/-/g, '_')}`,
      required: true,
      description: 'PostgreSQL connection string',
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
        lines: pythonRequirements(['sqlalchemy', 'alembic', 'asyncpg']).map((r) => `"${r}",`),
        priority: 20,
        recipeId: SQLALCHEMY_RECIPE_ID,
      },
    },
    {
      file: 'app/config.py',
      kind: 'insertAtMarker',
      args: {
        marker: 'env-schema',
        lines: ['DATABASE_URL: str'],
        priority: 10,
        recipeId: SQLALCHEMY_RECIPE_ID,
      },
    },
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
        recipeId: SQLALCHEMY_RECIPE_ID,
      },
    },
    {
      file: 'app/main.py',
      kind: 'insertAtMarker',
      args: {
        marker: 'shutdown',
        lines: ['from app.db.session import close_database', '', 'await close_database()'],
        priority: 10,
        recipeId: SQLALCHEMY_RECIPE_ID,
      },
    },
  ],

  readme: () => ({
    order: README_ORDER.database,
    heading: 'Database',
    body: [
      'PostgreSQL via SQLAlchemy 2 (async), with Alembic for migrations.',
      '',
      '```bash',
      'docker compose up -d postgres                               # start the local database',
      'uv run alembic revision --autogenerate -m "initial schema"  # write a migration',
      'uv run alembic upgrade head                                 # apply it',
      '```',
      '',
      'Models inherit from `app.db.base.Base` in SQLAlchemy 2’s typed style, and every model',
      'module must be **imported in `app/models/__init__.py`**. Alembic compares the database',
      'against `Base.metadata`, and a model nobody imports is absent from that metadata — so',
      'autogenerate emits an empty migration, or one that drops the table it cannot see.',
      '',
      'Database models and API schemas are deliberately separate here: Pydantic validates the',
      'boundary, `Base` describes the storage, and the two can evolve independently. If you would',
      'rather declare each shape once, the SQLModel option collapses the two.',
      '',
      '`DATABASE_URL` may be written in the plain `postgresql://` form — `async_url()` rewrites it',
      'to `postgresql+asyncpg://`, because passing the sync form to an async engine raises an',
      'error naming neither the variable nor the fix.',
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
