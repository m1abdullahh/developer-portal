---
to: src/routes/stripe-webhook.ts
---
import type { FastifyInstance } from 'fastify';
import type Stripe from 'stripe';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';

/**
 * The Stripe webhook.
 *
 * ── Why this route is registered in its own scope ───────────────────────────
 * Signature verification recomputes an HMAC over the EXACT bytes Stripe sent. Fastify parses
 * `application/json` into an object by default, and `JSON.stringify()`-ing it back produces
 * different bytes — different key order, different whitespace, different unicode escaping — so
 * every signature fails. The failure is total and looks like a wrong secret, which is why people
 * lose hours to it.
 *
 * `register()` creates an encapsulated scope, so the raw-body parser below applies to this route
 * and nothing else. Every other route in the service keeps the normal JSON parsing.
 *
 * ── Why it is not authenticated ─────────────────────────────────────────────
 * Stripe cannot present a JWT. The signature IS the authentication: it proves the request came
 * from Stripe and that the body was not altered, which is strictly stronger than a bearer token
 * that anyone who reads a log could replay.
 *
 * ── Why it answers 200 before doing the work ────────────────────────────────
 * Stripe retries with backoff for up to three days on any non-2xx, and treats a slow response as
 * a failure after 20 seconds. Acknowledging first and processing after means a slow fulfilment
 * never turns into a retry storm. The event is recorded before acknowledging, so nothing is lost
 * if the process dies between the two.
 */
export async function registerStripeWebhook(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    // `parseAs: 'buffer'` hands the untouched bytes to the handler. The `done(null, body)` is the
    // whole parser: it deliberately does no parsing.
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, done) => {
        done(null, body);
      },
    );

    scope.post('/webhooks/stripe', { config: { rawBody: true } }, async (request, reply) => {
      const signature = request.headers['stripe-signature'];

      if (typeof signature !== 'string') {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Missing stripe-signature header.',
          statusCode: 400,
        });
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          request.body as Buffer,
          signature,
          env.STRIPE_WEBHOOK_SECRET,
        );
      } catch (error) {
        // Deliberately terse. Echoing the verification error back tells an attacker probing the
        // endpoint whether they got the timestamp, the payload or the secret wrong.
        request.log.warn({ err: error }, 'stripe webhook signature verification failed');
        return reply
          .status(400)
          .send({ error: 'Bad Request', message: 'Invalid signature.', statusCode: 400 });
      }

      /*
       * Idempotency, using Stripe's own event id as the primary key.
       *
       * Stripe explicitly does not guarantee at-most-once delivery: a retry after a timeout can
       * arrive even though the first attempt succeeded, and events can arrive out of order. An
       * insert that violates the unique constraint means "already seen", which is the whole
       * mechanism — checking with a `findUnique` first would leave a race between the check and
       * the insert that two concurrent deliveries both win.
       */
      try {
        await prisma.webhookEvent.create({ data: { id: event.id, type: event.type } });
      } catch {
        request.log.info({ eventId: event.id }, 'stripe webhook replay ignored');
        return reply.status(200).send({ received: true, duplicate: true });
      }

      // Acknowledged before processing — see the note above about retries.
      void reply.status(200).send({ received: true });

      try {
        await handleEvent(event);
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
      } catch (error) {
        // The row stays with `processedAt` null, which is what makes a failed event findable:
        //   select * from "WebhookEvent" where "processedAt" is null;
        request.log.error({ err: error, eventId: event.id }, 'stripe webhook processing failed');
      }

      return reply;
    });
  });
}

/**
 * The events worth acting on.
 *
 * Subscribe to exactly these in the Stripe dashboard. Every event Stripe sends costs a request
 * and a row here, and a service subscribed to everything spends most of its webhook budget
 * recording events it ignores.
 */
async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (typeof session.customer !== 'string') return;

      await updateCustomer(session.customer, {
        stripeSubscriptionId:
          typeof session.subscription === 'string' ? session.subscription : null,
        status: 'active',
      });
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      if (typeof subscription.customer !== 'string') return;

      const item = subscription.items.data[0];

      await updateCustomer(subscription.customer, {
        stripeSubscriptionId: subscription.id,
        // Stripe's own status string, stored verbatim: `active`, `past_due`, `canceled`,
        // `trialing`, `unpaid`. Mapping it to a local vocabulary loses the distinction between
        // `past_due` (retrying, still entitled) and `unpaid` (given up, not entitled).
        status: subscription.status,
        priceId: item?.price.id ?? null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: item?.current_period_end
          ? new Date(item.current_period_end * 1000)
          : null,
      });
      return;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      if (typeof invoice.customer !== 'string') return;

      // Not a cancellation. Stripe retries a failed payment on its own schedule, and revoking
      // access on the first failure locks out customers whose card simply expired.
      await updateCustomer(invoice.customer, { status: 'past_due' });
      return;
    }

    default:
      // Unhandled types are recorded and ignored rather than treated as an error — the set of
      // events Stripe sends grows, and a 500 on an unrecognised one would trigger retries.
      return;
  }
}

/**
 * An update, never an insert.
 *
 * The row is created by `/billing/checkout-session` before Checkout begins, because only that
 * request knows which account the subscription belongs to. `updateMany` rather than `update` so
 * an event for a customer created directly in the Stripe dashboard — which has no local owner —
 * is a no-op instead of a throw that would leave the event marked unprocessed forever.
 */
async function updateCustomer(
  stripeCustomerId: string,
  data: {
    stripeSubscriptionId?: string | null;
    status?: string;
    priceId?: string | null;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: Date | null;
  },
): Promise<void> {
  await prisma.billingCustomer.updateMany({ where: { stripeCustomerId }, data });
}
