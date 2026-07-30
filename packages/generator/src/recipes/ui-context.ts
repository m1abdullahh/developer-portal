/**
 * React Context state recipe.
 *
 * The only state option that adds no dependency, which is exactly its appeal for a small project.
 * `resolveState` returns an empty package list here, so `packageJson` is omitted entirely rather
 * than contributing an empty object — the merge report should not record a decision nobody made.
 */

import { templatePath } from '@idp/templates';
import { isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { PROVIDER_PRIORITY } from '../codemod/providers.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import type { Recipe } from '../types.js';

export const CONTEXT_RECIPE_ID = 'ui.state.context';

export const contextRecipe: Recipe = {
  id: CONTEXT_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  // Whichever framework the spec chose — see framework-contract.ts.
  requires: requiresFramework,

  // React only. Nuxt maps this option to provide/inject composables via a separate recipe.
  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.state === 'context' && !isVueFramework(spec.ui.framework),

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'state', 'context'), ctx, CONTEXT_RECIPE_ID, {
      framework: frameworkContract(ctx.spec),
    }),

  codemods: (ctx) => [
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
      'Client state uses React Context with `useReducer` — no state library, no extra dependency.',
      '',
      'State and dispatch are exposed as **two** contexts. A component that only dispatches, like',
      'a theme toggle, subscribes to the dispatch context alone and does not re-render when state',
      'it never reads changes. A single combined context re-renders every consumer on every',
      'update, which is where Context earns its reputation for being slow.',
      '',
      'Use `useUiState()`, `useUiDispatch()`, or `useTheme()` for the common case.',
      '',
      'If you later need server-state caching — request deduplication, background refetching —',
      'reach for TanStack Query rather than growing this reducer to cover it.',
    ].join('\n'),
  }),
};
