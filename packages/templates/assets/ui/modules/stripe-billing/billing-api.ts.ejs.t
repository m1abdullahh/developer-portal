---
to: <%= framework.sourceRoot %>lib/billing-api.ts
---
import { env } from '@/lib/env';

/**
 * Typed client for the billing endpoints.
 *
 * Notice what is absent: Stripe.js, a publishable key, and anything resembling a card field. Both
 * flows here answer with a Stripe-hosted URL and the browser navigates to it, which keeps card
 * data out of this application entirely — and this application out of PCI scope.
 */
const BASE = env.<%= framework.publicEnvPrefix %>API_URL.replace(/\/+$/, '');

export interface Plan {
  id: string;
  name: string;
  priceId: string;
}

export interface Subscription {
  /** Stripe's own string: none, trialing, active, past_due, canceled, unpaid. */
  status: string;
  planId: string | null;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface Invoice {
  id: string;
  number: string | null;
  status: string | null;
  /** Minor units — 1999 means £19.99. Never divide before formatting; see formatMoney. */
  amountPaid: number;
  currency: string;
  created: number;
  hostedInvoiceUrl: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    credentials: 'include',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(response.status, body?.message ?? response.statusText);
  }

  return (await response.json()) as T;
}

export async function getPlans(): Promise<Plan[]> {
  return (await request<{ data: Plan[] }>('/billing/plans')).data;
}

export function getSubscription(): Promise<Subscription> {
  return request<Subscription>('/billing/subscription');
}

export async function getInvoices(): Promise<Invoice[]> {
  return (await request<{ data: Invoice[] }>('/billing/invoices')).data;
}

/** Returns the URL to send the browser to. The caller navigates; this does not. */
export function startCheckout(planId: string): Promise<{ url: string }> {
  return request<{ url: string }>('/billing/checkout-session', {
    method: 'POST',
    body: JSON.stringify({ planId }),
  });
}

export function openPortal(): Promise<{ url: string }> {
  return request<{ url: string }>('/billing/portal-session', { method: 'POST' });
}

/**
 * Minor units to a readable amount.
 *
 * `Intl.NumberFormat` with the currency, rather than `/ 100` and a `£` — not every currency has
 * two decimal places. Yen has none and Kuwaiti dinar has three, so dividing by a hardcoded 100
 * misreports both by a factor of a hundred or ten.
 */
export function formatMoney(minorUnits: number, currency: string): string {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  });

  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(minorUnits / 10 ** digits);
}
