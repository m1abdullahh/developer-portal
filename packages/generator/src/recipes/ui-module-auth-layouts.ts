/**
 * Auth layouts page module.
 *
 * The first page module, and the payoff for the primitive API: one set of pages that renders
 * under three styling systems and two frameworks, with no per-combination copy. The pages import
 * only from `@/components/ui/*`, which is the rule that makes that true.
 *
 * Chosen to come first because it is the only one of the four modules needing no database —
 * `moduleGate` requires auth middleware and nothing else, so it exercises routing and the
 * primitives without dragging in Prisma or session handling.
 *
 * ── Two routing shapes, one module ───────────────────────────────────────────
 * Under a `file-based` framework the pages *are* the routes; dropping them into `app/` is enough.
 * Under a `declared` one they are components nobody can reach until they appear in the route
 * table, so this recipe also inserts them at the `idp:routes` marker. The destination and the
 * codemod both branch on `framework.routing` rather than on the framework's name, so a third
 * framework declares its answer instead of being special-cased here.
 */

import { templatePath } from '@idp/templates';
import { isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import type { CodemodOp, Recipe } from '../types.js';

export const AUTH_LAYOUTS_RECIPE_ID = 'ui.module.auth-layouts';

/** Route table entries, in the order they should appear. */
const ROUTES = [
  { path: 'sign-in', component: 'SignIn' },
  { path: 'sign-up', component: 'SignUp' },
  { path: 'forgot-password', component: 'ForgotPassword' },
] as const;

export const authLayoutsRecipe: Recipe = {
  id: AUTH_LAYOUTS_RECIPE_ID,
  // 'integration', not 'feature': the styling recipe must have emitted the primitives these pages
  // import before this runs, and phase ordering is what guarantees that.
  phase: 'integration',
  layer: 'ui',
  requires: requiresFramework,

  // The schema already rejects this module without auth middleware (moduleGate, doc 00 §5.6), so
  // this only has to check that it was asked for. React-only until Vue equivalents exist.
  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.modules.authLayouts === true && !isVueFramework(spec.ui.framework),

  files: (ctx) =>
    loadTemplateDir(templatePath('ui', 'modules', 'auth-layouts'), ctx, AUTH_LAYOUTS_RECIPE_ID, {
      framework: frameworkContract(ctx.spec),
    }),

  codemods: (ctx): CodemodOp[] => {
    const contract = frameworkContract(ctx.spec);

    // File-based routing discovers the pages on its own — there is nothing to register.
    if (contract.routing === 'file-based') return [];

    return [
      {
        file: 'src/routes.tsx',
        kind: 'insertAtMarker',
        args: {
          marker: 'routes',
          lines: ROUTES.map(
            ({ path, component }) => `  { path: '${path}', element: <${component} /> },`,
          ),
          // Ordering among route entries is cosmetic — paths are matched, not sequenced — so a
          // single priority keeps output deterministic without implying otherwise.
          priority: 10,
          recipeId: AUTH_LAYOUTS_RECIPE_ID,
        },
      },
      ...ROUTES.map(({ component }): CodemodOp => ({
        file: 'src/routes.tsx',
        kind: 'addImport',
        args: { module: `./${contract.routesDir}/${component}`, defaultImport: component },
      })),
    ];
  },

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Authentication pages',
    body: [
      'Sign-in, registration and password reset, at `/sign-in`, `/sign-up` and `/forgot-password`.',
      '',
      '**The submit handlers are stubs.** Authentication belongs to your API, and guessing at its',
      'shape would have produced code that looks finished and does nothing. Each one marks the',
      'place to call yours.',
      '',
      'The pages import only from `@/components/ui/*`, never from a styling library directly.',
      'That is what lets the same module render under Tailwind, CSS Modules or MUI — worth',
      'preserving as you edit.',
      '',
      'One behaviour to keep: the reset form reports success even for an unknown address.',
      'Distinguishing the two turns it into an account-enumeration oracle, letting anyone discover',
      'which emails are registered.',
    ].join('\n'),
  }),
};
