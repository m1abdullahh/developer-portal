/**
 * User management — the UI half.
 *
 * The counterpart to `api.module.user-management`; see that file for why the module is split in
 * two. This half needs a React framework and knows nothing about the ORM behind the endpoints.
 *
 * ── Why it exercises all eight primitives ───────────────────────────────────
 * `authLayouts` uses three. This page uses every one — table, badge, dialog, select, input,
 * button, card, toast — which makes it the first real test of the styling contract rather than a
 * demonstration of it. A primitive whose API only works under Tailwind has nowhere to hide here.
 */

import { templatePath } from '@idp/templates';
import { isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import type { CodemodOp, EnvVar, Recipe } from '../types.js';

export const UI_USER_MANAGEMENT_RECIPE_ID = 'ui.module.user-management';

/**
 * Applicability, shared with the API half.
 *
 * Both halves ask the same question. The module gate already guarantees an API layer and a
 * database, but not that they are ones we have recipes for — and generating this page against
 * endpoints nothing serves would be worse than generating nothing, because it looks finished.
 */
export function userManagementApplies(spec: ProjectSpec): boolean {
  return (
    spec.ui?.modules.userManagement === true &&
    spec.api?.runtime === 'node-ts' &&
    spec.api.paradigm === 'rest' &&
    spec.api.orm === 'prisma'
  );
}

/** `NEXT_PUBLIC_API_URL` or `VITE_API_URL`, depending on which framework is generating. */
function apiUrlKey(spec: ProjectSpec): string {
  return `${frameworkContract(spec).publicEnvPrefix}API_URL`;
}

export const uiUserManagementRecipe: Recipe = {
  id: UI_USER_MANAGEMENT_RECIPE_ID,
  // 'integration': the styling recipe must have emitted the primitives this page imports.
  phase: 'integration',
  layer: 'ui',
  requires: requiresFramework,

  // React-only until Vue equivalents exist, matching authLayouts.
  appliesTo: (spec: ProjectSpec) =>
    userManagementApplies(spec) && !isVueFramework(spec.ui!.framework),

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ui', 'modules', 'user-management'),
      ctx,
      UI_USER_MANAGEMENT_RECIPE_ID,
      { framework: frameworkContract(ctx.spec) },
    ),

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
        // Declared in the schema as well as .env.example, so a missing value fails at startup
        // naming the key rather than sending every request to the string "undefined".
        file: `${contract.sourceRoot}lib/env.ts`,
        kind: 'insertAtMarker',
        args: {
          marker: 'env-schema',
          lines: [`  ${key}: z.string().url('${key} must be an absolute URL'),`],
          priority: 10,
          recipeId: UI_USER_MANAGEMENT_RECIPE_ID,
        },
      },
    ];

    // File-based routing discovers app/users/page.tsx on its own; a declared router does not.
    if (contract.routing === 'file-based') return ops;

    return [
      ...ops,
      {
        file: 'src/routes.tsx',
        kind: 'insertAtMarker',
        args: {
          marker: 'routes',
          lines: [`  { path: 'users', element: <Users /> },`],
          // After the auth pages, which sit at 10 — lower sorts first. Ordering among route
          // entries is cosmetic either way: paths are matched, not sequenced.
          priority: 20,
          recipeId: UI_USER_MANAGEMENT_RECIPE_ID,
        },
      },
      {
        file: 'src/routes.tsx',
        kind: 'addImport',
        args: { module: `./${contract.routesDir}/Users`, defaultImport: 'Users' },
      },
    ];
  },

  readme: (ctx) => ({
    order: README_ORDER.frontend,
    heading: 'User management',
    body: [
      'A `/users` page: list with search and role filter, invite dialog, inline role changes and',
      'removal. It calls the Users API — see the section above for what that enforces.',
      '',
      `Set \`${apiUrlKey(ctx.spec)}\` to the API's base URL. It is compiled into the browser`,
      'bundle, so it must never hold a secret; there is no server here to keep one on.',
      '',
      'Role changes and removals are optimistic: the row updates immediately and rolls back if the',
      'API refuses. That matters because the most common refusal — demoting the last owner — is',
      'one the user needs to see explained rather than silently ignored.',
      '',
      'The page imports only from `@/components/ui/*` and `@/lib/users-api`, never from a styling',
      'library directly. That is what lets it render under Tailwind, CSS Modules or MUI unchanged,',
      'and it is worth preserving as you edit.',
    ].join('\n'),
  }),
};
