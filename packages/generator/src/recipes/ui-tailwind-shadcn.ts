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
import { NEXTJS_APP_RECIPE_ID } from './ui-nextjs-app.js';
import type { Recipe } from '../types.js';

export const TAILWIND_SHADCN_RECIPE_ID = 'ui.styling.tailwind-shadcn';

export const tailwindShadcnRecipe: Recipe = {
  id: TAILWIND_SHADCN_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  // The framework recipe owns app/layout.tsx, which imports the globals.css this recipe emits.
  requires: [NEXTJS_APP_RECIPE_ID],

  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.styling === 'tailwind-shadcn' && !isVueFramework(spec.ui.framework),

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ui', 'styling', 'tailwind-shadcn'),
      ctx,
      TAILWIND_SHADCN_RECIPE_ID,
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
