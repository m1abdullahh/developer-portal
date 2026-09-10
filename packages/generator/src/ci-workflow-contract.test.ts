/**
 * The generated CI workflow's contract with the service it tests.
 *
 * Two clauses of the P3 gate live here.
 *
 * "Migrations apply against a fresh DB in CI": the API job applies the ORM's migrations against its
 * Postgres service before the tests, with the command a deploy would run — `prisma migrate deploy`,
 * `drizzle-kit migrate`, `alembic upgrade head`, `go run ./cmd/migrate`. A migration that cannot
 * apply fails on the pull request, not in the cluster.
 *
 * And the environment those commands need. Every runtime parses its configuration at start-up and
 * stops on a missing key — right for a pod, and the reason a job that set only `DATABASE_URL` failed
 * `uv run pytest` at collection for any FastAPI project with JWT auth: `Settings` requires
 * `JWT_SECRET`, pytest imports the app, and nothing in the job provided one. The smoke harness had
 * always supplied the documented environment, so it never saw the gap CI had. The job now carries
 * the service's `.env.example` values, with throwaway values for secrets.
 */

import { describe, expect, it } from 'vitest';
import {
  apiOnlyGoSpec,
  apiOnlyGraphqlSpec,
  apiOnlyPythonSpec,
  spineSpec,
  type ProjectSpec,
} from '@idp/core';
import { createRegistry } from './recipes/index.js';
import { runPipeline } from './pipeline.js';
import { computeLayout, prefixFor } from './layout.js';
import type { VirtualFile } from './types.js';

function text(file: VirtualFile | undefined): string {
  return file && typeof file.content === 'string' ? file.content : '';
}

function find(files: readonly VirtualFile[], path: string): VirtualFile | undefined {
  return files.find((f) => f.path === path);
}

/** Keys the API layer documents in its .env.example, with their values (empty when it has none). */
function documentedKeys(files: readonly VirtualFile[], spec: ProjectSpec): Map<string, string> {
  const keys = new Map<string, string>();
  const example = text(find(files, `${prefixFor(computeLayout(spec), 'api')}.env.example`));
  for (const line of example.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match?.[1]) keys.set(match[1], (match[2] ?? '').trim());
  }
  return keys;
}

/** The api job in the generated workflow, whole — from its heading to the next job's. */
function apiJobFull(ci: string): string {
  const start = ci.indexOf('\n  api:\n');
  if (start < 0) return '';
  const next = /\n {2}[a-z-]+:\n/g;
  next.lastIndex = start + 1;
  const match = next.exec(ci);
  return ci.slice(start, match ? match.index : undefined);
}

/** The api job's header — from its heading to its first step. */
function apiJob(ci: string): string {
  const job = apiJobFull(ci);
  const end = job.indexOf('\n    steps:');
  return job.slice(0, end < 0 ? undefined : end);
}

/** The api job's `env:` entries. The Postgres service's own env is indented deeper and excluded. */
function apiJobEnv(ci: string): Map<string, string> {
  const env = new Map<string, string>();
  for (const match of apiJob(ci).matchAll(/^ {6}([A-Z][A-Z0-9_]*): '?([^'\n]*)'?$/gm)) {
    env.set(match[1]!, match[2] ?? '');
  }
  return env;
}

const MIGRATION_COMMAND: Record<string, string | null> = {
  prisma: 'npx prisma migrate deploy',
  drizzle: 'npx drizzle-kit migrate',
  sqlmodel: 'uv run alembic upgrade head',
  sqlalchemy: 'uv run alembic upgrade head',
  gorm: 'go run ./cmd/migrate',
  none: null,
};

const TEST_COMMAND: Record<string, string> = {
  'node-ts': 'npm run test',
  'python-fastapi': 'uv run pytest',
  'go-gin': 'go test ./...',
};

const cache = new Map<ProjectSpec, ReturnType<typeof runPipeline>>();

async function generate(spec: ProjectSpec) {
  let result = cache.get(spec);
  if (!result) {
    result = runPipeline(spec, { registry: createRegistry() });
    cache.set(spec, result);
  }
  return result;
}

const CASES: Array<{ name: string; spec: ProjectSpec }> = [
  { name: 'spine (Node, Prisma, JWT, cache)', spec: spineSpec() },
  {
    name: 'Node + Drizzle',
    spec: spineSpec({ meta: { slug: 'ci-contract-drizzle' }, ui: null, api: { orm: 'drizzle' } }),
  },
  {
    name: 'Node, no database',
    spec: spineSpec({
      meta: { slug: 'ci-contract-no-db' },
      ui: null,
      api: { database: 'none', orm: 'none' },
    }),
  },
  { name: 'Node + GraphQL', spec: apiOnlyGraphqlSpec() },
  { name: 'FastAPI + SQLModel', spec: apiOnlyPythonSpec() },
  {
    name: 'FastAPI + SQLAlchemy',
    spec: apiOnlyPythonSpec({
      meta: { slug: 'ci-contract-sqlalchemy' },
      api: { orm: 'sqlalchemy' },
    }),
  },
  {
    name: 'FastAPI, no database',
    spec: apiOnlyPythonSpec({
      meta: { slug: 'ci-contract-python-no-db' },
      api: { database: 'none', orm: 'none' },
    }),
  },
  { name: 'Gin + GORM', spec: apiOnlyGoSpec() },
  {
    name: 'Gin, no database',
    spec: apiOnlyGoSpec({
      meta: { slug: 'ci-contract-go-no-db' },
      api: { database: 'none', orm: 'none' },
    }),
  },
];

describe.each(CASES)('the CI api job — $name', ({ spec }) => {
  it('carries every key the service documents, with its documented value', async () => {
    const { files } = await generate(spec);
    const env = apiJobEnv(text(find(files, '.github/workflows/ci.yml')));

    for (const [key, value] of documentedKeys(files, spec)) {
      if (key === 'DATABASE_URL') continue;
      expect(env.has(key), `${key} is set on the api job`).toBe(true);
      // A documented value is used as is; a key documented without one (every secret) gets the
      // throwaway value, never an empty string the runtime would reject.
      if (value !== '') expect(env.get(key)).toBe(value);
      else expect(env.get(key)).toContain('ci-only');
    }
  });

  it("points DATABASE_URL at the job's Postgres service exactly when the project has one", async () => {
    const { files } = await generate(spec);
    const ci = text(find(files, '.github/workflows/ci.yml'));
    const env = apiJobEnv(ci);

    if (spec.api!.database === 'postgres') {
      expect(env.get('DATABASE_URL')).toBe('postgresql://postgres:postgres@localhost:5432/test');
      expect(apiJob(ci)).toContain('image: postgres:17-alpine');
    } else {
      expect(env.has('DATABASE_URL')).toBe(false);
      expect(apiJob(ci)).not.toContain('services:');
    }
  });

  it('gives secrets a throwaway value that passes every runtime’s length check', async () => {
    const { files } = await generate(spec);
    const env = apiJobEnv(text(find(files, '.github/workflows/ci.yml')));

    if (spec.api!.middleware.auth === 'jwt') {
      const secret = env.get('JWT_SECRET') ?? '';
      expect(secret).toContain('ci-only');
      expect(secret).toContain('not-a-real-secret');
      expect(secret.length).toBeGreaterThanOrEqual(32);
      // .env.example names the secret and never carries a value; the throwaway one stays in CI.
      expect(documentedKeys(files, spec).get('JWT_SECRET')).toBe('');
    } else {
      expect(env.has('JWT_SECRET')).toBe(false);
    }
  });

  it('applies the ORM’s migrations against that service before the tests run', async () => {
    const { files } = await generate(spec);
    // The job alone: a full-stack workflow's web job runs `npm run test` too, earlier in the file.
    const job = apiJobFull(text(find(files, '.github/workflows/ci.yml')));
    const command = MIGRATION_COMMAND[spec.api!.orm];
    const testCommand = TEST_COMMAND[spec.api!.runtime]!;

    expect(job).toContain(testCommand);
    if (command === null) {
      expect(job).not.toContain('Apply migrations');
      for (const other of Object.values(MIGRATION_COMMAND)) {
        if (other) expect(job).not.toContain(other);
      }
      return;
    }

    expect(job).toContain('Apply migrations');
    expect(job).toContain(command);
    expect(job.indexOf(command)).toBeLessThan(job.indexOf(testCommand));
  });
});

describe('the contract test itself', () => {
  // If the API recipes stop declaring environment, every assertion above passes vacuously.
  it('finds documented keys on the spine, secrets named without a value', async () => {
    const { files } = await generate(spineSpec());
    const keys = documentedKeys(files, spineSpec());
    expect(keys.size).toBeGreaterThan(3);
    expect(keys.has('PORT')).toBe(true);
    // Named, valueless: the shape the "secrets get a throwaway value" assertions depend on.
    expect(keys.get('JWT_SECRET')).toBe('');
  });

  it('parses the api job env without picking up the Postgres service’s own', async () => {
    const { files } = await generate(spineSpec());
    const env = apiJobEnv(text(find(files, '.github/workflows/ci.yml')));
    expect(env.has('POSTGRES_USER')).toBe(false);
    expect(env.has('POSTGRES_PASSWORD')).toBe(false);
    expect(env.has('DATABASE_URL')).toBe(true);
  });
});
