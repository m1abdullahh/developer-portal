/**
 * Vuetify 3/4 — the Vue substitute for MUI (doc 00 §5.2).
 *
 * The hardest of the three Vue styling systems, and deliberately built second rather than last:
 * it is the one that wraps a real component library, so it is where a badly-designed primitive API
 * shows up. That is not hypothetical — the React family's `Select` had to be redesigned when MUI
 * proved the original shape unimplementable, and the same class of problem was the thing worth
 * finding before a third set was written against the API.
 *
 * ── The integration is a Vite plugin, not a Nuxt module ─────────────────────
 * `vuetify-nuxt-module` is the obvious choice and was rejected: its only release supporting
 * Vuetify 4 is `1.0.0-rc.3`, and a release candidate has no place in a scaffold teams take to
 * production. `vite-plugin-vuetify` is stable, is what Vuetify's own Nuxt guide documents, and
 * handles component tree-shaking and style resolution that a plain plugin file cannot.
 *
 * Wiring it needs three things in `nuxt.config.ts` — an import, `build.transpile`, and an entry in
 * `vite.plugins`. The Nuxt template grew markers for all three, because Tailwind v4 needs exactly
 * the same shape.
 *
 * ── Where the providers go ──────────────────────────────────────────────────
 * `app/plugins/vuetify.ts`, picked up by Nuxt's own convention. Nothing wraps `app.vue`. This is
 * the first recipe to exercise `providerInstall: 'nuxt-plugin'` — the React implementations insert
 * a `<ThemeProvider>` around `{children}` with a ts-morph codemod, which cannot act on a `.vue`
 * file at all.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import { PRIMITIVES, registerStylingContract } from '../styling-contract.js';
import type { CodemodOp, Recipe } from '../types.js';

export const VUETIFY_RECIPE_ID = 'ui.styling.vuetify';

registerStylingContract('mui', {
  // `mui` is the wizard option; Vuetify is what that option means for a Vue framework. The
  // substitution table in @idp/core §5.2 is the single place that mapping is described, and the
  // registry key carries the family so this cannot collide with the React implementation.
  recipeId: VUETIFY_RECIPE_ID,
  family: 'vue',
  provides: [...PRIMITIVES],
});

export const vuetifyRecipe: Recipe = {
  id: VUETIFY_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  requires: requiresFramework,

  appliesTo: (spec: ProjectSpec) => spec.ui?.styling === 'mui' && isVueFramework(spec.ui.framework),

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'styling', 'vuetify'), ctx, VUETIFY_RECIPE_ID, {
      framework: frameworkContract(ctx.spec),
    }),

  packageJson: () => ({
    dependencies: dependencyMap(['vuetify']),
    devDependencies: dependencyMap(['vite-plugin-vuetify']),
  }),

  codemods: (): CodemodOp[] => [
    {
      file: 'nuxt.config.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'nuxt-imports',
        lines: ["import vuetify from 'vite-plugin-vuetify';"],
        priority: 10,
        recipeId: VUETIFY_RECIPE_ID,
      },
    },
    {
      file: 'nuxt.config.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'nuxt-transpile',
        // Vuetify ships untranspiled single-file components. Without this Nitro hands them to
        // Node as-is and server rendering dies on a syntax error pointing inside node_modules.
        lines: ["      'vuetify',"],
        priority: 10,
        recipeId: VUETIFY_RECIPE_ID,
      },
    },
    {
      file: 'nuxt.config.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'nuxt-vite-plugins',
        // `autoImport: false` because every Vuetify component this project uses is referenced
        // from a wrapper in components/ui. Leaving it on would let a page reach past the
        // primitive API to `<v-btn>` directly — which compiles, and quietly breaks the promise
        // that swapping the styling option rewrites only these files.
        lines: ['      vuetify({ autoImport: false }),'],
        priority: 10,
        recipeId: VUETIFY_RECIPE_ID,
      },
    },
  ],

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Styling',
    body: [
      'Vuetify 4, the Vue equivalent of Material UI. The eight primitives in `app/components/ui/`',
      'wrap it; Nuxt auto-imports them, so a page writes `<UiButton>` with no import statement.',
      '',
      '**The wrappers own the API, not Vuetify.** `variant` accepts',
      '`primary | secondary | outline | ghost | destructive` — Vuetify’s own `variant` means',
      'something else entirely and is mapped inside the wrapper. Reach for `<v-btn>` directly when',
      'you need something the primitive API does not cover; it is always available.',
      '',
      '`autoImport` is off in `nuxt.config.ts` on purpose. With it on, a page could reach past the',
      'primitive API to a raw Vuetify component — which compiles, and quietly breaks the promise',
      'that swapping the styling option rewrites only `components/ui/`.',
      '',
      'The theme lives in `app/plugins/vuetify.ts`. Vuetify does not read CSS custom properties, so',
      'the palette restates what `globals.css` declares — the same cost MUI imposes in the React',
      'family. Keep the two in step; the stylesheet still drives everything Vuetify does not render.',
      '',
      '**Two substitutions worth knowing:** `Badge` wraps `VChip`, not `VBadge` — Vuetify’s badge is',
      'a corner overlay for notification counts, while the primitive is an inline status pill. And',
      '`Table` wraps `VTable`, not `VDataTable`, because the latter owns sorting and pagination that',
      'would fight the page modules’ own cursor pagination.',
    ].join('\n'),
  }),
};
