/**
 * State management for Vue (doc 00 §5.1).
 *
 * ── Four wizard options, three implementations ──────────────────────────────
 * The substitution table maps Zustand and Redux Toolkit onto the *same* thing — Pinia. This file
 * honours that literally: one recipe serves both options rather than two recipes emitting a store
 * and a slightly-more-ceremonious store. Vue has a single idiomatic store, and manufacturing a
 * second to mirror Redux's slice pattern would ship a worse project purely to make a table look
 * symmetrical. The wizard already relabels the option, so a user picking "Redux Toolkit" with Nuxt
 * is told they are getting Pinia.
 *
 *   zustand        ─┐
 *                   ├─> ui.state.pinia
 *   redux-toolkit  ─┘
 *   react-query     ──> ui.state.vue-query   (+ a useState companion for client state)
 *   context         ──> ui.state.vue-state   (Nuxt useState, zero dependencies)
 *
 * ── None of them wrap anything ──────────────────────────────────────────────
 * Every React state recipe emits a `StoreProvider` and a codemod wraps `{children}` in it. Here
 * Pinia is a Nuxt module named in `nuxt.config.ts`, vue-query is a plugin file, and the zero-
 * dependency option is a composable. That is what `providerInstall: 'nuxt-plugin'` means, and it
 * is why these recipes contribute markers and files rather than codemods against a component.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import type { CodemodOp, Recipe } from '../types.js';

const isVue = (spec: ProjectSpec): boolean => spec.ui !== null && isVueFramework(spec.ui.framework);

export const PINIA_RECIPE_ID = 'ui.state.pinia';
export const VUE_QUERY_RECIPE_ID = 'ui.state.vue-query';
export const VUE_STATE_RECIPE_ID = 'ui.state.vue-state';

export const piniaRecipe: Recipe = {
  id: PINIA_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  requires: requiresFramework,

  // Both options, one implementation. See the note at the top of this file.
  appliesTo: (spec) =>
    isVue(spec) && (spec.ui!.state === 'zustand' || spec.ui!.state === 'redux-toolkit'),

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'state', 'pinia'), ctx, PINIA_RECIPE_ID, {
      framework: frameworkContract(ctx.spec),
    }),

  packageJson: () => ({
    dependencies: dependencyMap(['pinia']),
    devDependencies: dependencyMap(['@pinia/nuxt']),
  }),

  codemods: (): CodemodOp[] => [
    {
      // A Nuxt module, not a provider component. It registers Pinia, auto-imports `defineStore`
      // and every store under `app/stores/`, and handles serialising state into the SSR payload —
      // none of which a hand-written plugin would do.
      file: 'nuxt.config.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'nuxt-modules',
        lines: ["    '@pinia/nuxt',"],
        priority: 10,
        recipeId: PINIA_RECIPE_ID,
      },
    },
  ],

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'State',
    body: [
      'Pinia, registered through `@pinia/nuxt`. Stores live in `app/stores/` and are auto-imported,',
      'so a component calls `useUiStore()` with no import statement.',
      '',
      '**Both the Zustand and the Redux Toolkit options produce this.** Vue has one idiomatic',
      'store, and the wizard relabels the option accordingly — there is no second, more',
      'ceremonious store standing in for Redux slices.',
      '',
      '`app/stores/ui.ts` is a setup store: the function form reads like a composable, which is',
      'what the Pinia docs lead with. The options form exists mainly for Vuex migrations.',
      '',
      'Theme is persisted to `localStorage`, guarded by `import.meta.client` — the store is',
      'instantiated during server rendering too, where `localStorage` does not exist and touching',
      'it throws. Nuxt strips the block from the server bundle entirely.',
    ].join('\n'),
  }),
};

export const vueQueryRecipe: Recipe = {
  id: VUE_QUERY_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  requires: requiresFramework,

  appliesTo: (spec) => isVue(spec) && spec.ui!.state === 'react-query',

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'state', 'vue-query'), ctx, VUE_QUERY_RECIPE_ID, {
      framework: frameworkContract(ctx.spec),
    }),

  packageJson: () => ({ dependencies: dependencyMap(['@tanstack/vue-query']) }),

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'State',
    body: [
      'TanStack Query for Vue, installed by `app/plugins/vue-query.ts`.',
      '',
      '**The QueryClient is created inside the plugin, not at module scope.** A module-level client',
      'would be shared by every request the server handles, so one user’s cached data could be',
      'serialised into another user’s page.',
      '',
      'The plugin also dehydrates the server’s cache into the payload and hydrates it on the',
      'client. Without that, everything fetched during server rendering is fetched again the moment',
      'the page becomes interactive: the markup arrives populated, blanks, then refills.',
      '',
      '`useUiState()` is the companion for client state. Query caches *server* state; a theme',
      'preference does not belong in it.',
    ].join('\n'),
  }),
};

export const vueStateRecipe: Recipe = {
  id: VUE_STATE_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  requires: requiresFramework,

  appliesTo: (spec) => isVue(spec) && spec.ui!.state === 'context',

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'state', 'vue-state'), ctx, VUE_STATE_RECIPE_ID, {
      framework: frameworkContract(ctx.spec),
    }),

  // No packageJson hook at all. The zero-dependency claim is the entire reason to pick this
  // option, and `coverage.test.ts` asserts it for the React equivalent.

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'State',
    body: [
      '`useState` from Nuxt — a shared ref keyed by name, with no dependency whatsoever.',
      '',
      'This is the Vue answer to React’s Context option. Doc 00 §5.1 describes it as',
      '"provide/inject composables", and `useState` is the better form of that: SSR-safe, and',
      'serialised into the payload so the client picks up exactly what the server rendered.',
      '`provide`/`inject` would need a component to provide from, reintroducing the wrapper Nuxt',
      'has no need for.',
      '',
      'Reach for Pinia when the state grows actions and getters worth naming.',
    ].join('\n'),
  }),
};

export const VUE_STATE_RECIPES = [piniaRecipe, vueQueryRecipe, vueStateRecipe];
