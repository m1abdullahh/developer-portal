/**
 * What every API runtime recipe promises to the recipes layered on top of it.
 *
 * The API side has been exactly one runtime since P1, and it shows: every middleware recipe opens
 * with `spec.api?.runtime === 'node-ts'`, writes codemods against the literal path `src/server.ts`,
 * and inserts TypeScript into a Zod schema at `src/config/env.ts`. None of those three facts is
 * true of a FastAPI project, and none of them is stated anywhere a second runtime could find them.
 *
 * This is the same lesson the framework contract learned on the UI side, and it is worth naming
 * why it recurs: a recipe that hardcodes a path is indistinguishable from one that asks, right up
 * until the second implementation exists. The UI half only discovered its three hidden React
 * assumptions when Nuxt arrived. The API half is at that moment now.
 *
 * ── The marker requirement ───────────────────────────────────────────────────
 * `serverFile` must declare the `plugins`, `routes` and `error-cases` marker regions, and
 * `envFile` the `env-schema` region. Those are the anchors every middleware recipe injects into.
 * Marker syntax is per-language and `syntaxForPath` derives it from the extension, so a runtime
 * states *where* the regions are and never *how* to write into them.
 *
 * Deliberately marker-based rather than AST-based, for all three languages including TypeScript.
 * Registration order is semantically load-bearing — CORS must answer preflights before auth
 * rejects them — and MIDDLEWARE_PRIORITY declares that order once, identically, for every runtime.
 * An AST insertion would express the same ordering three different ways in three different
 * languages, and none of them visible to whoever reads the generated file.
 */

import type { ApiRuntime, ProjectSpec } from '@idp/core';

export interface RuntimeContract {
  /** The runtime recipe's id, for `requires` — it must run before anything layered on it. */
  recipeId: string;
  /**
   * Language of the generated sources.
   *
   * Drives marker comment syntax, which file extensions the format stage recognises, and which
   * flavour of the shared policy template gets rendered. Named rather than inferred from the
   * runtime, because two runtimes could share a language and the thing being asked about is the
   * language.
   */
  language: 'ts' | 'python' | 'go';
  /**
   * File declaring the `plugins`, `routes` and `error-cases` marker regions.
   *
   * `src/server.ts` under Fastify, `app/main.py` under FastAPI. Middleware recipes name this
   * rather than the literal path, which is the entire point.
   */
  serverFile: string;
  /** File declaring the `env-schema` marker region — where a recipe declares a variable it reads. */
  envFile: string;
  /**
   * Dependency manifest, and how a recipe adds to it.
   *
   * `package.json` is merged structurally by the merge stage, so Node recipes return a
   * `PackageDelta` from `packageJson()` and never touch the file. `pyproject.toml` and `go.mod`
   * have no such merger — they are TOML and a bespoke format respectively, and writing one would
   * be a lot of machinery for two consumers. Instead they declare a `dependencies` marker region
   * and recipes insert their pins the same way they insert everything else.
   *
   * `manifestMarker` is null for Node precisely so a recipe cannot accidentally take the marker
   * path on a runtime where the merge stage already owns the file — two writers, one file.
   */
  manifestFile: string;
  manifestMarker: 'dependencies' | null;
  /**
   * Where the shared role/permission policy is rendered.
   *
   * The policy is one definition with one enforcement point per layer (see policy-permissions.ts).
   * Its *content* is per-language — a TypeScript union, a Python `StrEnum`, a Go const block — but
   * the roles and the permission sets they map to are identical, and a contract test asserts that.
   */
  policyPath: string;
  /**
   * Container recipe that packages this runtime.
   *
   * Exists so `deployableRecipeId` can ask instead of assuming. It previously returned
   * `ops.container.node-api` for any spec with an API layer, which is correct for exactly one
   * runtime and silently wrong for the other two: a FastAPI project would have rendered a chart
   * probing `/health` on port 3001 against an image that serves `/health` on 8000. Every check we
   * run would have passed, because the mismatch is only observable from inside a cluster.
   */
  containerRecipeId: string;
  /** Port the dev server binds. Matches the container contract's port for the same runtime. */
  port: number;
  /** Shown in the README's quickstart, and by the wizard's preview pane. */
  devCommand: string;
}

/**
 * Registered by each runtime recipe at module load rather than listed here.
 *
 * Same reasoning as the framework contract: a plain object in this file would put every runtime's
 * paths in one place, which is the coupling being removed. A runtime with no recipe yet is absent
 * rather than silently wrong.
 */
const contracts = new Map<ApiRuntime, RuntimeContract>();

export function registerRuntimeContract(runtime: ApiRuntime, contract: RuntimeContract): void {
  contracts.set(runtime, contract);
}

export class UnknownRuntimeError extends Error {
  constructor(runtime: string) {
    super(
      `No runtime contract is registered for "${runtime}". An API runtime recipe must call ` +
        `registerRuntimeContract() at module load, or recipes layered on top of it cannot know ` +
        `which file holds the marker regions they inject into.`,
    );
    this.name = 'UnknownRuntimeError';
  }
}

/**
 * The contract for a spec's chosen runtime.
 *
 * Throws rather than defaulting to Node. A default would make an unimplemented runtime generate a
 * project that looks complete and is a mixture of two languages.
 */
export function runtimeContract(spec: ProjectSpec): RuntimeContract {
  if (!spec.api) {
    throw new Error(
      'runtimeContract() was called for a spec with no API layer. Guard on `spec.api` first — ' +
        'a UI-only project has no runtime to describe.',
    );
  }

  const contract = contracts.get(spec.api.runtime);
  if (!contract) throw new UnknownRuntimeError(spec.api.runtime);
  return contract;
}

/** Convenience for `requires`, which is the most common reason to reach for the contract. */
export function requiresRuntime(spec: ProjectSpec): readonly string[] {
  return [runtimeContract(spec).recipeId];
}

/** Test affordance: the runtimes that have registered a contract. */
export function registeredRuntimes(): ApiRuntime[] {
  return [...contracts.keys()].sort();
}

/**
 * The environment variables each middleware owns, declared once for every runtime.
 *
 * These names are not an internal detail. They are the keys in the generated Helm chart's
 * ConfigMap and Secret, in `.env.example`, in `docker-compose.yml` and in the CI workflow — so a
 * Python service reading `CORS_ALLOWED_ORIGINS` while the chart sets `CORS_ORIGINS` is a
 * deployment that boots, serves, and fails every cross-origin request in production only.
 *
 * Nothing forces three separately-written runtime recipes to agree on a string. This table does,
 * and `runtime-contract.test.ts` asserts each runtime's recipes declare exactly these keys.
 */
export const MIDDLEWARE_ENV = {
  cors: [
    {
      key: 'CORS_ORIGINS',
      example: 'http://localhost:3000',
      required: true,
      description: 'Comma-separated list of allowed origins. Never a wildcard with credentials.',
    },
  ],
  rateLimit: [
    { key: 'RATE_LIMIT_MAX', example: '100', required: false, description: 'Requests per window' },
    {
      key: 'RATE_LIMIT_WINDOW',
      example: '1 minute',
      required: false,
      description: 'Rate limit window, e.g. "1 minute"',
    },
  ],
  auth: [
    {
      key: 'JWT_SECRET',
      example: '',
      required: true,
      description: 'Signing key for access tokens. Use at least 32 random bytes.',
      secret: true,
    },
    {
      key: 'JWT_EXPIRES_IN',
      example: '15m',
      required: false,
      description: 'Access token lifetime',
    },
  ],
} as const;
