/**
 * Go + Gin — the third API runtime, and the one the runtime contract was built waiting for.
 *
 * Python forced the contract into existence; Go is the proof it holds. Nothing in this recipe
 * taught the middleware layer, the CI template or the deployable selection anything new — each
 * asked the contract, and the contract answered with Go's paths.
 *
 * ── Imports are the Go-specific problem ──────────────────────────────────────
 * The Python recipes put each contribution's import inside the marker region, function-local.
 * Go has no function-local imports — they are file-level, and an unused one is a compile error.
 * So every Go file that receives cross-recipe contributions declares an `idp:imports` region
 * inside its import block, and a contributing recipe inserts both the import line and the code
 * that uses it. The two cannot drift apart because the same recipe owns both, and duplicate
 * imports from two recipes deduplicate as identical marker blocks.
 */

import { templatePath } from '@idp/templates';
import { goRequirements, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { registerRuntimeContract } from '../runtime-contract.js';
import type { Recipe } from '../types.js';

export const GO_GIN_RECIPE_ID = 'api.runtime.go-gin';

/** 8080, gin's own default — for the same reason Python keeps uvicorn's 8000. */
export const GO_PORT = 8080;

registerRuntimeContract('go-gin', {
  recipeId: GO_GIN_RECIPE_ID,
  language: 'go',
  serverFile: 'internal/server/server.go',
  envFile: 'internal/config/config.go',
  manifestFile: 'go.mod',
  manifestMarker: 'dependencies',
  policyPath: 'internal/permissions/permissions.go',
  containerRecipeId: 'ops.container.go-api',
  port: GO_PORT,
  devCommand: 'go run ./cmd/api',
});

const isGo = (spec: ProjectSpec): boolean => spec.api?.runtime === 'go-gin';

export const goGinRecipe: Recipe = {
  id: GO_GIN_RECIPE_ID,
  phase: 'base',
  layer: 'api',

  appliesTo: isGo,

  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'runtime', 'go-gin'), ctx, GO_GIN_RECIPE_ID, {
      runtime: { port: GO_PORT },
      deps: goRequirements(['github.com/gin-gonic/gin']),
    }),

  env: () => [
    {
      key: 'PORT',
      example: String(GO_PORT),
      required: false,
      description: 'HTTP port the API listens on',
    },
    {
      key: 'LOG_LEVEL',
      example: 'info',
      required: false,
      description: 'Log level (debug, info, warn, error)',
    },
    {
      key: 'ENVIRONMENT',
      example: 'development',
      required: false,
      description: 'Deployment environment (development, test, production)',
    },
  ],

  gitignore: () => [
    'bin/',
    'coverage.out',
    // go.sum is the lockfile. Negated so a later broad rule cannot exclude it by accident.
    '!go.sum',
  ],

  readme: () => ({
    order: README_ORDER.backend,
    heading: 'API',
    body: [
      'Gin with structured slog logging. `internal/server` builds the engine; `cmd/api` serves it',
      'and handles graceful shutdown.',
      '',
      '```bash',
      'go mod tidy          # resolve modules and write go.sum — commit both',
      'go run ./cmd/api',
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
      'Configuration is read once in `internal/config` — a missing or malformed variable stops the',
      'process at boot with the key named. Nothing else in the codebase touches `os.Getenv`.',
      '',
      'Format and vet with `gofmt -w .` and `go vet ./...` — both run in CI, and a formatting',
      'diff fails the build rather than accumulating.',
    ].join('\n'),
  }),

  postInstall: () => ['go mod tidy', 'go run ./cmd/api'],
};
