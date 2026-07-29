/**
 * Redux Toolkit client-state recipe.
 *
 * Same contract as the Zustand recipe — contribute files, declare packages through the
 * compatibility layer, wrap `{children}` via a codemod — so the two are interchangeable from the
 * framework recipe's point of view. That interchangeability is the entire argument for recipe
 * composition over per-combination templates.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, isVueFramework, resolveState, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { PROVIDER_PRIORITY } from '../codemod/providers.js';
import { NEXTJS_APP_RECIPE_ID } from './ui-nextjs-app.js';
import type { Recipe } from '../types.js';

export const REDUX_TOOLKIT_RECIPE_ID = 'ui.state.redux-toolkit';

export const reduxToolkitRecipe: Recipe = {
  id: REDUX_TOOLKIT_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  requires: [NEXTJS_APP_RECIPE_ID],

  // React only. Nuxt maps this option to Pinia's module pattern through a separate recipe;
  // resolveState() is the single source of that mapping (doc 00 §5.1).
  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.state === 'redux-toolkit' && !isVueFramework(spec.ui.framework),

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'state', 'redux-toolkit'), ctx, REDUX_TOOLKIT_RECIPE_ID),

  packageJson: (ctx) => {
    const resolved = resolveState(ctx.spec.ui!.framework, 'redux-toolkit');
    return { dependencies: dependencyMap(resolved.packages as never[]) };
  },

  codemods: () => [
    {
      file: 'app/layout.tsx',
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
      'Client state uses [Redux Toolkit](https://redux-toolkit.js.org/). Slices live in `stores/`.',
      '',
      'Import the typed hooks from `stores/hooks.ts` rather than react-redux directly — the',
      'untyped `useSelector` gives you `unknown`, so a mistyped field name compiles cleanly and',
      'fails at runtime.',
      '',
      '`makeStore()` is a factory, not a singleton. A shared store would be reused across server',
      "requests, leaking one user's state into another's render.",
      '',
      'Theme preference persists to localStorage; sidebar state deliberately does not.',
    ].join('\n'),
  }),
};
