/**
 * Settings & RBAC — the API half (doc 02 §4.4).
 *
 * Organisation settings, an editable permission matrix, an append-only audit log and API keys.
 * Split from the UI half for the same reason `userManagement` is: a recipe declares one layer.
 *
 * ── How an editable matrix reaches the middleware ───────────────────────────
 * `permissions.ts` holds the compiled-in defaults and is shared with the browser app. This module
 * stores the *differences* in `RolePermission` and installs them through the resolver hook that
 * policy exposes. The auth plugin keeps calling `hasPermission()` and never learns the table
 * exists — which is what lets the matrix be optional without the middleware branching on it.
 */

import { templatePath } from '@idp/templates';
import type { ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { MIDDLEWARE_PRIORITY } from '../codemod/markers.js';
import { REST_RECIPE_ID } from './api-rest.js';
import { PRISMA_RECIPE_ID } from './api-prisma.js';
import { AUTH_JWT_RECIPE_ID } from './api-middleware.js';
import { API_PERMISSIONS_RECIPE_ID } from './policy-permissions.js';
import type { CodemodOp, Recipe } from '../types.js';

export const API_SETTINGS_RBAC_RECIPE_ID = 'api.module.settings-rbac';

/**
 * Applicability, shared with the UI half.
 *
 * Auth is not merely the wizard's gate here — the routes call `app.requirePermission`, which only
 * exists once the JWT plugin has registered. Generating them without it produces a service that
 * fails to boot.
 */
export function settingsRbacApplies(spec: ProjectSpec): boolean {
  return (
    spec.ui?.modules.settingsRbac === true &&
    spec.api?.runtime === 'node-ts' &&
    spec.api.paradigm === 'rest' &&
    spec.api.orm === 'prisma' &&
    spec.api.middleware.auth !== 'none'
  );
}

const MODELS = [
  '/// Organisation-wide settings. One row, created on first read rather than seeded — a seed runs',
  '/// once per environment and is easy to skip, and the failure then looks like a broken route.',
  'model OrgSettings {',
  '  id                 String   @id @default(cuid())',
  '  name               String',
  '  /// Sign-ups from this domain may be auto-approved. Null means no domain is trusted.',
  '  allowedEmailDomain String?',
  '  defaultRole        UserRole @default(viewer)',
  '  requireApproval    Boolean  @default(true)',
  '  updatedAt          DateTime @updatedAt',
  '}',
  '',
  '/// Differences from the compiled-in policy in src/lib/permissions.ts — not the whole matrix.',
  '/// Storing only what an administrator changed means a new permission added in code takes',
  '/// effect immediately instead of defaulting to denied for every role.',
  'model RolePermission {',
  '  id         String   @id @default(cuid())',
  '  role       UserRole',
  '  permission String',
  '  allowed    Boolean',
  '  updatedAt  DateTime @updatedAt',
  '',
  '  @@unique([role, permission])',
  '}',
  '',
  '/// Append-only. There is no route that updates or deletes a row, deliberately.',
  'model AuditLog {',
  '  id        String   @id @default(cuid())',
  '  /// The JWT subject, or `system` for anything performed without a token.',
  '  actorId   String',
  '  /// Dotted and past-tense: settings.updated, api-key.revoked.',
  '  action    String',
  '  target    String?',
  '  detail    String?',
  '  createdAt DateTime @default(now())',
  '',
  '  /// Matches the list query, which orders by createdAt and breaks ties on id.',
  '  @@index([createdAt, id])',
  '  @@index([actorId])',
  '  @@index([action])',
  '}',
  '',
  '/// The key itself is never stored — only a SHA-256 of it and the leading characters, so a key',
  '/// can be identified in a list without the list becoming a credential store.',
  'model ApiKey {',
  '  id         String    @id @default(cuid())',
  '  name       String',
  '  prefix     String',
  '  hash       String    @unique',
  '  createdAt  DateTime  @default(now())',
  '  lastUsedAt DateTime?',
  '  expiresAt  DateTime?',
  '  /// Revoked rather than deleted: the audit log references this row.',
  '  revokedAt  DateTime?',
  '',
  '  @@index([revokedAt])',
  '}',
];

export const apiSettingsRbacRecipe: Recipe = {
  id: API_SETTINGS_RBAC_RECIPE_ID,
  phase: 'integration',
  layer: 'api',
  requires: [REST_RECIPE_ID, PRISMA_RECIPE_ID, AUTH_JWT_RECIPE_ID, API_PERMISSIONS_RECIPE_ID],

  appliesTo: settingsRbacApplies,

  files: (ctx) =>
    loadTemplateDir(
      templatePath('api', 'modules', 'settings-rbac'),
      ctx,
      API_SETTINGS_RBAC_RECIPE_ID,
    ),

  codemods: (): CodemodOp[] => [
    {
      file: 'prisma/schema.prisma',
      kind: 'insertAtMarker',
      args: {
        marker: 'models',
        lines: MODELS,
        // After userManagement's User model, which is the one a reader looks for first.
        priority: 20,
        recipeId: API_SETTINGS_RBAC_RECIPE_ID,
      },
    },
    {
      file: 'src/server.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'routes',
        lines: [
          // Before the routes, so the first guarded request enforces the stored matrix rather
          // than the defaults. It never throws — a database that is briefly unreachable must not
          // stop the process from starting. See initAccessPolicy() for why that trade is made.
          'await initAccessPolicy(app.log);',
          'await registerSettingsRoutes(app);',
        ],
        priority: MIDDLEWARE_PRIORITY.routes,
        recipeId: API_SETTINGS_RBAC_RECIPE_ID,
      },
    },
    {
      file: 'src/server.ts',
      kind: 'addImport',
      args: { module: './routes/settings.js', named: ['registerSettingsRoutes'] },
    },
    {
      file: 'src/server.ts',
      kind: 'addImport',
      args: { module: './lib/access.js', named: ['initAccessPolicy'] },
    },
  ],

  readme: () => ({
    order: README_ORDER.backend,
    heading: 'Settings, permissions and audit',
    body: [
      '| Method | Path | What |',
      '| --- | --- | --- |',
      '| `GET` `PATCH` | `/settings` | Organisation settings |',
      '| `GET` `PUT` | `/settings/permissions` | The effective permission matrix |',
      '| `GET` | `/audit-logs` | Append-only, cursor-paginated |',
      '| `GET` `POST` | `/api-keys` | Create returns the key **once** |',
      '| `DELETE` | `/api-keys/:id` | Revoke |',
      '',
      'All eight require `manage:settings`, reads included — the audit log names who did what, and',
      'the key list names every integration this service trusts.',
      '',
      '**Three behaviours worth keeping as you edit:**',
      '',
      'A matrix that leaves no role holding `manage:settings` is refused with `409`. Without that',
      'guard one careless save makes these endpoints unreachable and the way back is a database',
      'client.',
      '',
      '`RolePermission` stores only the *differences* from `src/lib/permissions.ts`. A permission',
      'added in code therefore takes effect immediately, where a full copy of the matrix would',
      'leave it denied for every role until someone opened the editor.',
      '',
      'API keys are stored as a SHA-256 hash and a short prefix. The key is shown once at creation',
      'and cannot be recovered — a leaked backup yields hashes, not working credentials.',
      '',
      '**The one to know before scaling out:** the matrix is cached per process and invalidated on',
      'write, so with multiple replicas a change saved on one pod is not seen by the others until',
      'they restart. `src/lib/access.ts` marks where to publish invalidation if that matters.',
    ].join('\n'),
  }),
};
