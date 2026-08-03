/**
 * Python + FastAPI — the second API runtime, and the first non-TypeScript one.
 *
 * FastAPI rather than Django or Flask, per the PRD. It is the closest analogue to the Fastify
 * spine: Pydantic models validate a request and produce the OpenAPI document from one definition,
 * exactly as Zod schemas do on the Node side, so the two runtimes end up with the same shape of
 * project rather than merely the same feature list.
 *
 * ── What this runtime forced into the open ───────────────────────────────────
 * Every middleware recipe opened with `spec.api?.runtime === 'node-ts'` and wrote codemods against
 * the literal `src/server.ts`. That reads as a runtime check and is really an assumption that
 * there is only one. The runtime contract now holds those paths, for the same reason the framework
 * contract holds the UI ones — and, as there, the assumption was invisible until a second
 * implementation existed.
 *
 * ── Dependencies go through a marker, not through packageJson() ──────────────
 * `pyproject.toml` has no structural merger the way package.json does, so this runtime declares an
 * `idp:dependencies` region and recipes insert PEP 508 requirement strings into it. The contract
 * records that with `manifestMarker: 'dependencies'`; Node declares `null` for the same field so a
 * recipe cannot take the marker path on a runtime where the merge stage already owns the file.
 */

import { templatePath } from '@idp/templates';
import { pythonRequirements, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { registerRuntimeContract } from '../runtime-contract.js';
import type { Recipe } from '../types.js';

export const PYTHON_FASTAPI_RECIPE_ID = 'api.runtime.python-fastapi';

/**
 * 8000, which is uvicorn's own default rather than an arbitrary choice.
 *
 * Deliberately not 3001: the two runtimes are never deployed as the same image, and matching the
 * ecosystem's default is what makes `curl localhost:8000` work for someone who has never read
 * this file.
 */
export const PYTHON_PORT = 8000;

registerRuntimeContract('python-fastapi', {
  recipeId: PYTHON_FASTAPI_RECIPE_ID,
  language: 'python',
  serverFile: 'app/main.py',
  envFile: 'app/config.py',
  manifestFile: 'pyproject.toml',
  manifestMarker: 'dependencies',
  policyPath: 'app/lib/permissions.py',
  containerRecipeId: 'ops.container.python-api',
  port: PYTHON_PORT,
  devCommand: 'uv run python -m app',
});

const isPython = (spec: ProjectSpec): boolean => spec.api?.runtime === 'python-fastapi';

export const pythonFastapiRecipe: Recipe = {
  id: PYTHON_FASTAPI_RECIPE_ID,
  phase: 'base',
  layer: 'api',

  appliesTo: isPython,

  files: (ctx) =>
    loadTemplateDir(
      templatePath('api', 'runtime', 'python-fastapi'),
      ctx,
      PYTHON_FASTAPI_RECIPE_ID,
      {
        runtime: { port: PYTHON_PORT },
        /*
         * `uvicorn[standard]` rather than bare uvicorn. The extra pulls in uvloop and httptools —
         * the event loop and HTTP parser that make it fast — and, more importantly here,
         * `websockets` and `watchfiles`. Without the extra, uvicorn falls back to the pure-Python
         * asyncio loop and the difference is a several-fold drop in throughput that no test in this
         * repository would notice.
         *
         * The extras bracket is install syntax, not part of the package name, which is why
         * PYTHON_VERSIONS pins `uvicorn` and the bracket is applied here.
         */
        deps: pythonRequirements([
          'fastapi',
          ['uvicorn', '[standard]'],
          'pydantic',
          'pydantic-settings',
        ]),
        devDeps: pythonRequirements(['ruff', 'pytest', 'httpx']),
      },
    ),

  env: () => [
    {
      key: 'PORT',
      example: String(PYTHON_PORT),
      required: false,
      description: 'HTTP port the API listens on',
    },
    {
      key: 'LOG_LEVEL',
      example: 'info',
      required: false,
      description: 'Log level (critical, error, warning, info, debug)',
    },
    {
      /*
       * ENVIRONMENT, not NODE_ENV. The variable means the same thing in both runtimes, but naming
       * a Python service's config after Node would be a puzzle for whoever reads it next — and
       * the Helm chart templates this key from the values file rather than hardcoding either.
       */
      key: 'ENVIRONMENT',
      example: 'development',
      required: false,
      description: 'Deployment environment (development, test, production)',
    },
  ],

  gitignore: () => [
    '__pycache__/',
    '*.py[cod]',
    '.venv/',
    '.pytest_cache/',
    '.ruff_cache/',
    // uv writes this and it MUST be committed — it is the lockfile, and the reason two installs
    // of the same project resolve identically. Listed here as a negation so a later broad rule
    // cannot exclude it by accident.
    '!uv.lock',
  ],

  readme: () => ({
    order: README_ORDER.backend,
    heading: 'API',
    body: [
      'FastAPI on uvicorn. `app/main.py` builds the app; `app/__main__.py` serves it.',
      '',
      '```bash',
      'uv sync            # create .venv and install from uv.lock',
      'uv run python -m app',
      '```',
      '',
      '| Endpoint | Purpose |',
      '| --- | --- |',
      '| `GET /health` | Liveness — is the process wedged? Failing this restarts the pod. |',
      '| `GET /ready` | Readiness — can it serve now? Failing this removes it from the Service. |',
      '',
      'Both paths are referenced by the Kubernetes probes in `deploy/`, so keep them stable.',
      '',
      '`/ready` checks dependencies; `/health` deliberately does not. Checking the database in a',
      'liveness probe means one brief database blip restarts every pod at once, turning a',
      'recoverable outage into a total one.',
      '',
      'Configuration is a `pydantic-settings` model in `app/config.py`, parsed once at import. A',
      'missing or malformed variable stops the process at boot with the key named, rather than',
      'surfacing as a `None` inside one request handler.',
      '',
      'Lint and format with `uv run ruff check .` and `uv run ruff format .` — one binary replaces',
      'flake8, isort and black, which is why the project has none of them.',
    ].join('\n'),
  }),

  postInstall: () => ['uv sync', 'uv run python -m app'],
};
