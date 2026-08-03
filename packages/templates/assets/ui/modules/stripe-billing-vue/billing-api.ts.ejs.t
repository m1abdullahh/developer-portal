---
to: <%= framework.sourceRoot %>lib/billing-api.ts
---
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

/**
 * The API's base URL, from Nuxt's runtime config.
 *
 * NOT from an `env.ts` module, which is what the React clients import. Nuxt has no such file: it
 * reads `runtimeConfig.public` at request time, overridden by `NUXT_PUBLIC_*` environment
 * variables. That difference is worth the divergence — a Next or Vite bundle inlines its public
 * variables at build time, so one image per environment; a Nuxt server reads them at runtime, so
 * the same image runs in staging and production.
 *
 * `useRuntimeConfig()` is called inside the helper rather than at module scope. At module scope it
 * runs before Nuxt has a request context and throws.
 */
function apiBase(): string {
  return String(useRuntimeConfig().public.apiUrl ?? '').replace(/\/+$/, '');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiBase() + path, {
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
 * `Intl.NumberFormat` with the currency, rather than `/ 100` and a currency symbol — not every
 * currency has two decimal places. Yen has none and Kuwaiti dinar has three, so a hardcoded
 * divisor misreports both by a factor of a hundred or ten.
 */
export function formatMoney(minorUnits: number, currency: string): string {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  });

  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(minorUnits / 10 ** digits);
}
