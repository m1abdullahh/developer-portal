/**
 * CSS Modules styling recipe.
 *
 * The second implementation of the primitive API, and chosen to come before MUI on purpose: it
 * adds no dependency at all, so anything it struggles with is a problem with the *API design*
 * rather than with integrating someone else's component library. If the contract is wrong, this
 * is where it shows up cheaply.
 *
 * Both Next and Vite support CSS Modules natively — `.module.css` needs no plugin, no PostCSS
 * config, and no build step of its own. That is the entire dependency story.
 */

import { templatePath } from '@idp/templates';
import { isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import { PRIMITIVES, registerStylingContract } from '../styling-contract.js';
import type { Recipe } from '../types.js';

export const CSS_MODULES_RECIPE_ID = 'ui.styling.css-modules';

registerStylingContract('css-modules', {
  // React: these emit .tsx. The Vue implementations register under the same styling value in the
  // 'vue' family, which is why the registry is keyed on both.
  family: 'react',
  recipeId: CSS_MODULES_RECIPE_ID,
  provides: [...PRIMITIVES],
});

export const cssModulesRecipe: Recipe = {
  id: CSS_MODULES_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  requires: requiresFramework,

  // React only for now. Vue SFCs use `<style module>` natively, which is a different enough
  // shape to warrant its own recipe when Nuxt lands (doc 00 §5.2).
  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.styling === 'css-modules' && !isVueFramework(spec.ui.framework),

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'styling', 'css-modules'), ctx, CSS_MODULES_RECIPE_ID, {
      framework: frameworkContract(ctx.spec),
    }),

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Styling',
    body: [
      'Plain CSS Modules — no framework, no build plugin. Both Next and Vite handle `.module.css`',
      'natively.',
      '',
      'The eight primitives in `components/ui/` share one `ui.module.css`. They ship and are',
      'edited as a unit, and eight separate files would duplicate the same token references eight',
      'times. Split it if a primitive grows large enough to deserve its own.',
      '',
      'Design tokens live in the global stylesheet as CSS custom properties, using the same names',
      'every styling option emits — so a component referencing `--muted-foreground` means the same',
      'thing whichever option generated this project. A `dark` class on `<html>` re-points them,',
      'which is why no component carries a dark-mode variant.',
      '',
      'Class names are local to the module: the bundler rewrites them, so short names like',
      '`.button` cannot collide with anything in your application.',
    ].join('\n'),
  }),
};
