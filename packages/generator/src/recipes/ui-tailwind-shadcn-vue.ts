/**
 * Tailwind for Vue — the third and last Vue styling system (doc 00 §5.2).
 *
 * With this, Nuxt has an implementation for every styling option the wizard offers, which is the
 * bar for offering the framework at all.
 *
 * ── Why there is no shadcn-vue dependency ───────────────────────────────────
 * Doc 00 §5.2 maps `tailwind-shadcn` onto "shadcn-vue", and this recipe deliberately does not
 * install it — for the same reason the React recipe does not install shadcn/ui. shadcn is not a
 * package; it is a CLI that copies component source into your repository. What both recipes emit
 * *is* that copied source, written against the primitive API rather than shadcn's, so the
 * components are yours to edit on day one. Adding a dependency would be inventing one.
 *
 * ── Two dependencies the React version needs and this one does not ──────────
 * `clsx` and `tailwind-merge`. React components compose class strings by hand and need a helper to
 * resolve conflicts; Vue merges a `class` array natively, and merges whatever a parent passes on
 * top of it. So the Vue components take an array literal and there is no `cn` helper at all.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import { PRIMITIVES, registerStylingContract } from '../styling-contract.js';
import type { CodemodOp, Recipe } from '../types.js';

export const TAILWIND_VUE_RECIPE_ID = 'ui.styling.tailwind-shadcn-vue';

registerStylingContract('tailwind-shadcn', {
  recipeId: TAILWIND_VUE_RECIPE_ID,
  family: 'vue',
  provides: [...PRIMITIVES],
});

export const tailwindShadcnVueRecipe: Recipe = {
  id: TAILWIND_VUE_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  requires: requiresFramework,

  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.styling === 'tailwind-shadcn' && isVueFramework(spec.ui.framework),

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ui', 'styling', 'tailwind-shadcn-vue'),
      ctx,
      TAILWIND_VUE_RECIPE_ID,
      { framework: frameworkContract(ctx.spec) },
    ),

  packageJson: () => ({
    dependencies: dependencyMap(['tailwindcss']),
    // Tailwind 4 split its integrations by bundler: Next uses `@tailwindcss/postcss`, and
    // anything on Vite — Nuxt included — uses this one. There is no shared package that covers
    // both, which is why the React and Vue recipes install different things.
    devDependencies: dependencyMap(['@tailwindcss/vite']),
  }),

  codemods: (ctx): CodemodOp[] => [
    {
      file: 'nuxt.config.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'nuxt-imports',
        lines: ["import tailwindcss from '@tailwindcss/vite';"],
        priority: 10,
        recipeId: TAILWIND_VUE_RECIPE_ID,
      },
    },
    {
      file: 'nuxt.config.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'nuxt-vite-plugins',
        lines: ['      tailwindcss(),'],
        priority: 10,
        recipeId: TAILWIND_VUE_RECIPE_ID,
      },
    },
    {
      // Nuxt loads global stylesheets from its own `css` array rather than from a component
      // import — the framework contract reports `nuxt.config.ts` as the stylesheet host for
      // exactly this reason.
      file: 'nuxt.config.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'nuxt-css',
        lines: [`    '~/${frameworkContract(ctx.spec).stylesheetPath.replace(/^app\//, '')}',`],
        priority: 10,
        recipeId: TAILWIND_VUE_RECIPE_ID,
      },
    },
  ],

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Styling',
    body: [
      'Tailwind 4 through `@tailwindcss/vite`. The eight primitives live in `app/components/ui/`',
      'and Nuxt auto-imports them, so a page writes `<UiButton>` with no import statement.',
      '',
      '**No shadcn-vue dependency, deliberately.** shadcn is a CLI that copies component source',
      'into your repository rather than a package you install. What is in `components/ui/` *is*',
      'that copied source — written against this generator’s primitive API — so it is yours to',
      'edit from day one.',
      '',
      '**No `cn` helper either.** The React implementation needs `clsx` and `tailwind-merge` to',
      'compose class strings; Vue merges a `class` array natively and merges what a parent passes',
      'on top, so the components take an array literal and two dependencies disappear.',
      '',
      'Design tokens are CSS custom properties in `app/assets/css/globals.css`, registered in',
      '`nuxt.config.ts`. A `dark` class on `<html>` re-points them, which is why no component',
      'carries a `dark:` variant for colour.',
    ].join('\n'),
  }),
};
