---
to: src/lib/stripe.ts
---
import Stripe from 'stripe';
import { env } from '../config/env.js';

/**
 * The Stripe client.
 *
 * One instance for the process: it holds a keep-alive HTTP agent, and creating one per request
 * would open a new TLS connection every time.
 */
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  // Pinned, not left to the account default. Stripe evolves its API and an account-default client
  // silently follows, so a field this code depends on can change shape without anything here being
  // edited. Bump it deliberately, after reading the changelog.
  //
  // The type is a literal union matching the SDK's own build, so a version the installed SDK does
  // not know about is a compile error rather than a runtime surprise.
  apiVersion: '2026-07-29.dahlia',
  // Shows up in the Stripe dashboard's request log, which is where you look when a call fails.
  appInfo: { name: '<%= spec.meta.projectName %>' },
});

/**
 * The plans this service sells, read from the environment.
 *
 * Price ids belong in configuration rather than in code: they differ between Stripe's test and
 * live modes, so hardcoding them means a deploy to production charges nobody. Add a tier by adding
 * an env var and a line here.
 */
export interface Plan {
  id: string;
  name: string;
  priceId: string;
}

export function plans(): Plan[] {
  return [
    { id: 'basic', name: 'Basic', priceId: env.STRIPE_PRICE_BASIC },
    { id: 'pro', name: 'Pro', priceId: env.STRIPE_PRICE_PRO },
  ].filter((plan) => plan.priceId !== '');
}

export function planForPrice(priceId: string | null | undefined): Plan | null {
  return plans().find((plan) => plan.priceId === priceId) ?? null;
}
