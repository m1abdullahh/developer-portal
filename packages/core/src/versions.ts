/**
 * Versions emitted INTO generated projects.
 *
 * Deliberately separate from this monorepo's own dependencies (see docs/VERSIONS.md): a
 * generated Fastify service should not be forced to move because the portal upgraded.
 *
 * This manifest is the reason generation is deterministic. Resolving "latest" at generation
 * time would make two runs of the same spec produce different lockfiles, which would break
 * every golden-file test (doc 05 §6). Renovate bumps this file via PR — and the resulting
 * golden diff *is* the review.
 *
 * All values verified against the npm registry on 2026-07-28.
 */

export const GENERATED_VERSIONS = {
  // ── Shared ────────────────────────────────────────────────────────────────
  typescript: '6.0.3',
  zod: '4.4.3',
  // 4.0.x, not 4.1.x, and not because 4.1 is worse. Every 4.1.x release peers on `vite` and on its
  // own companion packages (@vitest/ui, coverage-*, browser-*) at an exact version, and each of
  // those peers back on vitest at the same exact version. Since vite 8.2 shipped, that graph makes
  // npm 10.9 (the npm Node 22 ships, so also every generated CI run) crash in its peer resolver
  // with "Cannot read properties of null (reading 'edgesOut')" — on a bare `npm install vitest@4.1.10`
  // with nothing else in the manifest. A generated project therefore could not install at all.
  // The 4.0 line has no vite peer and resolves; it is still maintained (4.0.18 is from 2026-09-05).
  // Verified on 2026-09-09 against both the web and api spine manifests. Revisit when a vitest
  // 4.1/5.x resolves on npm 10.9 without --legacy-peer-deps.
  vitest: '4.0.18',
  eslint: '10.8.0',
  // ESLint 9 removed .eslintrc, so a generated project needs a flat config — and a flat config
  // needs these two to say anything useful about TypeScript. Same versions this monorepo runs.
  '@eslint/js': '10.0.1',
  'typescript-eslint': '8.65.0',
  prettier: '3.9.6',
  '@types/node': '22.20.1',

  // ── UI: Next.js (P1 spine) ────────────────────────────────────────────────
  next: '16.2.12',
  react: '19.2.8',
  'react-dom': '19.2.8',
  '@types/react': '19.2.17',
  '@types/react-dom': '19.2.3',

  // ── UI: Vite + React (P2) ─────────────────────────────────────────────────
  vite: '8.1.5',
  '@vitejs/plugin-react': '6.0.4',
  // A Vite SPA has no routing of its own, so page modules would have nowhere to register a route.
  // v8 peers react >=19.2.7, satisfied by the pinned 19.2.8. Verified on 2026-07-30.
  'react-router': '8.3.0',

  // ── UI: Nuxt (P2.4) ───────────────────────────────────────────────────────
  // Nuxt 4 moved the application source under `app/`, which is why the framework contract's
  // sourceRoot differs from Next's. Verified on 2026-07-31.
  nuxt: '4.5.1',
  vue: '3.5.40',
  // `nuxt typecheck` shells out to vue-tsc — tsc alone cannot read a `.vue` single-file
  // component, so the generated typecheck script would pass while ignoring every template.
  'vue-tsc': '3.3.9',
  // ESLint cannot parse `.vue` either; the parser and plugin are what make `eslint .` see
  // template expressions rather than skipping the files.
  'eslint-plugin-vue': '10.10.0',
  'vue-eslint-parser': '10.4.1',

  // ── UI: Vuetify (P2.4, the MUI substitute for Vue) ────────────────────────
  vuetify: '4.1.7',
  // The Vite plugin, not vuetify-nuxt-module: that module's only release supporting Vuetify 4 is
  // a release candidate, and an RC has no place in a scaffold teams take to production. This is
  // the stable path Vuetify's own Nuxt guide documents — it handles component tree-shaking and
  // style resolution, which a plain plugin file cannot. Verified on 2026-08-01.
  'vite-plugin-vuetify': '2.1.3',

  // ── UI: styling ───────────────────────────────────────────────────────────
  tailwindcss: '4.3.3',
  // Tailwind 4 dropped its PostCSS-only setup: Next uses '@tailwindcss/postcss', and anything on
  // Vite — including Nuxt — uses this. Same version as the compiler itself, which Tailwind ships
  // in lockstep. Verified on 2026-08-01.
  '@tailwindcss/vite': '4.3.3',
  // MUI 9 peers React ^19 and both emotion packages, which are its default style engine.
  // `@mui/material-pigment-css` is also listed as a peer but is optional — it is the alternative
  // zero-runtime engine, and installing both would ship two styling systems in one project.
  // Verified against the registry on 2026-07-30.
  '@mui/material': '9.2.0',
  '@emotion/react': '11.14.0',
  '@emotion/styled': '11.14.1',

  // ── UI: state ─────────────────────────────────────────────────────────────
  zustand: '5.0.14',
  '@tanstack/react-query': '5.101.4',
  // Redux Toolkit peers react-redux ^9, and react-redux 9 peers React ^18||^19 — both satisfied
  // by the pinned React 19.2.8. Verified against the registry on 2026-07-30.
  '@reduxjs/toolkit': '2.12.0',
  'react-redux': '9.3.0',

  // ── UI: state for Vue (P2.4, doc 00 §5.1) ─────────────────────────────────
  // Four wizard options collapse onto three implementations here. Zustand and Redux Toolkit both
  // map to Pinia — Vue has one idiomatic store, and manufacturing a second to honour a table row
  // would ship a worse project than admitting the mapping.
  // 4.0.3 / 1.0.2, moved on 2026-09-10. The previous pair (4.0.2 / 1.0.1) rendered every Nuxt
  // page as a 500: the module's `app:rendered` hook read `useNuxtApp().$pinia` and found it
  // undefined, after Nuxt's floating context packages (unctx 3.0.1, @nuxt/kit 4.5.2, unhead 3.4)
  // moved under the exact pin. Install, lint, typecheck and build all passed; only a request
  // failed — which is why the smoke harness boots what it builds. The module's 1.0.2 peers on
  // pinia ^4.0.3, so the two move together.
  pinia: '4.0.3',
  '@pinia/nuxt': '1.0.2',
  // Same version as the React query client, which TanStack releases in lockstep across adapters.
  // Verified on 2026-08-01.
  '@tanstack/vue-query': '5.101.4',

  // ── UI: forms ─────────────────────────────────────────────────────────────
  'react-hook-form': '7.83.0',
  '@hookform/resolvers': '5.5.7',

  // ── API: Node runtime (P1 spine) ──────────────────────────────────────────
  fastify: '5.10.0',
  '@fastify/swagger': '9.8.1',
  '@scalar/fastify-api-reference': '1.63.0',
  'fastify-type-provider-zod': '7.0.0',
  'zod-to-json-schema': '3.25.2',
  pino: '10.3.1',
  'pino-pretty': '13.1.3',
  tsx: '4.23.1',
  '@fastify/cors': '11.3.0',
  '@fastify/rate-limit': '11.1.0',
  '@fastify/jwt': '10.2.1',

  // ── API: GraphQL paradigm (P3) ───────────────────────────────────────────
  // Apollo Server **5**, not the 4 the plan names: 5 is the current major and 4 left support in
  // 2026. It peers on graphql ^16.11, so graphql stays on the 16 line even though 17 has shipped —
  // the resolver crashes with ERESOLVE otherwise. The Fastify integration is Apollo's own.
  // Verified on 2026-09-10; the full set resolves on npm 10.9 alongside the Node runtime pins.
  '@apollo/server': '5.5.1',
  '@as-integrations/fastify': '3.1.0',
  graphql: '16.14.2',
  '@graphql-tools/schema': '10.1.1',
  dataloader: '2.2.3',
  // Schema → resolver types. Dev-only: the running service imports only the emitted .ts file.
  '@graphql-codegen/cli': '7.4.0',
  '@graphql-codegen/typescript': '6.1.0',
  '@graphql-codegen/typescript-resolvers': '6.1.0',

  // ── API: tRPC paradigm (P3) ──────────────────────────────────────────────
  // v11, whose React integration is `@trpc/tanstack-react-query` — the `@trpc/react-query` package
  // the plan names is the v10 one. Peers on @tanstack/react-query ^5.80, satisfied by the pin
  // above. Verified on 2026-09-10; resolves alongside both the Node runtime and the web pins.
  '@trpc/server': '11.18.0',
  '@trpc/client': '11.18.0',
  '@trpc/tanstack-react-query': '11.18.0',

  // ── API: Redis cache layer (P3, `api.cache`) ─────────────────────────────
  // The cache-aside helper, the readiness check and — when both are selected — the rate limiter's
  // shared counters. 6.0.0 keeps the CommonJS entry the runtime imports; it needs Node 20, which
  // every generated project exceeds. Verified on 2026-09-10.
  ioredis: '6.0.0',

  // ── API: data ─────────────────────────────────────────────────────────────
  prisma: '7.9.1',
  '@prisma/client': '7.9.1',
  '@prisma/adapter-pg': '7.9.1',
  pg: '8.22.0',
  '@types/pg': '8.20.0',
  // The second Node ORM (P3). drizzle-orm is the runtime, drizzle-kit the CLI that generates and
  // applies SQL migrations from the TypeScript schema — kit is a devDependency because the
  // running service never migrates itself.
  'drizzle-orm': '0.45.2',
  'drizzle-kit': '0.31.10',

  // ── API: billing (P2 stripeBilling) ───────────────────────────────────────
  // The SDK is not optional for this module: verifying a webhook signature means recomputing an
  // HMAC over the raw body against a tolerance window, and `stripe.webhooks.constructEvent` is
  // the implementation everyone should be using rather than a hand-rolled one.
  // Verified on 2026-07-31.
  stripe: '22.4.0',
} as const satisfies Record<string, string>;

export type GeneratedPackage = keyof typeof GENERATED_VERSIONS;

/**
 * The same manifest for PyPI, kept separate rather than merged into GENERATED_VERSIONS.
 *
 * Two reasons, and the first is not the obvious one. Package names are not unique *across*
 * registries — `httpx`, `ruff` and `uvicorn` all have unrelated npm packages — so one flat map
 * would resolve a Python pin against the npm registry and cheerfully report that it exists.
 * The nightly version check would pass while pinning the wrong software entirely.
 *
 * The second is that Python's version grammar is not semver. `2.13.4` looks the same, but PEP 440
 * also permits `1.0.post1` and `2.0.0rc1`, which the semver regex in check-versions.mjs rejects.
 * A separate map lets that script apply the right grammar to each.
 *
 * All values verified against PyPI on 2026-08-04.
 */
export const PYTHON_VERSIONS = {
  // ── API: FastAPI (P3) ─────────────────────────────────────────────────────
  fastapi: '0.141.1',
  // Not `uvicorn[standard]`. The extras bracket is install syntax, not a package name, and PyPI
  // has no such project to resolve. The extras are requested where the dependency is declared.
  uvicorn: '0.52.1',
  // v2, per the roadmap. v1 and v2 differ enough that `from pydantic import BaseModel` is about
  // the only line they share, and FastAPI 0.141 requires v2 regardless.
  pydantic: '2.13.4',
  // Split out of pydantic in v2. This is the analogue of the Zod schema in `src/config/env.ts` —
  // it validates the environment once at import and fails the process at boot with the key named.
  'pydantic-settings': '2.14.2',
  // Pinned directly for the plain-SQLAlchemy ORM option. The sqlmodel option pulls it in
  // transitively, but a transitive pin is not a pin — sqlmodel could float its constraint and
  // two generations of the same spec would resolve different SQLAlchemy versions.
  sqlalchemy: '2.0.51',
  // Linter and formatter in one binary, which is why the generated project has no separate black
  // or isort. Ruff is pre-1.0 and does make breaking changes in minor releases, so the pin is
  // exact for the same reason every other pin here is.
  ruff: '0.16.1',
  // The package manager, pinned even though it is never installed *into* the project: the
  // Dockerfile copies this exact tag from ghcr.io/astral-sh/uv, and the tag and the PyPI release
  // are cut from the same commit. Pinning it here is what puts it in front of the nightly check —
  // an image tag inlined in a template is a version nothing verifies.
  uv: '0.12.1',
  pytest: '9.1.1',
  // FastAPI's TestClient is a thin wrapper over httpx, and importing it without httpx installed
  // raises at import time rather than at first use.
  httpx: '0.28.1',

  // ── API: middleware ───────────────────────────────────────────────────────
  // The distribution is `PyJWT`; the import is `jwt`. Both names exist on PyPI and they are
  // different projects — `jwt` is an unrelated, far less used library — so installing the wrong
  // one produces a service that imports successfully and verifies nothing the same way.
  PyJWT: '2.13.0',

  // ── API: SQLModel (P3) ────────────────────────────────────────────────────
  // SQLModel is SQLAlchemy plus Pydantic, so one class is both the table and the request model.
  // Still 0.0.x and it does move, which is why the pin is exact.
  sqlmodel: '0.0.39',
  // Migrations. SQLModel has no migration tool of its own — it is SQLAlchemy underneath, and this
  // is SQLAlchemy's. Without it, schema changes reach production as `create_all`, which never
  // alters an existing table and so silently does nothing.
  alembic: '1.18.5',
  // The async Postgres driver SQLAlchemy 2 drives. `psycopg` would also work but the async story
  // is newer; asyncpg is what `postgresql+asyncpg://` in the generated URL expects.
  asyncpg: '0.31.0',

  // ── API: GraphQL paradigm (P3) ───────────────────────────────────────────
  // Code-first, the way Pydantic is for REST: the Python types are the schema, and
  // `strawberry export-schema` prints the SDL the other runtimes keep as a file. Declared with the
  // [fastapi] extra where it is required. Verified against PyPI on 2026-09-10.
  'strawberry-graphql': '0.327.7',

  // ── API: Redis cache layer (P3) ──────────────────────────────────────────
  // redis-py's asyncio client. Verified against PyPI on 2026-09-10.
  redis: '8.1.0',
} as const satisfies Record<string, string>;

export type PythonPackage = keyof typeof PYTHON_VERSIONS;

/**
 * Go modules, resolved against proxy.golang.org rather than npm or PyPI — the third registry,
 * kept separate for the same two reasons the Python map is (see PYTHON_VERSIONS): module paths
 * are meaningless on the other registries, and Go's `v`-prefixed pseudo-semver fails both other
 * version grammars.
 *
 * All values verified against the Go module proxy on 2026-08-04.
 */
export const GO_VERSIONS = {
  // ── API: Gin (P3) ─────────────────────────────────────────────────────────
  'github.com/gin-gonic/gin': 'v1.12.0',
  // The schema-first layer on top of Gin. Go has no FastAPI: Gin alone validates nothing and
  // documents nothing, and the mainstream alternative — swag annotations in comments — is a
  // hand-maintained document wearing a generated one's clothes. huma derives validation and the
  // OpenAPI 3.1 document from the same Go structs, which is the property the other two runtimes
  // are built around.
  'github.com/danielgtaylor/huma/v2': 'v2.39.1',
  // ── API: auth ─────────────────────────────────────────────────────────────
  'github.com/golang-jwt/jwt/v5': 'v5.3.1',
  // Already inside every gin project transitively — gin's binding runs it on struct tags. The
  // validation middleware imports it directly to translate its error type, and Go requires a
  // direct import to be a direct requirement.
  'github.com/go-playground/validator/v10': 'v10.30.3',
  // ── API: GORM + goose (P3) ────────────────────────────────────────────────
  'gorm.io/gorm': 'v1.31.2',
  'gorm.io/driver/postgres': 'v1.6.2',
  // Versioned SQL migrations, embedded in the binary. GORM's own AutoMigrate only ever adds —
  // it will not drop a column, tighten a type or backfill data — so it degrades from "the
  // migration tool" to "a trap" the first time a schema change is destructive. goose runs plain
  // SQL files with an Up and a Down, which is the same posture Alembic and Prisma take.
  'github.com/pressly/goose/v3': 'v3.27.3',
  // ── API: GraphQL paradigm (P3) ───────────────────────────────────────────
  // graph-gophers rather than gqlgen, for the reason that gated sqlc: gqlgen is a code generator,
  // and the portal renders projects in memory with no Go toolchain to run one. graph-gophers is
  // schema-first without generation — the SDL is parsed at start-up and bound to resolver methods
  // by name. Verified against the module proxy on 2026-09-10.
  'github.com/graph-gophers/graphql-go': 'v1.10.2',
  // ── API: Redis cache layer (P3) ──────────────────────────────────────────
  'github.com/redis/go-redis/v9': 'v9.22.0',
} as const satisfies Record<string, `v${string}`>;

export type GoModule = keyof typeof GO_VERSIONS;

/** Looks up a pinned Go module version, failing loudly if the module is unknown. */
export function goVersion(module: GoModule): string {
  const v = GO_VERSIONS[module];
  if (!v) {
    throw new Error(
      `No pinned version for the Go module "${module}". Add it to GO_VERSIONS in ` +
        `packages/core/src/versions.ts rather than inlining a version in a template.`,
    );
  }
  return v;
}

/** Renders `module vX.Y.Z` lines for a go.mod require block. */
export function goRequirements(modules: readonly GoModule[]): string[] {
  return modules.map((module) => `${module} ${goVersion(module)}`);
}

/** Looks up a pinned PyPI version, failing loudly if the package is unknown. */
export function pythonVersion(pkg: PythonPackage): string {
  const v = PYTHON_VERSIONS[pkg];
  if (!v) {
    throw new Error(
      `No pinned version for the Python package "${pkg}". Add it to PYTHON_VERSIONS in ` +
        `packages/core/src/versions.ts rather than inlining a version in a template.`,
    );
  }
  return v;
}

/**
 * Renders PEP 508 requirement strings for a `pyproject.toml` dependency array.
 *
 * `==` rather than `>=` or `~=`: the whole manifest exists so that two runs of the same spec
 * produce the same project (doc 05 §6), and a compatible-release clause reintroduces exactly the
 * drift the pins remove.
 */
export function pythonRequirements(
  packages: readonly (PythonPackage | [PythonPackage, string])[],
): string[] {
  return packages.map((entry) => {
    const [pkg, extras] = Array.isArray(entry) ? entry : [entry, ''];
    return `${pkg}${extras}==${pythonVersion(pkg)}`;
  });
}

/**
 * Looks up a pinned version, failing loudly if the package is unknown.
 *
 * Templates must never inline a version literal — an unpinned dependency silently
 * reintroduces non-determinism, and the golden tests would only catch it much later.
 */
export function version(pkg: GeneratedPackage): string {
  const v = GENERATED_VERSIONS[pkg];
  if (!v) {
    throw new Error(
      `No pinned version for "${pkg}". Add it to packages/core/src/versions.ts and docs/VERSIONS.md ` +
        `rather than inlining a version in a template.`,
    );
  }
  return v;
}

/** Builds a dependency map for a package.json, resolving every name through the manifest. */
export function dependencyMap(packages: readonly GeneratedPackage[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pkg of packages) {
    out[pkg] = version(pkg);
  }
  return out;
}
