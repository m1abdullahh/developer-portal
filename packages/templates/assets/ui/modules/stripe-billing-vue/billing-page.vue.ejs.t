---
to: <%= framework.sourceRoot %><%= framework.routesDir %>/billing.vue
---
<script setup lang="ts">
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
} from '~/lib/billing-api';

/**
 * Billing.
 *
 * Plan selection, the current subscription, and invoice history. Payment methods, plan changes and
 * cancellation are all handled by Stripe's Customer Portal — this page links to it rather than
 * rebuilding it, which is what keeps card data out of this application and it out of PCI scope.
 */
const plans = ref<Plan[]>([]);
const subscription = ref<Subscription | null>(null);
const invoices = ref<Invoice[]>([]);
const error = ref<string | null>(null);
const busy = ref<string | null>(null);

// Only `push`. `<UiToastRegion />` calls `useToasts()` itself and owns dismissal, so also
// destructuring `dismiss` here leaves an unused binding — which this project lints as an error.
const { push } = useToasts();

const STATUS: Record<string, { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> =
  {
    active: { tone: 'success', label: 'Active' },
    trialing: { tone: 'success', label: 'Trialling' },
    past_due: { tone: 'warning', label: 'Payment overdue' },
    unpaid: { tone: 'danger', label: 'Unpaid' },
    canceled: { tone: 'neutral', label: 'Cancelled' },
    none: { tone: 'neutral', label: 'No subscription' },
  };

const status = computed(
  () =>
    STATUS[subscription.value?.status ?? 'none'] ?? {
      tone: 'neutral' as const,
      label: subscription.value?.status ?? 'Unknown',
    },
);

const subscribed = computed(
  () => subscription.value?.status === 'active' || subscription.value?.status === 'trialing',
);

onMounted(async () => {
  // Settled rather than all: an invoice-history failure should not blank the plan list, which is
  // the part someone without a subscription actually came for.
  const [p, s, i] = await Promise.allSettled([getPlans(), getSubscription(), getInvoices()]);
  if (p.status === 'fulfilled') plans.value = p.value;
  if (s.status === 'fulfilled') subscription.value = s.value;
  if (i.status === 'fulfilled') invoices.value = i.value;
  if (s.status === 'rejected') error.value = 'Could not load your subscription.';
});

async function go(label: string, fetchUrl: () => Promise<{ url: string }>) {
  busy.value = label;
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
    busy.value = null;
  }
}

const columns = [
  { key: 'date', header: 'Date', cell: (i: Invoice) => new Date(i.created * 1000).toLocaleDateString() },
  { key: 'number', header: 'Invoice', cell: (i: Invoice) => i.number ?? '—' },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right' as const,
    cell: (i: Invoice) => formatMoney(i.amountPaid, i.currency),
  },
];
</script>

<template>
  <main class="idp-page">
    <h1 class="idp-page__title">Billing</h1>
    <p class="idp-page__lede">Your plan, payment history and receipts.</p>

    <UiCard>
      <UiCardHeader>
        <UiCardTitle>Current plan</UiCardTitle>
        <UiCardDescription>
          {{
            subscription?.cancelAtPeriodEnd
              ? 'Cancels at the end of the current period.'
              : 'Managed through Stripe.'
          }}
        </UiCardDescription>
      </UiCardHeader>
      <UiCardContent>
        <p v-if="error" role="alert" class="idp-page__error">{{ error }}</p>

        <div v-else class="idp-page__status">
          <UiBadge :tone="status.tone">{{ status.label }}</UiBadge>
          <span v-if="subscription?.currentPeriodEnd" class="idp-page__muted">
            {{ subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews' }} on
            {{ new Date(subscription.currentPeriodEnd).toLocaleDateString() }}
          </span>
        </div>

        <div v-if="subscription && subscription.status !== 'none'" class="idp-page__actions">
          <UiButton variant="outline" :disabled="busy !== null" @click="go('portal', openPortal)">
            {{ busy === 'portal' ? 'Opening…' : 'Manage subscription' }}
          </UiButton>
          <p class="idp-page__muted">
            Change plan, update your card or cancel — all in Stripe’s portal.
          </p>
        </div>
      </UiCardContent>
    </UiCard>

    <UiCard v-if="!subscribed" class="idp-page__block">
      <UiCardHeader>
        <UiCardTitle>Plans</UiCardTitle>
        <UiCardDescription>You will be taken to Stripe to complete the payment.</UiCardDescription>
      </UiCardHeader>
      <UiCardContent>
        <p v-if="plans.length === 0" class="idp-page__muted">
          No plans are configured. Set <code>STRIPE_PRICE_BASIC</code> and
          <code>STRIPE_PRICE_PRO</code> in the API’s environment.
        </p>

        <div v-for="plan in plans" v-else :key="plan.id" class="idp-page__plan">
          <strong>{{ plan.name }}</strong>
          <UiButton :disabled="busy !== null" @click="go(plan.id, () => startCheckout(plan.id))">
            {{ busy === plan.id ? 'Redirecting…' : 'Choose' }}
          </UiButton>
        </div>
      </UiCardContent>
    </UiCard>

    <UiCard class="idp-page__block">
      <UiCardHeader>
        <UiCardTitle>Invoices</UiCardTitle>
        <UiCardDescription>Read live from Stripe, never mirrored here.</UiCardDescription>
      </UiCardHeader>
      <UiCardContent>
        <UiTable
          :columns="columns"
          :rows="invoices"
          :row-key="(i: Invoice) => i.id"
          empty="No invoices yet."
        />
      </UiCardContent>
    </UiCard>

    <UiToastRegion />
  </main>
</template>

<style scoped>
.idp-page {
  max-width: 54rem;
  margin: 0 auto;
  padding: 3rem 1.5rem;
}
.idp-page__title {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}
.idp-page__lede {
  font-size: 0.875rem;
  opacity: 0.7;
  margin-top: 0;
}
.idp-page__block {
  margin-top: 1.5rem;
}
.idp-page__status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.idp-page__actions {
  margin-top: 1rem;
}
.idp-page__plan {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.25rem 0;
}
.idp-page__muted {
  font-size: 0.75rem;
  opacity: 0.7;
}
.idp-page__error {
  font-size: 0.875rem;
  color: crimson;
}
</style>
