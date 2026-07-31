/**
 * Settings & RBAC — the UI half (doc 02 §4.4).
 *
 * A `/settings` page with four tabs: organisation, the permission matrix, the audit log and API
 * keys. The panels live beside the page rather than inside it, so the shell stays a tab list.
 *
 * ── A documented deviation from doc 02 §4.4 ─────────────────────────────────
 * The doc names the tabs "profile / organisation / security / notifications". The tabs here are
 * organisation / permissions / audit log / API keys — the same count, matched to the features the
 * module actually ships. "Profile" belongs to whatever identity provider the project chose and
 * "notifications" needs a delivery system that does not exist, so both would have been empty
 * shells. An empty tab reads as a broken feature; an absent one reads as a scope decision.
 */

import { templatePath } from '@idp/templates';
import { isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import { settingsRbacApplies } from './api-module-settings-rbac.js';
import type { CodemodOp, EnvVar, Recipe } from '../types.js';

export const UI_SETTINGS_RBAC_RECIPE_ID = 'ui.module.settings-rbac';

/** `NEXT_PUBLIC_API_URL` or `VITE_API_URL`, depending on which framework is generating. */
function apiUrlKey(spec: ProjectSpec): string {
  return `${frameworkContract(spec).publicEnvPrefix}API_URL`;
}

export const uiSettingsRbacRecipe: Recipe = {
  id: UI_SETTINGS_RBAC_RECIPE_ID,
  phase: 'integration',
  layer: 'ui',
  requires: requiresFramework,

  appliesTo: (spec: ProjectSpec) =>
    settingsRbacApplies(spec) && !isVueFramework(spec.ui!.framework),

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ui', 'modules', 'settings-rbac'),
      ctx,
      UI_SETTINGS_RBAC_RECIPE_ID,
      { framework: frameworkContract(ctx.spec) },
    ),

  /*
   * The same key `userManagement` declares.
   *
   * Both modules contribute it, and the env builder unions contributions by key — so enabling
   * both produces one entry rather than a duplicate. Declaring it here anyway is what makes this
   * module work when it is the only one enabled.
   */
  env: (ctx): EnvVar[] => [
    {
      key: apiUrlKey(ctx.spec),
      example: 'http://localhost:3001',
      required: true,
      description:
        'Base URL of the API this page calls. Compiled into the bundle — never a secret.',
    },
  ],

  codemods: (ctx): CodemodOp[] => {
    const contract = frameworkContract(ctx.spec);
    const key = apiUrlKey(ctx.spec);

    const ops: CodemodOp[] = [
      {
        file: `${contract.sourceRoot}lib/env.ts`,
        kind: 'insertAtMarker',
        args: {
          marker: 'env-schema',
          // Byte-identical to userManagement's contribution, deliberately. With both modules
          // enabled the marker writer keeps the first and drops the rest — two entries would be a
          // duplicate object key. Neither module can omit it, since either may be enabled alone.
          lines: [`  ${key}: z.string().url('${key} must be an absolute URL'),`],
          priority: 10,
          recipeId: UI_SETTINGS_RBAC_RECIPE_ID,
        },
      },
    ];

    if (contract.routing === 'file-based') return ops;

    return [
      ...ops,
      {
        file: 'src/routes.tsx',
        kind: 'insertAtMarker',
        args: {
          marker: 'routes',
          lines: [`  { path: 'settings', element: <Settings /> },`],
          priority: 30,
          recipeId: UI_SETTINGS_RBAC_RECIPE_ID,
        },
      },
      {
        file: 'src/routes.tsx',
        kind: 'addImport',
        args: { module: `./${contract.routesDir}/Settings`, defaultImport: 'Settings' },
      },
    ];
  },

  readme: (ctx) => ({
    order: README_ORDER.frontend,
    heading: 'Settings',
    body: [
      'A `/settings` page with four tabs: organisation, permissions, audit log and API keys.',
      '',
      `Set \`${apiUrlKey(ctx.spec)}\` to the API's base URL — the same variable the users page uses.`,
      '',
      'The permission matrix renders the *effective* policy: defaults from `lib/permissions.ts`,',
      'which this app and the API both read, with any administrator changes marked. Saving sends',
      'the whole grid, because a patch would leave a revoked permission in place.',
      '',
      'A new API key is shown in a dialog that must be dismissed deliberately, not a toast. The',
      'key is stored hashed and cannot be shown again, so a notification that disappears on a',
      'timer would lose it.',
      '',
      '**Tabs differ from doc 02 §4.4** — "profile" and "notifications" are replaced by',
      '"permissions" and "API keys". The first two would have been empty shells: profile belongs',
      'to your identity provider, and notifications need a delivery system this scaffold does not',
      'generate.',
    ].join('\n'),
  }),
};
