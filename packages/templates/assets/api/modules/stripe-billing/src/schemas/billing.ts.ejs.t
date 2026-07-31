---
to: src/schemas/billing.ts
---
import { z } from 'zod';

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceId: z.string(),
});

/**
 * Stripe's own status strings, stored and returned verbatim.
 *
 * Not narrowed to a local vocabulary: `past_due` means Stripe is still retrying and the customer
 * is still entitled, while `unpaid` means it has given up. Collapsing both to "inactive" is how a
 * paying customer gets locked out over an expired card.
 */
export const subscriptionSchema = z.object({
  status: z.string(),
  planId: z.string().nullable(),
  priceId: z.string().nullable(),
  currentPeriodEnd: z.date().or(z.string()).nullable(),
  cancelAtPeriodEnd: z.boolean(),
});

export const invoiceSchema = z.object({
  id: z.string(),
  number: z.string().nullable(),
  status: z.string().nullable(),
  /** Minor units — cents, pence. Never a float; see the note in the billing page. */
  amountPaid: z.number().int(),
  currency: z.string(),
  created: z.number().int().describe('Unix seconds'),
  hostedInvoiceUrl: z.string().nullable(),
});

export const checkoutSessionSchema = z.object({
  planId: z.string().min(1),
});

/** Both flows answer with a Stripe-hosted URL for the browser to visit. */
export const redirectSchema = z.object({ url: z.string().url() });
