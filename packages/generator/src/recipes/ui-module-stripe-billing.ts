/**
 * Stripe billing — the UI half (doc 02 §4.3).
 *
 * Plan selection, the current subscription, invoice history, and a link into Stripe's Customer
 * Portal for everything involving a card.
 *
 * ── No publishable key, no Stripe.js ────────────────────────────────────────
 * Doc 02 §4.3 lists `STRIPE_PUBLISHABLE_KEY` among the module's environment. This half does not
 * declare it, because it does not need it: both flows ask the API for a Stripe-hosted URL and the
 * browser navigates there. A publishable key is only required to mount Stripe Elements in-page,
 * which is exactly the thing being avoided — it would put a card field in this application and
 * with it a PCI DSS obligation. Add the key if you later embed Elements.
 */

import { templatePath } from '@idp/templates';
import { isVueFramework, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { frameworkContract, requiresFramework } from '../framework-contract.js';
import { stripeBillingApplies } from './api-module-stripe-billing.js';
import type { CodemodOp, EnvVar, Recipe } from '../types.js';

export const UI_STRIPE_BILLING_RECIPE_ID = 'ui.module.stripe-billing';

function apiUrlKey(spec: ProjectSpec): string {
  return `${frameworkContract(spec).publicEnvPrefix}API_URL`;
}

export const uiStripeBillingRecipe: Recipe = {
  id: UI_STRIPE_BILLING_RECIPE_ID,
  phase: 'integration',
  layer: 'ui',
  requires: requiresFramework,

  appliesTo: (spec: ProjectSpec) =>
    stripeBillingApplies(spec) && !isVueFramework(spec.ui!.framework),

  files: (ctx) =>
    loadTemplateDir(
      templatePath('ui', 'modules', 'stripe-billing'),
      ctx,
      UI_STRIPE_BILLING_RECIPE_ID,
      {
        framework: frameworkContract(ctx.spec),
      },
    ),

  // The same key the other two page modules declare; identical contributions collapse.
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
          lines: [`  ${key}: z.string().url('${key} must be an absolute URL'),`],
          priority: 10,
          recipeId: UI_STRIPE_BILLING_RECIPE_ID,
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
          lines: [`  { path: 'billing', element: <Billing /> },`],
          priority: 40,
          recipeId: UI_STRIPE_BILLING_RECIPE_ID,
        },
      },
      {
        file: 'src/routes.tsx',
        kind: 'addImport',
        args: { module: `./${contract.routesDir}/Billing`, defaultImport: 'Billing' },
      },
    ];
  },

  readme: () => ({
    order: README_ORDER.frontend,
    heading: 'Billing page',
    body: [
      'A `/billing` page: current plan, plan selection, invoice history, and a link into Stripe’s',
      'Customer Portal.',
      '',
      '**There is no card field anywhere in this app, and that is the design.** Choosing a plan',
      'redirects to Stripe Checkout; changing a card or cancelling redirects to the Customer',
      'Portal. Both return to `BILLING_RETURN_URL`. Embedding Stripe Elements instead would put',
      'card data in your DOM and this application in PCI DSS scope.',
      '',
      'Amounts arrive in minor units and are formatted with `Intl.NumberFormat`, not divided by',
      '100 — yen has no decimal places and Kuwaiti dinar has three, so a hardcoded divisor',
      'misreports both.',
      '',
      'Subscription status is Stripe’s own string. `past_due` means Stripe is still retrying and',
      'the customer is still entitled; `unpaid` means it has given up. Collapsing the two is how a',
      'paying customer gets locked out over an expired card.',
    ].join('\n'),
  }),
};
