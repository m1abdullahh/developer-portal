---
to: src/routes/billing.ts
---
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { planForPrice, plans, stripe } from '../lib/stripe.js';
import { commonResponses, errorSchema } from '../schemas/common.js';
import {
  checkoutSessionSchema,
  invoiceSchema,
  planSchema,
  redirectSchema,
  subscriptionSchema,
} from '../schemas/billing.js';

/**
 * Billing.
 *
 * ── What this deliberately does not build ───────────────────────────────────
 * There is no card form anywhere in this service, and no endpoint that accepts a card number.
 * Collecting card details yourself pulls the whole application into PCI DSS scope; sending the
 * customer to Stripe's hosted Checkout and Customer Portal keeps it out. That is why "manage
 * payment methods" and "upgrade/downgrade" are both a redirect rather than a form.
 *
 * ── The state of record lives in Stripe ─────────────────────────────────────
 * `BillingCustomer` is a cache the webhook maintains, not the truth. Anything that decides
 * entitlement should read it, because it is local and fast, but it can lag by the delivery time
 * of a webhook — so nothing here writes subscription state directly.
 */
export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  const route = app.withTypeProvider<ZodTypeProvider>();

  route.get(
    '/billing/plans',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['billing'],
        summary: 'The plans this service sells',
        response: { 200: z.object({ data: z.array(planSchema) }), ...commonResponses },
      },
    },
    async () => ({ data: plans() }),
  );

  route.get(
    '/billing/subscription',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['billing'],
        summary: 'The current subscription, from the local cache',
        response: { 200: subscriptionSchema, ...commonResponses },
      },
    },
    async (request) => {
      const record = await customerFor(request);

      if (!record) {
        // A customer who has never checked out has no Stripe customer at all. `none` is a real
        // state, distinct from a cancelled subscription, and the page renders them differently.
        return {
          status: 'none',
          planId: null,
          priceId: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        };
      }

      return {
        status: record.status,
        planId: planForPrice(record.priceId)?.id ?? null,
        priceId: record.priceId,
        currentPeriodEnd: record.currentPeriodEnd,
        cancelAtPeriodEnd: record.cancelAtPeriodEnd,
      };
    },
  );

  route.post(
    '/billing/checkout-session',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['billing'],
        summary: 'Start a Checkout session for a plan',
        body: checkoutSessionSchema,
        // 502 is declared, not merely returned. The Zod type provider narrows `reply.status()` to
        // the codes in this map, so an undocumented status is a compile error — which is the
        // behaviour you want: a generated client only handles what the document describes.
        response: {
          200: redirectSchema,
          502: errorSchema.describe('Stripe did not return a usable session'),
          ...commonResponses,
        },
      },
    },
    async (request, reply) => {
      const plan = plans().find((p) => p.id === request.body.planId);
      if (!plan) {
        // The price id comes from our own configuration, never from the request body. Taking it
        // from the client would let anyone subscribe themselves at any price in the account —
        // including a one-penny test price.
        return reply.status(400).send({
          error: 'Bad Request',
          message: `Unknown plan "${request.body.planId}".`,
          statusCode: 400,
        });
      }

      // The local row is created BEFORE Checkout, not by the webhook afterwards.
      //
      // Stripe does not guarantee webhook ordering, so `customer.subscription.created` can arrive
      // before `checkout.session.completed`. Only the latter carries our own identity, so a
      // webhook-created row would sometimes have no owner and the subscription would attach to
      // nobody. Creating it here means every event afterwards is a plain update.
      const customer = await ensureCustomer(request);

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: plan.priceId, quantity: 1 }],
        customer: customer.stripeCustomerId,
        // Not needed to attach the subscription any more — the customer already exists — but kept
        // because it puts our own id on the session in Stripe's dashboard, which is what you want
        // when reconciling a payment by hand.
        client_reference_id: subjectOf(request),
        success_url: `${env.BILLING_RETURN_URL}?checkout=success`,
        cancel_url: `${env.BILLING_RETURN_URL}?checkout=cancelled`,
      });

      if (!session.url) {
        return reply.status(502).send({
          error: 'Bad Gateway',
          message: 'Stripe did not return a checkout URL.',
          statusCode: 502,
        });
      }

      return { url: session.url };
    },
  );

  route.post(
    '/billing/portal-session',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['billing'],
        summary: 'Open the Stripe Customer Portal',
        response: {
          200: redirectSchema,
          409: errorSchema.describe('No billing account exists yet'),
          ...commonResponses,
        },
      },
    },
    async (request, reply) => {
      const existing = await customerFor(request);
      if (!existing) {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'There is no billing account yet. Subscribe to a plan first.',
          statusCode: 409,
        });
      }

      // Everything the portal offers — payment methods, invoices, plan changes, cancellation —
      // is configured in the Stripe dashboard rather than here. That is the point: it stays
      // correct across Stripe's own changes without this service being redeployed.
      const session = await stripe.billingPortal.sessions.create({
        customer: existing.stripeCustomerId,
        return_url: env.BILLING_RETURN_URL,
      });

      return { url: session.url };
    },
  );

  route.get(
    '/billing/invoices',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['billing'],
        summary: 'Invoice history, read live from Stripe',
        response: { 200: z.object({ data: z.array(invoiceSchema) }), ...commonResponses },
      },
    },
    async (request) => {
      const existing = await customerFor(request);
      if (!existing) return { data: [] };

      // Read from Stripe rather than mirrored locally: invoices are immutable once issued and
      // rarely listed, so a local copy would be a synchronisation problem bought for nothing.
      const invoices = await stripe.invoices.list({
        customer: existing.stripeCustomerId,
        limit: 24,
      });

      return {
        data: invoices.data.map((invoice) => ({
          id: invoice.id ?? '',
          number: invoice.number ?? null,
          status: invoice.status ?? null,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          created: invoice.created,
          hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        })),
      };
    },
  );
}

/**
 * The authenticated caller's identity.
 *
 * The JWT subject, which is what `client_reference_id` carries through Checkout. In a service
 * with per-organisation billing this is where you would resolve the caller's organisation
 * instead — the rest of this file does not care which it is.
 */
function subjectOf(request: FastifyRequest): string {
  return request.user.sub;
}

function customerFor(request: FastifyRequest) {
  return prisma.billingCustomer.findUnique({ where: { ownerId: subjectOf(request) } });
}

/**
 * The local row and its Stripe customer, creating both on first use.
 *
 * Two writes that must not half-succeed: a Stripe customer with no local row is an orphan nobody
 * can find, and a local row pointing at a customer that does not exist breaks every later call.
 * The Stripe call happens first and the local insert second, so the failure mode is an unused
 * Stripe customer — harmless, and visible in the dashboard — rather than a dangling reference.
 */
async function ensureCustomer(request: FastifyRequest) {
  const existing = await customerFor(request);
  if (existing) return existing;

  const ownerId = subjectOf(request);
  const customer = await stripe.customers.create({
    // Written into Stripe so the two systems can be reconciled from either side.
    metadata: { ownerId },
  });

  return prisma.billingCustomer.create({
    data: { ownerId, stripeCustomerId: customer.id, status: 'none' },
  });
}
