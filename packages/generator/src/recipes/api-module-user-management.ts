/**
 * User management — the API half.
 *
 * ── Why this module is two recipes ──────────────────────────────────────────
 * A recipe declares exactly one `layer`, and this module needs files in two: Fastify routes and a
 * Prisma model under `apps/api/`, pages and a client under `apps/web/`. Splitting it is not a
 * workaround — the halves have genuinely different applicability. The API half needs Postgres and
 * Prisma and does not care which UI framework was chosen; the UI half needs a React framework and
 * does not care which ORM is behind the endpoints. Forcing both into one recipe would mean each
 * half carrying the other's preconditions.
 *
 * The pair is kept coherent by the compatibility matrix rather than by cross-references: the
 * schema already rejects `userManagement` without an API layer and a database (doc 00 §5.6), so
 * neither half has to defend against the other being absent.
 *
 * ── Where the roles come from ───────────────────────────────────────────────
 * Not here. `UserRole` is contributed by `api.policy.permissions`, whose `permissions.ts` is the
 * single definition the API middleware and the browser guards both read.
 *
 * This module did declare its own list — `OWNER | ADMIN | MEMBER | VIEWER` — which shipped
 * alongside the policy's `viewer | editor | admin` in the same service. Nothing failed; the two
 * simply could not be used together. `settingsRbac` would have made it three.
 */

import { templatePath } from '@idp/templates';
import type { ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { MIDDLEWARE_PRIORITY } from '../codemod/markers.js';
import { REST_RECIPE_ID } from './api-rest.js';
import { PRISMA_RECIPE_ID } from './api-prisma.js';
import { API_PERMISSIONS_RECIPE_ID } from './policy-permissions.js';
import type { CodemodOp, Recipe } from '../types.js';

export const API_USER_MANAGEMENT_RECIPE_ID = 'api.module.user-management';

/**
 * The Prisma models, inserted at `idp:models`.
 *
 * Written as lines rather than a template file because the schema is one document: Prisma has no
 * include mechanism in the single-file layout the base recipe emits, so a second `.prisma` file
 * would simply be ignored.
 */
const MODELS = [
  'enum UserStatus {',
  '  /// Invited but has not yet proved control of the address.',
  '  INVITED',
  '  ACTIVE',
  '  /// Retained for audit history; cannot sign in.',
  '  SUSPENDED',
  '}',
  '',
  'model User {',
  '  id        String     @id @default(cuid())',
  '  /// Stored lowercase. The API lowercases on write — without that, the unique constraint',
  '  /// treats Ada@example.com and ada@example.com as two people.',
  '  email     String     @unique',
  '  name      String?',
  '  role      UserRole   @default(editor)',
  '  status    UserStatus @default(INVITED)',
  '  createdAt DateTime   @default(now())',
  '  updatedAt DateTime   @updatedAt',
  '',
  '  /// Matches the list query, which orders by createdAt and breaks ties on id.',
  '  @@index([createdAt, id])',
  '  /// Serves both the role filter and the last-owner count on every write.',
  '  @@index([role, status])',
  '}',
];

export const apiUserManagementRecipe: Recipe = {
  id: API_USER_MANAGEMENT_RECIPE_ID,
  // 'integration': the REST paradigm must have emitted schemas/common.ts and the Prisma recipe
  // its client before these routes can import either.
  phase: 'integration',
  layer: 'api',
  // The policy owns UserRole and must contribute it to the schema before this model uses it.
  requires: [REST_RECIPE_ID, PRISMA_RECIPE_ID, API_PERMISSIONS_RECIPE_ID],

  /*
   * Narrower than the module gate on purpose.
   *
   * The gate asks "is a database configured?"; this asks "is it one we have a recipe for?". Today
   * that means Postgres with Prisma and a REST paradigm. A spec that passes the gate but not this
   * check generates the UI half against endpoints nothing serves, which is worse than generating
   * nothing — so the UI half carries the same condition.
   */
  appliesTo: (spec: ProjectSpec) =>
    spec.ui?.modules.userManagement === true &&
    spec.api?.runtime === 'node-ts' &&
    spec.api.paradigm === 'rest' &&
    spec.api.orm === 'prisma',

  files: (ctx) =>
    loadTemplateDir(
      templatePath('api', 'modules', 'user-management'),
      ctx,
      API_USER_MANAGEMENT_RECIPE_ID,
    ),

  codemods: (): CodemodOp[] => [
    {
      file: 'prisma/schema.prisma',
      kind: 'insertAtMarker',
      args: {
        marker: 'models',
        lines: MODELS,
        priority: 10,
        recipeId: API_USER_MANAGEMENT_RECIPE_ID,
      },
    },
    {
      file: 'src/server.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'routes',
        lines: ['await registerUserRoutes(app);'],
        priority: MIDDLEWARE_PRIORITY.routes,
        recipeId: API_USER_MANAGEMENT_RECIPE_ID,
      },
    },
    {
      file: 'src/server.ts',
      kind: 'addImport',
      args: { module: './routes/users.js', named: ['registerUserRoutes'] },
    },
  ],

  readme: () => ({
    order: README_ORDER.backend,
    heading: 'Users API',
    body: [
      '| Method | Path | What |',
      '| --- | --- | --- |',
      '| `GET` | `/users` | List, cursor-paginated, filterable by role, status and free text |',
      '| `POST` | `/users` | Invite — creates an `INVITED` account |',
      '| `GET` | `/users/:id` | Fetch one |',
      '| `PATCH` | `/users/:id` | Change name, role or status |',
      '| `DELETE` | `/users/:id` | Remove |',
      '',
      '**Two behaviours worth keeping as you edit:**',
      '',
      'The last active owner cannot be demoted, suspended or deleted — the request answers `409`.',
      'Without that guard an organisation can lock itself out through an ordinary action, and',
      'recovery then needs direct database access. The check runs inside a transaction because',
      'counting and writing separately is a race two concurrent demotions both win.',
      '',
      'Invitations create the account as `INVITED`, not `ACTIVE`. Nobody has proved they control',
      'the address yet, and treating an invitation as an active account is how someone who guesses',
      'an address inherits its permissions.',
      '',
      '**Not included:** sending the invitation email. That needs a mail provider this generator',
      'cannot choose for you — `src/routes/users.ts` marks the place.',
    ].join('\n'),
  }),
};
