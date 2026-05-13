import Stripe from 'stripe';
import { db, log, auditLogger } from './server-context';
import { getErrorMessage } from './server-utils';
import { planByPriceId } from './plan-catalog';
import { dispatchWebhook } from './webhook-helpers';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
  typescript: true,
});

export function stripeAvailable(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Sync a Stripe subscription into wireline_subscriptions + wireline_settings (plan, max_agents, status gates). */
export async function syncSubscriptionFromStripe(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  const { data: existing } = await db
    .from('wireline_subscriptions')
    .select('user_id, status')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!existing?.user_id) {
    log.warn('Stripe sync: no subscription row for customer — skipping mirror', { customerId });
    return;
  }

  const userId = existing.user_id;
  const priceId = sub.items?.data?.[0]?.price?.id || null;
  const plan = planByPriceId(priceId);
  const stripeStatus = sub.status;

  const localStatus =
    stripeStatus === 'active' || stripeStatus === 'trialing'
      ? 'active'
      : stripeStatus === 'past_due' || stripeStatus === 'unpaid'
        ? 'past_due'
        : 'canceled';

  const currentPeriodEndIso = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  const upsertPatch: Record<string, unknown> = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    plan: plan?.id ?? null,
    status: stripeStatus,
    current_period_end: currentPeriodEndIso,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from('wireline_subscriptions')
    .upsert(upsertPatch, { onConflict: 'user_id' });

  if (error) {
    log.error('Stripe mirror upsert failed', { userId, error: error.message });
    throw error;
  }

  const settingsUpsert: Record<string, unknown> = {
    user_id: userId,
    subscription_status: localStatus,
    max_agents: plan?.max_agents ?? 3,
    updated_at: new Date().toISOString(),
  };

  await db.from('wireline_settings').upsert(settingsUpsert, { onConflict: 'user_id' });

  dispatchWebhook(userId, 'subscription.changed', {
    plan: plan?.id ?? null,
    /** Same as tier max_agents: one provisioned voice number per purchased agent seat. */
    voice_number_slots_cap: plan?.max_agents ?? null,
    status: stripeStatus,
    legacy_status: localStatus,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: currentPeriodEndIso,
    at: new Date().toISOString(),
  }).catch((e: unknown) =>
    log.warn('subscription.changed webhook dispatch failed', { userId, error: getErrorMessage(e) }),
  );

  const billingAction: 'subscription_created' | 'subscription_updated' | 'subscription_cancelled' =
    stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired'
      ? 'subscription_cancelled'
      : (sub as Stripe.Subscription & { _auditCreate?: boolean })._auditCreate
        ? 'subscription_created'
        : 'subscription_updated';

  void auditLogger
    .logBilling(billingAction, {
      userId,
      subscriptionId: sub.id,
      customerId,
      plan: plan?.id || undefined,
      metadata: {
        stripe_status: stripeStatus,
        legacy_status: localStatus,
        cancel_at_period_end: !!sub.cancel_at_period_end,
      },
    })
    .catch(() => {});
}
