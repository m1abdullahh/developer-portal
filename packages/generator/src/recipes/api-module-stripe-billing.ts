/**
 * Stripe billing — the API half (doc 02 §4.3).
 *
 * Checkout and Customer Portal sessions, invoice history, and a signature-verified webhook with
 * idempotency keys. Split from the UI half like the other modules.
 *
 * ── What is deliberately absent ─────────────────────────────────────────────
 * Any endpoint that accepts card details. Collecting them pulls the whole application into PCI DSS
 * scope; redirecting to Stripe's hosted Checkout and Customer Portal keeps it out. That single
 * decision is why "manage payment methods" and "upgrade/downgrade" are a redirect rather than a
 * form, and it is the most consequential thing in this module.
 */

import { templatePath } from '@idp/templates';
import { dependencyMap, type ProjectSpec } from '@idp/core';
import { loadTemplateDir } from '../template-loader.js';
import { README_ORDER } from '../merge/readme.js';
import { MIDDLEWARE_PRIORITY } from '../codemod/markers.js';
import { REST_RECIPE_ID } from './api-rest.js';
import { PRISMA_RECIPE_ID } from './api-prisma.js';
import { AUTH_JWT_RECIPE_ID } from './api-middleware.js';
import type { CodemodOp, EnvVar, Recipe } from '../types.js';

export const API_STRIPE_BILLING_RECIPE_ID = 'api.module.stripe-billing';

/**
 * Applicability, shared with the UI half.
 *
 * Auth is required beyond the wizard's gate: every billing route calls `app.requireAuth`, and a
 * billing endpoint anyone can call is not a billing endpoint. The webhook is the sole exception —
 * its signature is its authentication.
 */
export function stripeBillingApplies(spec: ProjectSpec): boolean {
  return (
    spec.ui?.modules.stripeBilling === true &&
    spec.api?.runtime === 'node-ts' &&
    spec.api.paradigm === 'rest' &&
    spec.api.orm === 'prisma' &&
    spec.api.middleware.auth !== 'none'
  );
}

const MODELS = [
  '/// A cache of what Stripe knows, maintained by the webhook. Stripe remains the state of',
  '/// record — read this for entitlement because it is local and fast, but expect it to lag by',
  '/// the delivery time of a webhook.',
  'model BillingCustomer {',
  '  id                   String    @id @default(cuid())',
  '  /// The JWT subject this billing account belongs to. Set before Checkout begins, because',
  '  /// only that request knows it — no webhook carries our own identity reliably.',
  '  ownerId              String    @unique',
  '  stripeCustomerId     String    @unique',
  '  stripeSubscriptionId String?   @unique',
  '  /// Stripe’s own string, verbatim: none, trialing, active, past_due, canceled, unpaid.',
  '  /// Not narrowed — past_due (still retrying, still entitled) and unpaid (given up) must',
  '  /// stay distinguishable.',
  '  status               String    @default("none")',
  '  priceId              String?',
  '  currentPeriodEnd     DateTime?',
  '  cancelAtPeriodEnd    Boolean   @default(false)',
  '  createdAt            DateTime  @default(now())',
  '  updatedAt            DateTime  @updatedAt',
  '',
  '  @@index([status])',
  '}',
  '',
  '/// The idempotency ledger. Stripe’s event id IS the primary key, so a redelivery violates the',
  '/// constraint and is rejected by the database rather than by a check-then-insert race.',
  'model WebhookEvent {',
  '  id          String    @id',
  '  type        String',
  '  receivedAt  DateTime  @default(now())',
  '  /// Null means received but not yet handled. `where processedAt is null` finds every event',
  '  /// whose processing failed.',
  '  processedAt DateTime?',
  '',
  '  @@index([processedAt])',
  '}',
];

/**
 * Placeholders only, exactly as doc 02 §4.3 requires.
 *
 * A generator that writes a real Stripe key into a file is a generator that commits one. The
 * secret-marked entries get no example value at all and surface in SECRETS.md instead.
 */
const ENV: EnvVar[] = [
  {
    key: 'STRIPE_SECRET_KEY',
    example: '',
    required: true,
    description: 'Stripe secret key (sk_test_… or sk_live_…). Never the publishable key.',
    secret: true,
  },
  {
    key: 'STRIPE_WEBHOOK_SECRET',
    example: '',
    required: true,
    description:
      'Signing secret for the webhook endpoint (whsec_…). Different per endpoint and per mode.',
    secret: true,
  },
  {
    key: 'STRIPE_PRICE_BASIC',
    example: 'price_basic_placeholder',
    required: false,
    description: 'Price id for the Basic plan. Differs between test and live mode.',
  },
  {
    key: 'STRIPE_PRICE_PRO',
    example: 'price_pro_placeholder',
    required: false,
    description: 'Price id for the Pro plan. Differs between test and live mode.',
  },
  {
    key: 'BILLING_RETURN_URL',
    example: 'http://localhost:3000/billing',
    required: true,
    description: 'Where Stripe returns the customer after Checkout or the Customer Portal.',
  },
];

export const apiStripeBillingRecipe: Recipe = {
  id: API_STRIPE_BILLING_RECIPE_ID,
  phase: 'integration',
  layer: 'api',
  requires: [REST_RECIPE_ID, PRISMA_RECIPE_ID, AUTH_JWT_RECIPE_ID],

  appliesTo: stripeBillingApplies,

  files: (ctx) =>
    loadTemplateDir(
      templatePath('api', 'modules', 'stripe-billing'),
      ctx,
      API_STRIPE_BILLING_RECIPE_ID,
    ),

  packageJson: () => ({ dependencies: dependencyMap(['stripe']) }),

  env: () => ENV,

  codemods: (): CodemodOp[] => [
    {
      file: 'prisma/schema.prisma',
      kind: 'insertAtMarker',
      args: {
        marker: 'models',
        lines: MODELS,
        priority: 30,
        recipeId: API_STRIPE_BILLING_RECIPE_ID,
      },
    },
    {
      file: 'src/config/env.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'env-schema',
        lines: [
          "STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),",
          "STRIPE_WEBHOOK_SECRET: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),",
          // Defaulted rather than required: a service can ship with one plan configured, or none
          // while the prices are still being set up in Stripe. `plans()` filters out the empties.
          "STRIPE_PRICE_BASIC: z.string().default(''),",
          "STRIPE_PRICE_PRO: z.string().default(''),",
          "BILLING_RETURN_URL: z.string().url('BILLING_RETURN_URL must be an absolute URL'),",
        ],
        priority: 60,
        recipeId: API_STRIPE_BILLING_RECIPE_ID,
      },
    },
    {
      file: 'src/server.ts',
      kind: 'insertAtMarker',
      args: {
        marker: 'routes',
        lines: ['await registerBillingRoutes(app);', 'await registerStripeWebhook(app);'],
        priority: MIDDLEWARE_PRIORITY.routes,
        recipeId: API_STRIPE_BILLING_RECIPE_ID,
      },
    },
    {
      file: 'src/server.ts',
      kind: 'addImport',
      args: { module: './routes/billing.js', named: ['registerBillingRoutes'] },
    },
    {
      file: 'src/server.ts',
      kind: 'addImport',
      args: { module: './routes/stripe-webhook.js', named: ['registerStripeWebhook'] },
    },
  ],

  readme: () => ({
    order: README_ORDER.backend,
    heading: 'Billing',
    body: [
      '| Method | Path | What |',
      '| --- | --- | --- |',
      '| `GET` | `/billing/plans` | Plans, from `STRIPE_PRICE_*` |',
      '| `GET` | `/billing/subscription` | Current state, from the local cache |',
      '| `POST` | `/billing/checkout-session` | Returns a Stripe Checkout URL |',
      '| `POST` | `/billing/portal-session` | Returns a Customer Portal URL |',
      '| `GET` | `/billing/invoices` | Read live from Stripe |',
      '| `POST` | `/webhooks/stripe` | Signature-verified, unauthenticated |',
      '',
      '**No endpoint accepts card details, deliberately.** Collecting them puts this service in',
      'PCI DSS scope; Stripe’s hosted Checkout and Customer Portal keep it out. Plan changes,',
      'card updates and cancellation all happen in the portal.',
      '',
      '**Three things to know before changing the webhook:**',
      '',
      'It is registered in its own Fastify scope with a raw-body parser. Signature verification',
      'hashes the exact bytes Stripe sent, and re-serialising a parsed object produces different',
      'bytes — every signature then fails in a way that looks like a wrong secret.',
      '',
      'It is unauthenticated on purpose. Stripe cannot present a JWT; the signature is the',
      'authentication, and it is stronger than a bearer token anyone reading a log could replay.',
      '',
      'It answers `200` before doing the work. Stripe retries for up to three days on a non-2xx',
      'and treats 20 seconds as a failure, so slow fulfilment would become a retry storm. The',
      'event row is written first, so nothing is lost if the process dies in between.',
      '',
      '**Subscribe to exactly these events:** `checkout.session.completed`,',
      '`customer.subscription.created|updated|deleted`, `invoice.payment_failed`. Every other',
      'event costs a request and a row for nothing.',
      '',
      '```bash',
      'stripe listen --forward-to localhost:3001/webhooks/stripe',
      '```',
    ].join('\n'),
  }),
};
