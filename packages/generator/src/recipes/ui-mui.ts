/**
 * MUI styling recipe.
 *
 * The third implementation of the primitive API, and the one that actually tests it. Tailwind and
 * CSS Modules write their components from scratch, so they can satisfy any API this repo invents.
 * MUI cannot — it wraps a library with its own opinions about every one of these props, and a
 * badly designed prop surface would show up as an unwrappable component rather than a stylistic
 * quibble.
 *
 * The contract held, at the cost of some genuine translation:
 *   - `Button.variant` collides outright. Ours (primary/secondary/ghost/destructive) is mapped
 *     onto MUI's (text/outlined/contained plus a colour); MUI's is not exposed.
 *   - `Select` takes `options`; MUI's takes `children`. The wrapper builds the MenuItems.
 *   - `Badge` maps to MUI's Chip. MUI's own Badge is a notification dot over another element —
 *     a different component wearing the same name.
 *
 * Absorbing those differences here is exactly the job: a page module written against `options`
 * renders under all three styling systems without knowing any of it.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { PROVIDER_PRIORITY } from '../codemod/providers.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import { PRIMITIVES, registerStylingContract } from '../styling-contract.js';
import type { Recipe } from '../types.js';

export const MUI_RECIPE_ID = 'ui.styling.mui';

registerStylingContract('mui', {
  recipeId: MUI_RECIPE_ID,
  provides: [...PRIMITIVES],
});

export const muiRecipe: Recipe = {
  id: MUI_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  requires: requiresFramework,

  // React only. Nuxt maps this option to Vuetify through a separate recipe — MUI is React-only,
  // which is contradiction 2 from the PRD (doc 00 §5.2).
  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.styling === 'mui' && !isVueFramework(spec.ui.framework),

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'styling', 'mui'), ctx, MUI_RECIPE_ID, {
      framework: frameworkContract(ctx.spec),
    }),

  packageJson: () => ({
    // Emotion is MUI's default style engine and a hard peer dependency, not an optional extra.
    dependencies: dependencyMap(['@mui/material', '@emotion/react', '@emotion/styled']),
  }),

  // The only styling recipe that needs a provider. It wraps outside the store, because every
  // component below reads theme context — PROVIDER_PRIORITY encodes that rather than leaving it
  // to whichever recipe happens to run first.
  codemods: (ctx) => [
    {
      file: frameworkContract(ctx.spec).providerRoot,
      kind: 'wrapProvider',
      args: {
        component: 'ThemeProvider',
        priority: PROVIDER_PRIORITY.theme,
        import: { module: '@/components/providers/ThemeProvider', named: ['ThemeProvider'] },
      },
    },
  ],

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Styling',
    body: [
      '[MUI](https://mui.com) with the Emotion style engine.',
      '',
      'The eight primitives in `components/ui/` wrap MUI components while keeping the same props',
      'every styling option exposes. That means `Button` takes `variant="primary"`, not MUI\'s',
      '`variant="contained"`, and `Select` takes an `options` array rather than children.',
      '',
      "Import from `@mui/material` directly whenever you want MUI's own API — the wrappers exist",
      'to keep shared page modules portable, not to hide the library.',
      '',
      'Design tokens are restated in `components/ui/theme.ts`, because MUI does not read CSS',
      'custom properties. Keep it in step with the global stylesheet, which still governs anything',
      'MUI does not render.',
      '',
      '`ThemeProvider` watches the `dark` class on `<html>` — the same signal the other styling',
      'options use — so the theme toggle works without this layer knowing your state library.',
    ].join('\n'),
  }),
};
