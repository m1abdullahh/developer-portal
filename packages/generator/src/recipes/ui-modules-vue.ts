/**
 * The Vue implementations of `userManagement` and `stripeBilling`.
 *
 * ── How a Vue page reaches the API ──────────────────────────────────────────
 * Not through an `env.ts` module. The React halves import a validated `env` object and read
 * `NEXT_PUBLIC_API_URL` or `VITE_API_URL`, both substituted into the bundle at build time. Nuxt
 * has no such file: it reads `runtimeConfig.public` at request time, overridden by `NUXT_PUBLIC_*`
 * environment variables.
 *
 * That difference is worth having rather than papering over. A Next or Vite bundle bakes its
 * public variables in, so it needs one image per environment; a Nuxt server reads them at runtime,
 * so the same image runs in staging and production. Forcing an `env.ts` onto Nuxt to make the two
 * families look alike would throw that away.
 *
 * So these recipes contribute to the `idp:nuxt-runtime-public` marker instead of `idp:env-schema`,
 * and still declare `NUXT_PUBLIC_API_URL` through the `env` hook so it reaches `.env.example`.
 */

import { templatePath } from '@idp/templates';
import { isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import { userManagementApplies } from './ui-module-user-management.js';
import { stripeBillingApplies } from './api-module-stripe-billing.js';
import { settingsRbacApplies } from './api-module-settings-rbac.js';
import type { CodemodOp, EnvVar, Recipe } from '../types.js';

export const UI_USER_MANAGEMENT_VUE_RECIPE_ID = 'ui.module.user-management-vue';
export const UI_STRIPE_BILLING_VUE_RECIPE_ID = 'ui.module.stripe-billing-vue';
export const UI_SETTINGS_RBAC_VUE_RECIPE_ID = 'ui.module.settings-rbac-vue';

/**
 * The public API URL, declared once and contributed by whichever module needs it.
 *
 * Identical contributions collapse in the merge, so two modules asking for the same key produce
 * one entry rather than a duplicate — the same way the three React page modules share theirs.
 */
function apiUrlEnv(): EnvVar[] {
  return [
    {
      key: 'NUXT_PUBLIC_API_URL',
      example: 'http://localhost:3001',
      required: true,
      description:
        'Base URL of the API these pages call. Read at runtime from runtimeConfig.public, so the ' +
        'same build runs in every environment. Serialised into the page — never a secret.',
    },
  ];
}

function runtimeConfigOp(recipeId: string): CodemodOp {
  return {
    file: 'nuxt.config.ts',
    kind: 'insertAtMarker',
    args: {
      marker: 'nuxt-runtime-public',
      // Empty by default. Nuxt maps `NUXT_PUBLIC_API_URL` onto `public.apiUrl` automatically, but
      // only for keys that already exist here — a key absent from this object is not overridable
      // at runtime, which is a silent no-op rather than an error.
      lines: ["      apiUrl: '',"],
      priority: 10,
      recipeId,
    },
  };
}

export const uiUserManagementVueRecipe: Recipe = {
  id: UI_USER_MANAGEMENT_VUE_RECIPE_ID,
  phase: 'integration',
  layer: 'ui',
  requires: requiresFramework,

  appliesTo: (spec: ProjectSpec) =>
    userManagementApplies(spec) && isVueFramework(spec.ui!.framework),

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ui', 'modules', 'user-management-vue'),
      ctx,
      UI_USER_MANAGEMENT_VUE_RECIPE_ID,
      { framework: frameworkContract(ctx.spec) },
    ),

  env: apiUrlEnv,
  codemods: () => [runtimeConfigOp(UI_USER_MANAGEMENT_VUE_RECIPE_ID)],

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'User management',
    body: [
      'A `/users` page: list with search and role filter, invite dialog, inline role changes and',
      'removal. It calls the Users API — see the section above for what that enforces.',
      '',
      'Set `NUXT_PUBLIC_API_URL` to the API’s base URL. Unlike the React builds it is read at',
      'runtime rather than compiled in, so one image runs in every environment.',
      '',
      'Role changes and removals are optimistic: the row updates immediately and rolls back if the',
      'API refuses. That matters because the most common refusal — demoting the last owner — is one',
      'the user needs to see explained rather than silently ignored.',
    ].join('\n'),
  }),
};

export const uiStripeBillingVueRecipe: Recipe = {
  id: UI_STRIPE_BILLING_VUE_RECIPE_ID,
  phase: 'integration',
  layer: 'ui',
  requires: requiresFramework,

  appliesTo: (spec: ProjectSpec) =>
    stripeBillingApplies(spec) && isVueFramework(spec.ui!.framework),

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ui', 'modules', 'stripe-billing-vue'),
      ctx,
      UI_STRIPE_BILLING_VUE_RECIPE_ID,
      { framework: frameworkContract(ctx.spec) },
    ),

  env: apiUrlEnv,
  codemods: () => [runtimeConfigOp(UI_STRIPE_BILLING_VUE_RECIPE_ID)],

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Billing page',
    body: [
      'A `/billing` page: current plan, plan selection, invoice history, and a link into Stripe’s',
      'Customer Portal.',
      '',
      '**There is no card field anywhere in this app, and that is the design.** Choosing a plan',
      'redirects to Stripe Checkout; changing a card or cancelling redirects to the Customer',
      'Portal. Embedding Stripe Elements instead would put card data in your DOM and this',
      'application in PCI DSS scope.',
      '',
      'Amounts arrive in minor units and are formatted with `Intl.NumberFormat`, not divided by',
      '100 — yen has no decimal places and Kuwaiti dinar has three.',
    ].join('\n'),
  }),
};

export const uiSettingsRbacVueRecipe: Recipe = {
  id: UI_SETTINGS_RBAC_VUE_RECIPE_ID,
  phase: 'integration',
  layer: 'ui',
  requires: requiresFramework,

  appliesTo: (spec: ProjectSpec) => settingsRbacApplies(spec) && isVueFramework(spec.ui!.framework),

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ui', 'modules', 'settings-rbac-vue'),
      ctx,
      UI_SETTINGS_RBAC_VUE_RECIPE_ID,
      { framework: frameworkContract(ctx.spec) },
    ),

  env: apiUrlEnv,
  codemods: () => [runtimeConfigOp(UI_SETTINGS_RBAC_VUE_RECIPE_ID)],

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Settings and RBAC',
    body: [
      'A `/settings` page with four panels: organisation, the permission matrix, the audit log and',
      'API keys.',
      '',
      'Tabs are `role="tab"` buttons over one `role="tabpanel"`, not a row of links — that is what',
      'a screen reader announces as a tab set.',
      '',
      '**The matrix overrides the compiled-in policy** in `lib/permissions.ts`. A cell left at its',
      'default follows that file; a changed cell is stored and wins. The API refuses any change',
      'that would leave nobody able to manage settings, and that refusal is surfaced rather than',
      'swallowed.',
      '',
      '**An API key is shown once.** Only a hash is stored, so it cannot be recovered — the list',
      'shows a prefix, which is enough to tell two keys apart and useless to anyone reading over a',
      'shoulder.',
      '',
      '**The audit log is append-only.** There is no endpoint that edits or deletes an entry: a log',
      'an administrator can rewrite is not evidence of anything.',
    ].join('\n'),
  }),
};

export const VUE_PAGE_MODULE_RECIPES = [
  uiUserManagementVueRecipe,
  uiStripeBillingVueRecipe,
  uiSettingsRbacVueRecipe,
];
