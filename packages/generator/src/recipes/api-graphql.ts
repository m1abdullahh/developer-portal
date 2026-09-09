/**
 * GraphQL — schema-first, with the N+1 guard built in.
 *
 * The second paradigm, and the first to exist beside REST rather than instead of the middleware:
 * everything registered at the `plugins` marker (logging, CORS, rate limiting, auth) still runs in
 * front of `/graphql`, because the endpoint is mounted at the `routes` marker like any other route.
 *
 * ── Apollo Server 5, not 4 ───────────────────────────────────────────────────
 * The plan names Apollo Server 4 (doc 03 §2.2). 5 is the current major and 4 left support in 2026;
 * the integration surface this recipe uses — `ApolloServer`, the Fastify plugin, the landing-page
 * plugins — is unchanged between them. The version pin and the reason live in
 * packages/core/src/versions.ts.
 *
 * ── Schema-first, and why the SDL is a file ──────────────────────────────────
 * `schema.graphql` at the package root is the contract: codegen derives the resolver types from
 * it, the server loads it at start-up, `GET /schema.graphql` serves it verbatim, and the Service
 * Catalog reads the API's shape from that path (doc 07 §4). One file, four consumers, so the
 * schema cannot drift from what the server runs. Page modules extend it through a marker region
 * rather than editing the base types.
 *
 * ── DataLoader by default ────────────────────────────────────────────────────
 * Every generated GraphQL service that lacks it ships an N+1: one list field, one query per row.
 * Loaders are created per request in `src/graphql/loaders.ts` and reach resolvers through the
 * context. With Prisma selected, the example model is wired end to end so the pattern is
 * demonstrated rather than described; without a database the wiring is present and the region
 * for module loaders is empty.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, goRequirements, pythonRequirements, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { MIDDLEWARE_PRIORITY } from '../codemod/markers.js';
import { NODE_TS_RECIPE_ID } from './api-node-ts.js';
import { PRISMA_RECIPE_ID } from './api-prisma.js';
import { PYTHON_FASTAPI_RECIPE_ID } from './api-python-fastapi.js';
import { GO_GIN_RECIPE_ID, GO_PORT } from './api-go-gin.js';
import type { Recipe } from '../types.js';

export const GRAPHQL_RECIPE_ID = 'api.paradigm.graphql';

export const graphqlRecipe: Recipe = {
  id: GRAPHQL_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  // Prisma joins the requirement only when selected: the loaders and resolvers import the client
  // singleton for the example model, and `requires` is what guarantees that file exists first.
  requires: (spec: ProjectSpec) =>
    spec.api?.orm === 'prisma' ? [NODE_TS_RECIPE_ID, PRISMA_RECIPE_ID] : [NODE_TS_RECIPE_ID],

  appliesTo: (spec: ProjectSpec) =>
    spec.api?.paradigm === 'graphql' && spec.api.runtime === 'node-ts',

  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'paradigm', 'graphql'), ctx, GRAPHQL_RECIPE_ID),

  packageJson: () => ({
    dependencies: dependencyMap([
      '@apollo/server',
      '@as-integrations/fastify',
      'graphql',
      '@graphql-tools/schema',
      'dataloader',
    ]),
    devDependencies: dependencyMap([
      '@graphql-codegen/cli',
      '@graphql-codegen/typescript',
      '@graphql-codegen/typescript-resolvers',
    ]),
    scripts: {
      codegen: 'graphql-codegen --config codegen.ts',
      // On install rather than in `build`: the runtime recipe owns `build` and `typecheck`, and a
      // second definition of either is a script collision the merge stage rejects. `postinstall`
      // means a fresh clone typechecks and lints without a separate step; the container image,
      // which installs with --ignore-scripts, runs `npm run codegen` explicitly instead.
      postinstall: 'npm run codegen',
    },
  }),

  // Generated from the schema on every install; committing it would only invite drift.
  gitignore: () => ['src/generated/graphql/'],

  codemods: () => [
    {
      file: 'src/server.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'routes',
        // A route, not a plugin: it must land after every middleware in the `plugins` region so
        // CORS answers preflights and the rate limiter counts operations before Apollo sees them.
        lines: ['await registerGraphql(app);'],
        priority: MIDDLEWARE_PRIORITY.routes,
        recipeId: GRAPHQL_RECIPE_ID,
      },
    },
    {
      file: 'src/server.ts',
      kind: 'addImport',
      args: { module: './plugins/graphql.js', named: ['registerGraphql'] },
    },
  ],

  readme: (ctx) => ({
    order: README_ORDER.backend,
    heading: 'GraphQL API',
    body: [
      '| Path | What |',
      '| --- | --- |',
      '| `POST /graphql` | The API — one endpoint, every operation |',
      '| `GET /graphql` | Apollo Sandbox, in development only |',
      '| `GET /schema.graphql` | The schema, served verbatim |',
      '',
      'Schema-first. `schema.graphql` is the contract: `npm run codegen` (also run by `postinstall`)',
      'derives the resolver types in `src/generated/graphql/`, so a resolver that disagrees with the',
      'schema is a compile error rather than a runtime surprise. Add types and fields to the schema,',
      'run codegen, and the `Resolvers` type tells you exactly what is left to implement.',
      '',
      '```graphql',
      'extend type Query {',
      '  widgets(limit: Int = 20): [Widget!]!',
      '}',
      '```',
      '',
      '**Loaders.** `src/graphql/loaders.ts` creates a fresh set of DataLoaders per request and the',
      'context carries them to every resolver. Load by key through a loader and N resolvers in one',
      'operation cost one query; skip it and a list of 50 rows becomes 51 queries — the N+1 every',
      'hand-written GraphQL service ships at least once.',
      ...(ctx.spec.api?.middleware.auth === 'jwt'
        ? [
            '',
            '**Authentication is per resolver, not per endpoint.** A bearer token is verified when the',
            'context is built and lands in `ctx.user`, or `null` for an anonymous caller. Call',
            '`requireUser(ctx)` at the top of any resolver that needs a signed-in user; it throws',
            '`UNAUTHENTICATED`, which clients receive as a 401.',
          ]
        : []),
      '',
      'Introspection and the sandbox are off in production. `/schema.graphql` is a contract: the',
      'Service Catalog reads the API’s shape from exactly that path, so changing it removes this',
      'service’s schema from the portal.',
    ].join('\n'),
  }),
};

export const GRAPHQL_PYTHON_RECIPE_ID = 'api.paradigm.graphql-python';

/**
 * The same paradigm for FastAPI, via Strawberry.
 *
 * Code-first rather than schema-first, and deliberately so: under REST the Pydantic models are
 * the OpenAPI document, and under GraphQL the Strawberry types are the schema. There is no SDL
 * file because there is nothing a file would add except a second definition to keep in sync.
 * `GET /schema.graphql` prints the schema the server is running, which is what the catalog reads.
 *
 * The middleware contract holds: `optional_user` (added to the JWT middleware for this recipe)
 * gives resolvers the caller without turning /graphql into a guarded route, and the router is
 * mounted through the `routes` region so logging, CORS and rate limiting run in front of it.
 */
export const graphqlPythonRecipe: Recipe = {
  id: GRAPHQL_PYTHON_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [PYTHON_FASTAPI_RECIPE_ID],

  appliesTo: (spec: ProjectSpec) =>
    spec.api?.paradigm === 'graphql' && spec.api.runtime === 'python-fastapi',

  files: (ctx) =>
    loadTemplateDir(
      templatePath('api', 'paradigm', 'graphql-python'),
      ctx,
      GRAPHQL_PYTHON_RECIPE_ID,
    ),

  codemods: () => [
    {
      file: 'pyproject.toml',
      kind: 'insertAtMarker',
      args: {
        marker: 'dependencies',
        lines: pythonRequirements([['strawberry-graphql', '[fastapi]']]).map((r) => `"${r}",`),
        priority: 30,
        recipeId: GRAPHQL_PYTHON_RECIPE_ID,
      },
    },
    {
      file: 'app/main.py',
      kind: 'insertAtMarker',
      args: {
        marker: 'routes',
        lines: [
          'from app.graphql.router import router as graphql_router',
          '',
          'app.include_router(graphql_router)',
        ],
        priority: MIDDLEWARE_PRIORITY.routes,
        recipeId: GRAPHQL_PYTHON_RECIPE_ID,
      },
    },
  ],

  readme: (ctx) => ({
    order: README_ORDER.backend,
    heading: 'GraphQL API',
    body: [
      '| Path | What |',
      '| --- | --- |',
      '| `POST /graphql` | The API — one endpoint, every operation |',
      '| `GET /graphql` | GraphiQL, in development only |',
      '| `GET /schema.graphql` | The schema the server is running, as SDL |',
      '',
      'Code-first with [Strawberry](https://strawberry.rocks): the types in `app/graphql/schema.py`',
      '*are* the schema, the way the Pydantic models are the OpenAPI document under REST. Add a',
      '`@strawberry.field` to `Query` and it is in the schema, typed, with nothing to keep in sync.',
      'For a copy as a file: `uv run strawberry export-schema app.graphql.schema:schema`.',
      '',
      '**Loaders.** `app/graphql/context.py` builds a fresh `Loaders` per request and every resolver',
      'reaches them through `info.context.loaders`. Load by key through a',
      '`strawberry.dataloader.DataLoader` and N resolvers in one operation cost one query; skip it',
      'and a list of 50 rows becomes 51 queries — the N+1 every hand-written GraphQL service ships',
      'at least once.',
      ...(ctx.spec.api?.middleware.auth === 'jwt'
        ? [
            '',
            '**Authentication is per resolver, not per endpoint.** A bearer token is verified when the',
            'context is built and lands in `info.context.user`, or `None` for an anonymous caller. Call',
            '`require_user(info)` at the top of any resolver that needs a signed-in user; it raises',
            '`UNAUTHENTICATED` in the GraphQL error envelope.',
          ]
        : []),
      '',
      'Introspection, GraphiQL and detailed error messages are off in production. `/schema.graphql`',
      'is a contract: the Service Catalog reads the API’s shape from exactly that path, so changing',
      'it removes this service’s schema from the portal.',
    ].join('\n'),
  }),
};

export const GRAPHQL_GO_RECIPE_ID = 'api.paradigm.graphql-go';

const modulePath = (spec: ProjectSpec): string =>
  `github.com/${spec.meta.repo.org}/${spec.meta.slug}`;

/**
 * The same paradigm for Gin, via graph-gophers/graphql-go.
 *
 * Not gqlgen, which the plan names (doc 03 §2.2), and the reason is the one that gated sqlc: gqlgen
 * is a code generator, and the portal renders projects in memory with no Go toolchain to run one.
 * graph-gophers is schema-first without generation — the embedded SDL is parsed at start-up and
 * bound to resolver methods by name — which keeps the property the other two runtimes have: one
 * schema file, and a resolver that disagrees with it fails loudly rather than silently.
 *
 * Loaders are wired the same way as the other runtimes, but no model is batched: the GORM recipe
 * ships a baseline migration and no example table, so there is nothing to load by key yet. The
 * dataloader module is therefore not a dependency until a module adds a loader that needs one.
 */
export const graphqlGoRecipe: Recipe = {
  id: GRAPHQL_GO_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [GO_GIN_RECIPE_ID],

  appliesTo: (spec: ProjectSpec) =>
    spec.api?.paradigm === 'graphql' && spec.api.runtime === 'go-gin',

  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'paradigm', 'graphql-go'), ctx, GRAPHQL_GO_RECIPE_ID, {
      runtime: { port: GO_PORT },
    }),

  codemods: (ctx) => [
    {
      file: 'go.mod',
      kind: 'insertAtMarker',
      args: {
        marker: 'dependencies',
        lines: goRequirements(['github.com/graph-gophers/graphql-go']),
        priority: MIDDLEWARE_PRIORITY.routes,
        recipeId: GRAPHQL_GO_RECIPE_ID,
      },
    },
    {
      file: 'internal/server/server.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'routes',
        lines: ['graphql.Install(r, cfg)'],
        priority: MIDDLEWARE_PRIORITY.routes,
        recipeId: GRAPHQL_GO_RECIPE_ID,
      },
    },
    {
      file: 'internal/server/server.go',
      kind: 'insertAtMarker',
      args: {
        marker: 'imports',
        lines: [`"${modulePath(ctx.spec)}/internal/graphql"`],
        priority: MIDDLEWARE_PRIORITY.routes,
        recipeId: GRAPHQL_GO_RECIPE_ID,
      },
    },
  ],

  readme: (ctx) => ({
    order: README_ORDER.backend,
    heading: 'GraphQL API',
    body: [
      '| Path | What |',
      '| --- | --- |',
      '| `POST /graphql` | The API — one endpoint, every operation |',
      '| `GET /graphql` | GraphiQL, in development only |',
      '| `GET /schema.graphql` | The schema, served verbatim |',
      '',
      'Schema-first with [graph-gophers/graphql-go](https://github.com/graph-gophers/graphql-go):',
      '`internal/graphql/schema.graphql` is the contract, embedded into the binary and bound to the',
      'methods of `Resolver` by name at start-up. Add a field to the schema without a method and the',
      'server refuses to start, naming the field — and `go test ./...` catches the same thing.',
      '',
      '```graphql',
      'extend type Query {',
      '  widgets(limit: Int = 20): [Widget!]!',
      '}',
      '```',
      '',
      '```go',
      'func (r *Resolver) Widgets(ctx context.Context, args struct{ Limit *int32 }) ([]*Widget, error)',
      '```',
      '',
      '**Loaders.** `internal/graphql/context.go` creates a fresh `Loaders` per request and every',
      'resolver reaches them with `LoadersFrom(ctx)`. Batch lookups by key through',
      '`github.com/graph-gophers/dataloader` and N resolvers in one operation cost one query; skip it',
      'and a list of 50 rows becomes 51 queries — the N+1 every hand-written GraphQL service ships',
      'at least once.',
      ...(ctx.spec.api?.middleware.auth === 'jwt'
        ? [
            '',
            '**Authentication is per resolver, not per endpoint.** A bearer token is verified when the',
            'request context is built and is available through `RequireUser(ctx)`, which returns',
            '`ErrUnauthenticated` for an anonymous caller. Call it at the top of any resolver that needs',
            'a signed-in user.',
          ]
        : []),
      '',
      'Introspection and GraphiQL are off in production. `/schema.graphql` is a contract: the Service',
      'Catalog reads the API’s shape from exactly that path, so changing it removes this service’s',
      'schema from the portal.',
    ].join('\n'),
  }),
};
