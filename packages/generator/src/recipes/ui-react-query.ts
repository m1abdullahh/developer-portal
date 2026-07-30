/**
 * TanStack Query state recipe.
 *
 * Ships two providers, not one. TanStack Query is a *server*-state cache and deliberately not a
 * general store, so selecting it alone would leave a project with nowhere to put theme or sidebar
 * state. The companion context store fills that gap with no additional dependency (roadmap P2).
 *
 * The two wrap at different priorities: the query client must sit outside the client store,
 * because auth-shaped state kept in the store commonly issues queries during initialisation.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, isVueFramework, resolveState, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { PROVIDER_PRIORITY } from '../codemod/providers.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import type { Recipe } from '../types.js';

export const REACT_QUERY_RECIPE_ID = 'ui.state.react-query';

export const reactQueryRecipe: Recipe = {
  id: REACT_QUERY_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  // Whichever framework the spec chose — see framework-contract.ts.
  requires: requiresFramework,

  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.state === 'react-query' && !isVueFramework(spec.ui.framework),

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'state', 'react-query'), ctx, REACT_QUERY_RECIPE_ID),

  packageJson: (ctx) => {
    const resolved = resolveState(ctx.spec.ui!.framework, 'react-query');
    return { dependencies: dependencyMap(resolved.packages as never[]) };
  },

  codemods: (ctx) => [
    {
      file: frameworkContract(ctx.spec).providerRoot,
      kind: 'wrapProvider',
      args: {
        component: 'QueryProvider',
        priority: PROVIDER_PRIORITY.query,
        import: { module: '@/components/providers/QueryProvider', named: ['QueryProvider'] },
      },
    },
    {
      file: frameworkContract(ctx.spec).providerRoot,
      kind: 'wrapProvider',
      args: {
        component: 'StoreProvider',
        priority: PROVIDER_PRIORITY.store,
        import: { module: '@/components/providers/StoreProvider', named: ['StoreProvider'] },
      },
    },
  ],

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'State Management',
    body: [
      'Server state uses [TanStack Query](https://tanstack.com/query). Client state — theme and',
      'sidebar — lives in a small React context in `components/providers/StoreProvider.tsx`.',
      '',
      'That split is deliberate. Query is a cache: entries can be invalidated or garbage-collected',
      'underneath you, which is correct for fetched data and wrong for a theme preference.',
      '',
      'Defaults worth knowing: `staleTime` is 60s so a server-rendered page does not refetch',
      'everything on hydration, 4xx responses are not retried, and refetch-on-focus is off.',
    ].join('\n'),
  }),
};
