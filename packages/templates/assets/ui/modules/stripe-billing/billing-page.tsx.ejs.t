---
to: <%= framework.routing === 'file-based' ? framework.sourceRoot + 'app/billing/page.tsx' : framework.sourceRoot + 'pages/Billing.tsx' %>
---
<% if (framework.clientDirective) { -%>
'use client';

<% } -%>
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, type Column } from '@/components/ui/table';
import { ToastRegion, useToasts } from '@/components/ui/toast';
import {
  ApiError,
  formatMoney,
  getInvoices,
  getPlans,
  getSubscription,
  openPortal,
  startCheckout,
  type Invoice,
  type Plan,
  type Subscription,
} from '@/lib/billing-api';

/**
 * Billing.
 *
 * Plan selection, the current subscription, and invoice history. Payment methods, plan changes and
 * cancellation are all handled by Stripe's Customer Portal — this page links to it rather than
 * rebuilding it, which is what keeps card data out of this application.
 */

/** Stripe's statuses, mapped to how each should read. */
const STATUS: Record<string, { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> =
  {
    active: { tone: 'success', label: 'Active' },
    trialing: { tone: 'success', label: 'Trialling' },
    past_due: { tone: 'warning', label: 'Payment overdue' },
    unpaid: { tone: 'danger', label: 'Unpaid' },
    canceled: { tone: 'neutral', label: 'Cancelled' },
    none: { tone: 'neutral', label: 'No subscription' },
  };

export default function Billing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  useEffect(() => {
    // Settled rather than all: an invoice-history failure should not blank the plan list, which
    // is the part someone without a subscription actually came for.
    void Promise.allSettled([getPlans(), getSubscription(), getInvoices()]).then(
      ([p, s, i]) => {
        if (p.status === 'fulfilled') setPlans(p.value);
        if (s.status === 'fulfilled') setSubscription(s.value);
        if (i.status === 'fulfilled') setInvoices(i.value);
        if (s.status === 'rejected') setError('Could not load your subscription.');
      },
    );
  }, []);

  async function go(label: string, fetchUrl: () => Promise<{ url: string }>) {
    setBusy(label);
    try {
      // A full navigation, not a new tab: Checkout and the portal both return the customer here
      // afterwards, and a popup would be blocked because this runs after an await rather than
      // directly in the click handler.
      window.location.href = (await fetchUrl()).url;
    } catch (cause) {
      push({
        message: cause instanceof ApiError ? cause.message : 'Could not reach Stripe.',
        tone: 'danger',
        duration: 0,
      });
      setBusy(null);
    }
  }

  const status = STATUS[subscription?.status ?? 'none'] ?? {
    tone: 'neutral' as const,
    label: subscription?.status ?? 'Unknown',
  };

  const columns: Column<Invoice>[] = [
    { key: 'date', header: 'Date', cell: (i) => new Date(i.created * 1000).toLocaleDateString() },
    { key: 'number', header: 'Invoice', cell: (i) => i.number ?? '—' },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (i) => formatMoney(i.amountPaid, i.currency),
    },
    {
      key: 'link',
      header: '',
      align: 'right',
      cell: (i) =>
        i.hostedInvoiceUrl ? (
          <a href={i.hostedInvoiceUrl} target="_blank" rel="noreferrer noopener">
            View
          </a>
        ) : null,
    },
  ];

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Billing</h1>
      <p style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: 0 }}>
        Your plan, payment history and receipts.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            {subscription?.cancelAtPeriodEnd
              ? 'Cancels at the end of the current period.'
              : 'Managed through Stripe.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p role="alert" style={{ fontSize: '0.875rem', color: 'crimson' }}>
              {error}
            </p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Badge tone={status.tone}>{status.label}</Badge>
              {subscription?.currentPeriodEnd ? (
                <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                  {subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </span>
              ) : null}
            </div>
          )}

          {subscription && subscription.status !== 'none' ? (
            <div style={{ marginTop: '1rem' }}>
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() => void go('portal', openPortal)}
              >
                {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
              </Button>
              <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                Change plan, update your card or cancel — all in Stripe’s portal.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {subscription?.status !== 'active' && subscription?.status !== 'trialing' ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Plans</CardTitle>
            <CardDescription>You will be taken to Stripe to complete the payment.</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {plans.length === 0 ? (
                <p style={{ fontSize: '0.875rem', opacity: 0.7, margin: 0 }}>
                  No plans are configured. Set <code>STRIPE_PRICE_BASIC</code> and{' '}
                  <code>STRIPE_PRICE_PRO</code> in the API’s environment.
                </p>
              ) : (
                plans.map((plan) => (
                  <div
                    key={plan.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                    }}
                  >
                    <strong style={{ fontSize: '0.9375rem' }}>{plan.name}</strong>
                    <Button
                      disabled={busy !== null}
                      onClick={() => void go(plan.id, () => startCheckout(plan.id))}
                    >
                      {busy === plan.id ? 'Redirecting…' : 'Choose'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Read live from Stripe, never mirrored here.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table
            columns={columns}
            rows={invoices}
            rowKey={(invoice) => invoice.id}
            empty="No invoices yet."
          />
        </CardContent>
      </Card>

      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}
