/**
 * tRPC — end-to-end types with no schema step, on Node only (doc 00 §5.3).
 *
 * Two recipes, one per layer. The server one mounts the router on Fastify; the client one, for the
 * React frameworks, installs a typed client and its provider into the UI. The plan's `trpc`
 * option is the pair.
 *
 * ── How the router type crosses from the API to the UI ───────────────────────
 * tRPC's whole value is `import type { AppRouter }` in the client. In a workspace that is one
 * import; a generated repository is two independent apps with separate `node_modules`, and a
 * type-only import of the API's source from the web would still make TypeScript resolve every
 * package the router touches — Fastify, Prisma, the generated client — from the wrong tree, and
 * would break the per-app container build that copies only `apps/web`.
 *
 * So the API emits declarations instead. `npm run trpc:types` runs `tsc --emitDeclarationOnly` on
 * the router and copies the few files the type needs (the router, its init and context, the
 * shared permissions policy) into the web app. Declaration emit erases implementations, so the
 * copy references only `@trpc/server` and `zod`, both of which the web has. Procedures declare
 * `.output()` schemas for the same reason: an output inferred from a Prisma row would drag the
 * Prisma types across; one inferred from a Zod schema does not.
 *
 * The generator cannot run `tsc`, so at generation the web ships a placeholder declaring
 * `AppRouter` as `AnyRouter` — every call compiles, nothing is inferred — and the first
 * `npm run trpc:types` replaces it. The smoke harness runs that step before it typechecks the web,
 * and the generated CI regenerates them and warns when the committed copy is stale — a warning, not
 * a failure, because the scaffold commit itself carries the placeholder and must reach green.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { MIDDLEWARE_PRIORITY } from '../codemod/markers.js';
import { PROVIDER_PRIORITY } from '../codemod/providers.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import { NODE_TS_RECIPE_ID } from './api-node-ts.js';
import { PRISMA_RECIPE_ID } from './api-prisma.js';
import { REACT_QUERY_RECIPE_ID } from './ui-react-query.js';
import type { CodemodOp, EnvVar, Recipe } from '../types.js';

export const TRPC_RECIPE_ID = 'api.paradigm.trpc';
export const TRPC_CLIENT_RECIPE_ID = 'ui.client.trpc';

/** A React UI that can host the typed client. Nuxt gets the server and a note, not a client. */
export function trpcClientApplies(spec: ProjectSpec): boolean {
  return (
    spec.api?.paradigm === 'trpc' &&
    spec.api.runtime === 'node-ts' &&
    spec.ui !== null &&
    !isVueFramework(spec.ui.framework)
  );
}

/**
 * Where `npm run trpc:types` writes, relative to the API package.
 *
 * Into the web app's `lib/trpc/generated` when a React UI exists — the placeholder is emitted at
 * the same path, so the first run replaces it in place. Into `client-types/` inside the API
 * otherwise, as the artefact an out-of-repo consumer copies.
 */
export function trpcTypesTarget(spec: ProjectSpec): string {
  if (!trpcClientApplies(spec)) return 'client-types';
  return `../web/${frameworkContract(spec).sourceRoot}lib/trpc/generated`;
}

export const trpcRecipe: Recipe = {
  id: TRPC_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: (spec: ProjectSpec) =>
    spec.api?.orm === 'prisma' ? [NODE_TS_RECIPE_ID, PRISMA_RECIPE_ID] : [NODE_TS_RECIPE_ID],

  appliesTo: (spec: ProjectSpec) => spec.api?.paradigm === 'trpc' && spec.api.runtime === 'node-ts',

  files: (ctx) =>
    loadTemplateDir(templatePath('api', 'paradigm', 'trpc'), ctx, TRPC_RECIPE_ID, {
      typesTarget: trpcTypesTarget(ctx.spec),
      hasClient: trpcClientApplies(ctx.spec),
    }),

  packageJson: () => ({
    dependencies: dependencyMap(['@trpc/server']),
    scripts: {
      // Emits the router's declarations for the client — see the module comment.
      'trpc:types': 'tsc -p tsconfig.trpc.json && node scripts/trpc-types.mjs',
    },
  }),

  gitignore: () => ['.trpc-types/'],

  codemods: () => [
    {
      file: 'src/server.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'routes',
        // A route, not a plugin: every middleware in the `plugins` region runs in front of it.
        lines: ['await registerTrpc(app);'],
        priority: MIDDLEWARE_PRIORITY.routes,
        recipeId: TRPC_RECIPE_ID,
      },
    },
    {
      file: 'src/server.ts',
      kind: 'addImport',
      args: { module: './plugins/trpc.js', named: ['registerTrpc'] },
    },
  ],

  readme: (ctx) => ({
    order: README_ORDER.backend,
    heading: 'tRPC API',
    body: [
      '| Path | What |',
      '| --- | --- |',
      '| `/trpc/<procedure>` | Every procedure, over HTTP with request batching |',
      '',
      'Procedures live in `src/trpc/router.ts`. Each declares its input and output with Zod, so the',
      'server validates both and the client infers both — one definition, and nothing to keep in',
      'sync. Add a procedure to the router and it exists, typed, for every caller.',
      '',
      '```ts',
      'widgets: publicProcedure',
      '  .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))',
      '  .output(z.array(widgetSchema))',
      '  .query(({ input }) => listWidgets(input.limit)),',
      '```',
      '',
      ...(ctx.spec.api?.middleware.auth === 'jwt'
        ? [
            '**Authentication is per procedure.** `protectedProcedure` in `src/trpc/init.ts` rejects',
            'anonymous callers with `UNAUTHORIZED` and narrows `ctx.user` for everything built on it;',
            '`publicProcedure` serves anyone. The bearer token is verified when the context is built.',
            '',
          ]
        : []),
      ...(trpcClientApplies(ctx.spec)
        ? [
            '**The web app is typed against this router.** `npm run trpc:types` emits the router’s',
            `declarations into \`${trpcTypesTarget(ctx.spec)}\` — run it after changing a procedure and`,
            'commit the result. CI regenerates them and warns when the committed copy is stale, because',
            'a stale copy is a client typed against a previous API. Until the first run the web compiles',
            'against a placeholder that accepts any call and infers nothing.',
          ]
        : [
            '**Consumers are typed against this router.** `npm run trpc:types` emits its declarations',
            `into \`${trpcTypesTarget(ctx.spec)}/\`; a client in another repository copies that directory and`,
            'installs `@trpc/client`, `@trpc/server` and `zod` to get end-to-end types.',
          ]),
    ].join('\n'),
  }),
};

/** `NEXT_PUBLIC_API_URL` or `VITE_API_URL` — the same key the page modules declare. */
function apiUrlKey(spec: ProjectSpec): string {
  return `${frameworkContract(spec).publicEnvPrefix}API_URL`;
}

/**
 * The typed client for React frameworks.
 *
 * Rides on TanStack Query — tRPC's React integration is a set of query options for it — so a
 * project whose state option is `react-query` reuses its QueryProvider and client, and any other
 * project gets a QueryClient of its own inside the tRPC provider. The wizard's note about "React
 * Query will be added" (doc 03 §2.3) is this branch.
 */
export const trpcClientRecipe: Recipe = {
  id: TRPC_CLIENT_RECIPE_ID,
  // 'integration': cross-layer wiring, and the QueryProvider it may nest inside is a feature.
  phase: 'integration',
  layer: 'ui',
  requires: (spec: ProjectSpec) => [
    ...requiresFramework(spec),
    TRPC_RECIPE_ID,
    ...(spec.ui?.state === 'react-query' ? [REACT_QUERY_RECIPE_ID] : []),
  ],

  appliesTo: trpcClientApplies,

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'client', 'trpc'), ctx, TRPC_CLIENT_RECIPE_ID, {
      framework: frameworkContract(ctx.spec),
      apiUrlKey: apiUrlKey(ctx.spec),
      ownQueryClient: ctx.spec.ui?.state !== 'react-query',
    }),

  packageJson: () => ({
    dependencies: dependencyMap([
      '@trpc/client',
      '@trpc/tanstack-react-query',
      // Present already under the react-query state option; the merge stage deduplicates.
      '@tanstack/react-query',
    ]),
    // The emitted declarations import from these; the runtime bundle never does.
    devDependencies: dependencyMap(['@trpc/server']),
  }),

  env: (ctx): EnvVar[] => [
    {
      key: apiUrlKey(ctx.spec),
      example: 'http://localhost:3001',
      required: true,
      description:
        'Base URL of the API this page calls. Compiled into the bundle — never a secret.',
    },
  ],

  codemods: (ctx): CodemodOp[] => {
    const contract = frameworkContract(ctx.spec);
    const key = apiUrlKey(ctx.spec);
    return [
      {
        file: `${contract.sourceRoot}lib/env.ts`,
        kind: 'insertAtMarker',
        args: {
          marker: 'env-schema',
          // Byte-identical to the page modules' contribution, so the marker deduplicates it.
          lines: [`  ${key}: z.string().url('${key} must be an absolute URL'),`],
          priority: 10,
          recipeId: TRPC_CLIENT_RECIPE_ID,
        },
      },
      {
        file: contract.providerRoot,
        kind: 'wrapProvider',
        args: {
          component: 'TrpcProvider',
          priority: PROVIDER_PRIORITY.trpc,
          import: { module: '@/components/providers/TrpcProvider', named: ['TrpcProvider'] },
        },
      },
    ];
  },

  readme: (ctx) => ({
    order: README_ORDER.frontend,
    heading: 'API client (tRPC)',
    body: [
      'The API is called through a typed tRPC client — `useTRPC()` from `lib/trpc.ts` — on top of',
      'TanStack Query. Inputs and outputs are inferred from the server’s router, so a call that does',
      'not match a procedure is a compile error here, not a 400 in production.',
      '',
      '```tsx',
      "import { useQuery } from '@tanstack/react-query';",
      "import { useTRPC } from '@/lib/trpc';",
      '',
      'const trpc = useTRPC();',
      'const health = useQuery(trpc.health.queryOptions());',
      '```',
      '',
      `The types come from \`${frameworkContract(ctx.spec).sourceRoot}lib/trpc/generated/\`, emitted by \`npm run trpc:types\` in the API.`,
      'Until that has run once the file is a placeholder: every call compiles and nothing is',
      'inferred. Run it after changing the router and commit the result — CI warns when the copy is',
      'stale.',
      ...(ctx.spec.ui?.state === 'react-query'
        ? []
        : [
            '',
            'TanStack Query was added for the client. It is a server-state cache, orthogonal to the',
            'client store you chose; the two coexist and each does one job.',
          ]),
    ].join('\n'),
  }),
};
