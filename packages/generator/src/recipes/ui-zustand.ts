/**
 * Zustand client-state recipe.
 *
 * Demonstrates the codemod path end to end: the framework recipe owns `app/layout.tsx`, and
 * this recipe wraps its `{children}` without touching the template — the composition model's
 * whole reason for existing.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, isVueFramework, resolveState, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { PROVIDER_PRIORITY } from '../codemod/providers.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import type { Recipe } from '../types.js';

export const ZUSTAND_RECIPE_ID = 'ui.state.zustand';

export const zustandRecipe: Recipe = {
  id: ZUSTAND_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  // Whichever framework the spec chose — see framework-contract.ts.
  requires: requiresFramework,

  // React frameworks only. Selecting Nuxt maps this option to Pinia via a separate recipe —
  // resolveState() is the single source of that mapping (doc 00 §5.1).
  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.state === 'zustand' && !isVueFramework(spec.ui.framework),

  files: (ctx) => loadTemplateDir(templatePath('ui', 'state', 'zustand'), ctx, ZUSTAND_RECIPE_ID),

  packageJson: (ctx) => {
    // Package names come from the compatibility layer rather than being hardcoded, so the
    // React/Vue mapping can never drift between what the wizard promises and what is installed.
    const resolved = resolveState(ctx.spec.ui!.framework, 'zustand');
    return { dependencies: dependencyMap(resolved.packages as never[]) };
  },

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
      'Client state uses [Zustand](https://zustand.docs.pmnd.rs/). Stores live in `stores/`.',
      '',
      'The store is a module singleton, so there is no context provider to configure.',
      '`StoreProvider` exists only to apply persisted UI state (the `dark` class) to the DOM',
      'after hydration.',
      '',
      'Theme preference persists to localStorage; sidebar state deliberately does not, since',
      'restoring it across sessions and screen sizes is more disorienting than helpful.',
    ].join('\n'),
  }),
};
