/**
 * Tailwind CSS v4 + shadcn-style primitives.
 *
 * Owns `app/globals.css` (which the framework recipe imports) and the primitive component set
 * that every page module is written against. Confining the design system to ~8 primitive files
 * is what stops the 4 page modules × 3 styling systems matrix from becoming 12 hand-written
 * copies of each page (doc 02 §2).
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import { PRIMITIVES, registerStylingContract } from '../styling-contract.js';
import type { Recipe } from '../types.js';

export const TAILWIND_SHADCN_RECIPE_ID = 'ui.styling.tailwind-shadcn';

/**
 * Declares the primitive set this system implements.
 *
 * The reference implementation: it covers all eight, so a page module written against this API
 * has nothing framework- or library-specific to fall back on.
 */
registerStylingContract('tailwind-shadcn', {
  // React: these emit .tsx. The Vue implementations register under the same styling value in the
  // 'vue' family, which is why the registry is keyed on both.
  family: 'react',
  recipeId: TAILWIND_SHADCN_RECIPE_ID,
  provides: [...PRIMITIVES],
});

export const tailwindShadcnRecipe: Recipe = {
  id: TAILWIND_SHADCN_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  // The framework recipe owns app/layout.tsx, which imports the globals.css this recipe emits.
  requires: requiresFramework,

  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.styling === 'tailwind-shadcn' && !isVueFramework(spec.ui.framework),

  // The contract is passed to the templates so `globals.css` lands wherever the chosen framework
  // expects it — `app/` under Next, `src/` under Vite — without this recipe naming either.
  files: (ctx) =>
    loadTemplateDir(
      templatePath('ui', 'styling', 'tailwind-shadcn'),
      ctx,
      TAILWIND_SHADCN_RECIPE_ID,
      { framework: frameworkContract(ctx.spec) },
    ),

  packageJson: () => ({
    dependencies: {
      ...dependencyMap(['tailwindcss']),
      // Not in the shared manifest: these are specific to this recipe and would be dead
      // weight in every non-Tailwind project.
      clsx: '2.1.1',
      'tailwind-merge': '3.3.1',
    },
    devDependencies: { '@tailwindcss/postcss': '4.3.3' },
  }),

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Styling',
    body: [
      'Tailwind CSS v4 with shadcn-style primitives in `components/ui/`.',
      '',
      'Theme colours are CSS custom properties defined in `app/globals.css`, not Tailwind config',
      'values. A `dark` class on `<html>` re-points the same variables, so components never need',
      '`dark:` colour variants.',
      '',
      'Pages should compose the primitives (`Button`, `Card`, …) rather than reaching for utility',
      'classes directly — that boundary is what makes changing design system a contained edit.',
    ].join('\n'),
  }),
};
