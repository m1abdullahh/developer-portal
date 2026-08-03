/**
 * The role and permission policy, emitted into every layer that enforces it.
 *
 * ── Why this is its own recipe, and why there are two of them ───────────────
 * `permissions.ts` used to live inside the JWT middleware recipe, which made it unavailable to
 * anything that did not enable JWT — including `userManagement`, whose gate requires a database
 * and an API but says nothing about auth. So `userManagement` declared its own role list, and a
 * spine project shipped two incompatible vocabularies in the same service:
 *
 *     src/lib/permissions.ts   ROLES     = ['viewer', 'editor', 'admin']
 *     prisma/schema.prisma     UserRole  = OWNER | ADMIN | MEMBER | VIEWER
 *
 * Nothing failed. `hasPermission()` simply could not be called with a `User.role`, and any
 * `.toLowerCase()` bridging the two would map `owner` and `member` to no permissions at all.
 * Doc 02 §4.4 asks for one definition and two enforcement points; that was three definitions.
 *
 * Now the policy is a recipe of its own that any layer can require. It is two recipes rather than
 * one because a recipe declares a single layer and the policy has to reach both — the API renders
 * it to `src/lib/`, the browser app to its own source root. Both render the *same template*, and
 * `policy-contract.test.ts` asserts the emitted files are byte-identical.
 */

import { templatePath } from '@idp/templates';
import { type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import { README_ORDER } from '../merge/readme.js';
import { NODE_TS_RECIPE_ID } from './api-node-ts.js';
import { PYTHON_FASTAPI_RECIPE_ID } from './api-python-fastapi.js';
import type { CodemodOp, Recipe } from '../types.js';

export const API_PERMISSIONS_RECIPE_ID = 'api.policy.permissions';
export const UI_PERMISSIONS_RECIPE_ID = 'ui.policy.permissions';
export const PYTHON_PERMISSIONS_RECIPE_ID = 'api.policy.permissions-python';

const TEMPLATE = () => templatePath('api', 'policy', 'permissions');

/**
 * The same policy in Python.
 *
 * A separate template rather than a rendered variant of the TypeScript one, because there is no
 * useful common subset of the two languages to template over — the type-level machinery
 * (`as const` unions versus `Literal` + `get_args`) is most of the file.
 *
 * What is shared is the thing that matters: the four roles, the five permissions and the matrix
 * mapping one to the other. `policy-contract.test.ts` parses both files and fails if they
 * disagree, so "same policy" is checked rather than promised.
 */
const PYTHON_TEMPLATE = () => templatePath('api', 'policy', 'permissions-python');

/**
 * Anything that enforces the policy needs it.
 *
 * Auth middleware is the obvious one, but a page module that shows a role does too — otherwise it
 * invents its own list, which is how this recipe came to exist.
 */
function policyNeeded(spec: ProjectSpec): boolean {
  return (
    spec.api?.middleware.auth !== 'none' ||
    spec.ui?.modules.userManagement === true ||
    spec.ui?.modules.settingsRbac === true
  );
}

/**
 * The Prisma enum, whose members are the policy's role strings verbatim.
 *
 * Lowercase because the TypeScript union is lowercase. Prisma permits it, and the alternative —
 * `ADMIN` in the database against `admin` in the policy — reintroduces exactly the mapping seam
 * this recipe exists to remove.
 */
const ROLE_ENUM = [
  'enum UserRole {',
  '  viewer',
  '  editor',
  '  admin',
  '  /// Same permissions as admin. The difference is structural: an organisation must always',
  '  /// have one, and the API refuses any change that would remove the last active owner.',
  '  owner',
  '}',
];

export const apiPermissionsRecipe: Recipe = {
  id: API_PERMISSIONS_RECIPE_ID,
  // 'feature', not 'integration': the middleware and the page modules that import this both run
  // later, and phase ordering is what guarantees the file exists by then.
  phase: 'feature',
  layer: 'api',
  requires: [NODE_TS_RECIPE_ID],

  appliesTo: (spec) => spec.api?.runtime === 'node-ts' && policyNeeded(spec),

  files: (ctx) =>
    loadTemplateDir(TEMPLATE(), ctx, API_PERMISSIONS_RECIPE_ID, {
      policyPath: 'src/lib/permissions.ts',
    }),

  codemods: (ctx): CodemodOp[] =>
    // Only where there is a schema to put it in. An API with no database still enforces the
    // policy against a JWT claim; it just has nowhere to persist a role.
    ctx.spec.api?.orm === 'prisma'
      ? [
          {
            file: 'prisma/schema.prisma',
            kind: 'insertAtMarker',
            args: {
              marker: 'models',
              lines: ROLE_ENUM,
              // Before any model that references it. Prisma does not care about declaration
              // order, but a reader does.
              priority: 5,
              recipeId: API_PERMISSIONS_RECIPE_ID,
            },
          },
        ]
      : [],

  readme: () => ({
    order: README_ORDER.backend,
    heading: 'Roles and permissions',
    body: [
      '`src/lib/permissions.ts` is the single definition of who may do what. The same file is',
      'emitted into the browser app, so its route guards and this API enforce one policy rather',
      'than two that drift.',
      '',
      '| Role | Permissions |',
      '| --- | --- |',
      '| `viewer` | `read` |',
      '| `editor` | `read`, `write`, `delete` |',
      '| `admin` | everything |',
      '| `owner` | everything |',
      '',
      '`owner` and `admin` hold the same permissions. The difference is structural: an',
      'organisation must always have at least one active owner, and the API refuses any change',
      'that would remove the last one.',
      '',
      'These strings are the Prisma `UserRole` values verbatim — there is deliberately no mapping',
      'between what the database stores and what the policy checks.',
    ].join('\n'),
  }),
};

export const pythonPermissionsRecipe: Recipe = {
  id: PYTHON_PERMISSIONS_RECIPE_ID,
  phase: 'feature',
  layer: 'api',
  requires: [PYTHON_FASTAPI_RECIPE_ID],

  appliesTo: (spec) => spec.api?.runtime === 'python-fastapi' && policyNeeded(spec),

  files: (ctx) =>
    loadTemplateDir(PYTHON_TEMPLATE(), ctx, PYTHON_PERMISSIONS_RECIPE_ID, {
      policyPath: 'app/lib/permissions.py',
    }),

  readme: () => ({
    order: README_ORDER.backend,
    heading: 'Roles and permissions',
    body: [
      '`app/lib/permissions.py` is the single definition of who may do what. When the project also',
      'has a browser app, the same policy is emitted there in TypeScript — two enforcement points,',
      'one policy, checked identical by the generator’s own test suite rather than by convention.',
      '',
      '| Role | Permissions |',
      '| --- | --- |',
      '| `viewer` | `read` |',
      '| `editor` | `read`, `write`, `delete` |',
      '| `admin` | everything |',
      '| `owner` | everything |',
      '',
      '`owner` and `admin` hold the same permissions. The difference is structural: an organisation',
      'must always have at least one active owner, and the API refuses any change that would remove',
      'the last one.',
      '',
      'These strings are the database’s role values verbatim — there is deliberately no mapping',
      'between what is stored and what the policy checks.',
    ].join('\n'),
  }),
};

export const uiPermissionsRecipe: Recipe = {
  id: UI_PERMISSIONS_RECIPE_ID,
  phase: 'feature',
  layer: 'ui',
  requires: requiresFramework,

  // The browser half is only worth emitting when a page actually guards on it. Auth middleware
  // alone is an API concern.
  appliesTo: (spec) =>
    spec.ui !== null &&
    (spec.ui.modules.userManagement === true || spec.ui.modules.settingsRbac === true),

  files: (ctx) =>
    loadTemplateDir(TEMPLATE(), ctx, UI_PERMISSIONS_RECIPE_ID, {
      policyPath: `${frameworkContract(ctx.spec).sourceRoot}lib/permissions.ts`,
    }),
};
