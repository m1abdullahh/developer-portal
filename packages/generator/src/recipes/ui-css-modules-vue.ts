/**
 * CSS Modules for Vue — the first styling system for a non-React framework (doc 00 §5.2).
 *
 * ── Why this one first ──────────────────────────────────────────────────────
 * The same reasoning that put CSS Modules second in the React family: it adds no dependency at
 * all, so anything that goes wrong is a problem with translating the primitive API to Vue rather
 * than with integrating someone else's component library. Vuetify and shadcn-vue both wrap one,
 * and debugging an API-design mistake through a library is far more expensive.
 *
 * Doc 00 §5.2 maps React's CSS Modules onto Vue's native `<style module>`, which is what these
 * components use — class names are hashed and referenced through `$style`, exactly as an imported
 * `.module.css` is referenced through its default export.
 *
 * ── What "the same API" means across a family boundary ──────────────────────
 * It means the same *vocabulary*, not the same signatures. `variant` still accepts
 * `primary | secondary | outline | ghost | destructive` and `size` still accepts
 * `sm | md | lg | icon`, so a page ported between families changes its markup and not its intent.
 *
 * What cannot carry across is the mechanism. React passes `children` and `onChange`; Vue passes a
 * slot and `v-model`. Those are not reconcilable, and pretending otherwise would produce a Vue
 * component nobody would write by hand. That is why the styling contract is keyed by family.
 *
 * ── One component per file ──────────────────────────────────────────────────
 * A single-file component exports exactly one component, so React's six-piece `card.tsx` is six
 * files here, and the toast splits into an item, a region and a composable. Nuxt auto-imports
 * everything under `app/components/`, so a page writes `<UiCard>` with no import statement — the
 * Vue equivalent of React's `@/components/ui/card` path.
 */

import { templatePath } from '@idp/templates';
import { isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import { PRIMITIVES, registerStylingContract } from '../styling-contract.js';
import type { CodemodOp, Recipe } from '../types.js';

export const CSS_MODULES_VUE_RECIPE_ID = 'ui.styling.css-modules-vue';

registerStylingContract('css-modules', {
  recipeId: CSS_MODULES_VUE_RECIPE_ID,
  family: 'vue',
  provides: [...PRIMITIVES],
});

export const cssModulesVueRecipe: Recipe = {
  id: CSS_MODULES_VUE_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  requires: requiresFramework,

  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.styling === 'css-modules' && isVueFramework(spec.ui.framework),

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ui', 'styling', 'css-modules-vue'),
      ctx,
      CSS_MODULES_VUE_RECIPE_ID,
      { framework: frameworkContract(ctx.spec) },
    ),

  codemods: (ctx): CodemodOp[] => [
    {
      // Nuxt loads global stylesheets from its own `css` array rather than from an import in a
      // component. Registering it here is what the framework contract's `stylesheetHost` of
      // `nuxt.config.ts` means — the React frameworks name a component file instead.
      file: 'nuxt.config.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'nuxt-css',
        lines: [`    '~/${frameworkContract(ctx.spec).stylesheetPath.replace(/^app\//, '')}',`],
        priority: 10,
        recipeId: CSS_MODULES_VUE_RECIPE_ID,
      },
    },
  ],

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Styling',
    body: [
      'Vue single-file components using native `<style module>` — no framework, no build plugin,',
      'no dependency at all.',
      '',
      'The eight primitives live in `app/components/ui/`. Nuxt auto-imports them, so a page writes',
      '`<UiButton>` or `<UiCardHeader>` with no import statement.',
      '',
      'Design tokens live in `app/assets/css/globals.css` as CSS custom properties, registered in',
      '`nuxt.config.ts`. They use the same names every styling option emits, so a component',
      'referencing `--muted-foreground` means the same thing whichever option generated this',
      'project. A `dark` class on `<html>` re-points them, which is why no component carries a',
      'dark-mode variant.',
      '',
      '**`Card` is an unpadded frame.** Padding belongs to `<UiCardContent>`, matching every other',
      'styling system — that split was once inconsistent, and identical markup rendered',
      'differently depending on the design system chosen.',
      '',
      '**Toasts are shared, not local.** `useToasts()` is a module-level store, so a toast can be',
      'fired from anywhere. Render `<UiToastRegion />` once in `app.vue`, outside `<NuxtPage>`, so',
      'a toast fired during navigation survives it.',
    ].join('\n'),
  }),
};
