import Stripe from "stripe";
import { drizzle, log, auditLogger } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";
import {
  STRIPE_PLANS,
  planById,
  planExtraAgentPriceId,
  planLookupKey,
  planPriceId,
  type StripePlan,
} from "./plan-catalog";
import { dispatchWebhook } from "./webhook-helpers";
import { invalidateDashboard } from "./dashboard-cache";
import {
  grantSubscriptionRuntimeAllowance,
  type SubscriptionBillingInterval,
} from "./subscription-welcome-credit";

export const STRIPE_API_VERSION = "2026-04-22.dahlia" as Stripe.LatestApiVersion;

const configuredStripeSecret = String(process.env.STRIPE_SECRET_KEY || "").trim();
const previewAllowsLiveProviders =
  process.env.WIRELINE_ALLOW_LIVE_PROVIDER_KEYS_IN_PREVIEW === "true";
const stripeBlockedInPreview =
  process.env.VERCEL_ENV === "preview" &&
  configuredStripeSecret.startsWith("sk_live_") &&
  !previewAllowsLiveProviders;

if (stripeBlockedInPreview) {
  // Defense in depth: Vercel can inherit production-scoped values into a preview
  // project configuration. Refuse to expose live billing credentials to preview
  // routes even when the dashboard is mis-scoped.
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
}

const effectiveStripeSecret = stripeBlockedInPreview ? "" : configuredStripeSecret;

export const stripe = new Stripe(effectiveStripeSecret || "sk_test_placeholder", {
  apiVersion: STRIPE_API_VERSION,
  typescript: true,
});

export function stripeAvailable(): boolean {
  return Boolean(effectiveStripeSecret);
}

/**
 * True when Stripe reports the object simply does not exist, as opposed to a
 * transient failure. The distinction decides retry posture everywhere we
 * re-fetch: a missing object is a permanent answer to act on, while any other
 * error must escape so the caller (or Stripe's webhook retry) tries again.
 *
 * `raw.code` is not optional detail — the Node SDK surfaces the API error code
 * there on StripeInvalidRequestError, and a copy that only reads the top-level
 * `code`/`statusCode` misses real resource_missing responses and throws where
 * it should have handled.
 */
export function isMissingStripeResource(error: unknown): boolean {
  const stripeError = error as {
    code?: string;
    statusCode?: number;
    raw?: { code?: string };
  };
  return (
    stripeError?.statusCode === 404 ||
    stripeError?.code === "resource_missing" ||
    stripeError?.raw?.code === "resource_missing"
  );
}

/**
 * Postpaid metered overage is intentionally retired. Variable voice, SMS,
 * enrichment, and other provider-funded work must be covered by prepaid
 * Runtime Balance instead of appearing as an unexpected invoice item.
 */
export function voiceOverageBillingConfigured(_plan: StripePlan): boolean {
  return false;
}

/**
 * Resolve only true base-plan prices. Add-on prices can share a subscription
 * with the base plan, but must never overwrite wireline_subscriptions.plan.
 */
function basePlanByStripePrice(price: Stripe.Price | null | undefined): StripePlan | null {
  if (!price) return null;

  const metadataPlan = planById(price.metadata?.wireline_plan_id);
  if (metadataPlan) return metadataPlan;

  const lookupKey = price.lookup_key?.trim() || null;
  if (lookupKey) {
    const lookupMatch = STRIPE_PLANS.find(
      (plan) =>
        planLookupKey(plan, "month") === lookupKey || planLookupKey(plan, "year") === lookupKey,
    );
    if (lookupMatch) return lookupMatch;
  }

  if (price.id) {
    return (
      STRIPE_PLANS.find(
        (plan) => planPriceId(plan, "month") === price.id || planPriceId(plan, "year") === price.id,
      ) || null
    );
  }

  return null;
}

function basePlanByStripePriceId(priceId: string | null | undefined): StripePlan | null {
  if (!priceId) return null;
  return (
    STRIPE_PLANS.find(
      (plan) => planPriceId(plan, "month") === priceId || planPriceId(plan, "year") === priceId,
    ) || null
  );
}

function isExtraAgentPrice(price: Stripe.Price | null | undefined): boolean {
  if (!price) return false;
  if (price.metadata?.wireline_addon_id === "extra_agent") return true;
  if (price.lookup_key === "extra_agent_monthly_founder_2026_07_v3") return true;
  return STRIPE_PLANS.some((plan) => planExtraAgentPriceId(plan) === price.id);
}

type StripeInvoiceLineCompat = Stripe.InvoiceLineItem & {
  /** Present before the Basil invoice-line shape migration. */
  price?: Stripe.Price | string | null;
  /** Present on Basil/Dahlia and newer invoice-line payloads. */
  pricing?: {
    type?: string | null;
    price_details?: {
      price?: Stripe.Price | string | null;
    } | null;
  } | null;
};

function basePlanFromInvoiceLine(line: Stripe.InvoiceLineItem): StripePlan | null {
  const compat = line as StripeInvoiceLineCompat;
  const currentPrice =
    compat.pricing?.type === "price_details" ? compat.pricing.price_details?.price : null;
  const candidate = currentPrice ?? compat.price;
  return typeof candidate === "string"
    ? basePlanByStripePriceId(candidate)
    : basePlanByStripePrice(candidate);
}

/**
 * Share of an invoice's pre-tax line total that funded the base plan (0–1], or
 * null when the invoice funded no base-plan allowance at all. Refund/dispute
 * reversals must scale by this share: a separate add-on invoice (e.g. a
 * monthly extra-agent charge on an annual plan) never funded the Runtime
 * Allowance, so refunding it must not claw the allowance back. Scaling keeps
 * cumulative partial reversals at or below the grant for the same reason the
 * reversal itself rounds down.
 */
export function basePlanInvoiceShare(invoice: Stripe.Invoice): number | null {
  let baseCents = 0;
  let totalCents = 0;
  for (const line of invoice.lines?.data ?? []) {
    const amount = line.amount || 0;
    totalCents += amount;
    if (basePlanFromInvoiceLine(line)) baseCents += amount;
  }
  if (baseCents <= 0 || totalCents <= 0) return null;
  return Math.min(1, baseCents / totalCents);
}

function extraAgentQuantityFromSubscription(sub: Stripe.Subscription): number {
  return sub.items.data.reduce((total, item) => {
    if (!isExtraAgentPrice(item.price)) return total;
    return total + Math.max(0, item.quantity ?? 0);
  }, 0);
}

/**
 * Compatibility no-op retained for callers that still reconcile completed
 * voice usage. The runtime ledger is the billing source of truth; Stripe meter
 * events must never be emitted under the prepaid founder model.
 */
export async function emitVoiceMinuteOverageEvent(_opts: {
  customerId: string;
  minutes: number;
  vapiCallId: string;
}): Promise<void> {
  return;
}

export function subscriptionBillingInterval(sub: Stripe.Subscription): SubscriptionBillingInterval {
  return sub.items.data.some((item) => item.price.recurring?.interval === "year")
    ? "year"
    : "month";
}

/**
 * Read the current billing period from a subscription across Stripe API
 * versions. Stripe's Basil release moved `current_period_start`/`_end` off the
 * Subscription object onto its items; the pinned runtime version is post-Basil,
 * so the fields live on `items.data[]` at runtime even though the SDK's types
 * (pre-Basil) still declare them on the subscription. Read items first, fall
 * back to the legacy top-level fields.
 */
type StripePeriodFields = {
  current_period_start?: number | null;
  current_period_end?: number | null;
};

function subscriptionPeriod(sub: Stripe.Subscription): {
  start: number | null;
  end: number | null;
} {
  const items = (sub.items?.data ?? []) as (Stripe.SubscriptionItem & StripePeriodFields)[];
  // The period must track the base-plan item. An add-on (e.g. a monthly
  // extra-agent seat) carries its own period, and Stripe has been observed
  // returning it at index 0 — reading that item would advance the allowance
  // period reference monthly on an annual subscription and re-grant the full
  // annual Runtime Allowance every month.
  const baseItem = items.find((item) => basePlanByStripePrice(item.price)) ?? items[0];
  const legacy = sub as Stripe.Subscription & StripePeriodFields;
  return {
    start: baseItem?.current_period_start ?? legacy.current_period_start ?? null,
    end: baseItem?.current_period_end ?? legacy.current_period_end ?? null,
  };
}

/**
 * Stable period reference for the included Runtime Allowance ledger grant.
 * Stripe can replay subscription webhooks; the ledger's idempotency key ensures
 * one grant per subscription billing period even when sync runs repeatedly.
 * The period start must advance each cycle so renewals re-grant the allowance —
 * billing_cycle_anchor is constant for the subscription's life and is only a
 * last-resort fallback.
 */
function subscriptionPeriodReference(sub: Stripe.Subscription): string {
  const periodStart = subscriptionPeriod(sub).start || sub.billing_cycle_anchor || sub.created;
  return `${sub.id}:${periodStart}`;
}

/** Stripe statuses that represent an entitlement-bearing or recoverable plan. */
const CURRENT_PLAN_SUBSCRIPTION_STATUSES = new Set<string>([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
]);

/** Stripe subscription statuses that are finished for good. */
const TERMINAL_SUBSCRIPTION_STATUSES = new Set<string>(["canceled", "incomplete_expired"]);

function isWirelinePlanSubscription(sub: Stripe.Subscription): boolean {
  if (sub.metadata?.purpose === "live_video_addon") return false;
  return sub.items?.data?.some((item) => !!basePlanByStripePrice(item.price)) ?? false;
}

/**
 * Read the customer's CURRENT plan-subscription state from Stripe.
 *
 * Webhook event delivery order is explicitly not guaranteed. Therefore an event
 * payload is evidence that something happened, not an ordering oracle for the
 * current one-row entitlement mirror. On every configured Stripe sync we list
 * the customer's subscriptions and select the single authoritative Wireline
 * plan object in its current state. This also fixes same-subscription reordering:
 * a delayed `updated(active)` payload cannot restore service after Stripe already
 * reports that same subscription as canceled.
 *
 * Multiple simultaneous live plan subscriptions are an invariant violation. Do
 * not guess which paying contract owns entitlements; throw so the webhook claim
 * is released and ops can repair the duplicate instead of silently choosing one.
 */
async function currentPlanSubscriptionForCustomer(
  customerId: string,
): Promise<Stripe.Subscription | null> {
  const candidates: Stripe.Subscription[] = [];
  for await (const candidate of stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  })) {
    if (isWirelinePlanSubscription(candidate)) candidates.push(candidate);
  }

  const current = candidates.filter((candidate) =>
    CURRENT_PLAN_SUBSCRIPTION_STATUSES.has(candidate.status),
  );
  if (current.length > 1) {
    log.error("Stripe sync: multiple current Wireline plan subscriptions for one customer", {
      customerId,
      subscriptionIds: current.map((candidate) => candidate.id),
      statuses: current.map((candidate) => candidate.status),
    });
    throw new Error("Multiple current Stripe plan subscriptions require reconciliation");
  }
  if (current.length === 1) return current[0];

  const incomplete = candidates.filter((candidate) => candidate.status === "incomplete");
  if (incomplete.length > 1) {
    log.error("Stripe sync: multiple incomplete Wireline plan subscriptions for one customer", {
      customerId,
      subscriptionIds: incomplete.map((candidate) => candidate.id),
    });
    throw new Error("Multiple incomplete Stripe plan subscriptions require reconciliation");
  }
  if (incomplete.length === 1) return incomplete[0];

  // With no live/pending plan, all remaining candidates are terminal. Their
  // list order is sufficient because entitlement outcome is the same (closed),
  // and any future live subscription will outrank this terminal fallback.
  return candidates[0] ?? null;
}

/**
 * A Live Video subscription is economically dependent on the base Wireline
 * plan. When the base plan is scheduled to end, becomes unpaid, or reaches a
 * terminal state, schedule any active standalone Live Video add-on to end too
 * so a customer cannot become blocked in-product while continuing to receive
 * future $19 renewals. We preserve the already-paid add-on period rather than
 * performing an immediate cancellation/refund mutation. A cascade marker lets
 * us safely undo only Wireline-triggered add-on cancellations if the base plan
 * recovers or a replacement paid base plan becomes active before the add-on ends.
 */
async function reconcileLiveVideoAddonWithBasePlan(opts: {
  customerId: string;
  baseCancelAtPeriodEnd: boolean;
  baseTerminal: boolean;
  baseUnpaid: boolean;
  restoreCascade: boolean;
}): Promise<void> {
  const { customerId, baseCancelAtPeriodEnd, baseTerminal, baseUnpaid, restoreCascade } = opts;
  if (!stripeAvailable()) return;
  if (!baseCancelAtPeriodEnd && !baseTerminal && !baseUnpaid && !restoreCascade) return;

  const listed = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const liveVideoAddons = listed.data.filter(
    (candidate) =>
      candidate.metadata?.purpose === "live_video_addon" &&
      !TERMINAL_SUBSCRIPTION_STATUSES.has(candidate.status),
  );

  for (const addon of liveVideoAddons) {
    if (restoreCascade) {
      if (
        addon.cancel_at_period_end &&
        addon.metadata?.wireline_base_plan_cascade === "true"
      ) {
        await stripe.subscriptions.update(addon.id, {
          cancel_at_period_end: false,
          metadata: { wireline_base_plan_cascade: "" },
        });
        log.info("Restored Live Video renewal after base-plan recovery", {
          customerId,
          liveVideoSubscriptionId: addon.id,
        });
      }
      continue;
    }

    if (!addon.cancel_at_period_end) {
      await stripe.subscriptions.update(addon.id, {
        cancel_at_period_end: true,
        metadata: { wireline_base_plan_cascade: "true" },
      });
      log.info("Scheduled Live Video add-on cancellation with base plan", {
        customerId,
        liveVideoSubscriptionId: addon.id,
        baseTerminal,
        baseUnpaid,
      });
    }
  }
}

/**
 * Legacy ordering fallback retained only for environments without Stripe
 * credentials (unit tests/local import smoke). Production never depends on the
 * timestamp comparison: configured syncs reconcile against the current customer
 * subscription collection above.
 */
async function mirrorPointsAtNewerSubscription(
  sub: Stripe.Subscription,
  mirroredSubscriptionId: string,
): Promise<boolean> {
  if (!stripeAvailable()) return false;
  try {
    const mirrored = await stripe.subscriptions.retrieve(mirroredSubscriptionId);
    return mirrored.created > sub.created;
  } catch (error) {
    if (isMissingStripeResource(error)) {
      log.warn("Stripe sync: mirrored subscription is missing in Stripe — allowing repair", {
        mirroredSubscriptionId,
        eventSubscriptionId: sub.id,
      });
      return false;
    }
    log.error("Stripe sync: could not establish fallback subscription ordering", {
      mirroredSubscriptionId,
      eventSubscriptionId: sub.id,
      error: getErrorMessage(error),
    });
    throw error;
  }
}

/** Sync a Stripe subscription into wireline_subscriptions + wireline_settings. */
export async function syncSubscriptionFromStripe(incomingSub: Stripe.Subscription) {
  const customerId =
    typeof incomingSub.customer === "string" ? incomingSub.customer : incomingSub.customer.id;

  let [existing] = await drizzle
    .select({
      userId: schema.subscriptions.userId,
      status: schema.subscriptions.status,
      stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId,
      cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.stripeCustomerId, customerId))
    .limit(1);

  if (!existing?.userId) {
    // Checkout stamps wireline_user_id on every subscription it creates, so a
    // missing mapping row (overwritten by the checkout customer-recovery
    // upsert, deleted, or created out-of-band) is repairable from the event
    // itself. Without the repair, the webhook acks the event as processed and
    // a paying customer's entitlements are silently never granted — Stripe
    // will not redeliver an acked event.
    const metadataUserId = incomingSub.metadata?.wireline_user_id?.trim();
    if (!metadataUserId) {
      // Not attributable to any tenant (foreign object, or events for an
      // account deleted after cancellation). Returning — not throwing — is
      // deliberate: this state can never resolve, so a retry loop would only
      // poison the webhook endpoint's delivery health.
      log.error(
        "Stripe sync: no subscription row and no wireline_user_id metadata — cannot attribute",
        { customerId, subscriptionId: incomingSub.id },
      );
      return;
    }
    log.warn("Stripe sync: repairing missing customer mapping from subscription metadata", {
      customerId,
      subscriptionId: incomingSub.id,
      userId: metadataUserId,
    });
    await drizzle
      .insert(schema.subscriptions)
      .values({ userId: metadataUserId, stripeCustomerId: customerId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.subscriptions.userId,
        set: { stripeCustomerId: customerId, updatedAt: new Date() },
      });
    existing = {
      userId: metadataUserId,
      status: null,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
    };
  }

  let sub = incomingSub;

  if (stripeAvailable()) {
    // Always reconcile from current Stripe state, not merely on an id mismatch.
    // This makes both cross-subscription and same-subscription webhook reordering
    // harmless. Any transient list error escapes so the outer webhook releases
    // its idempotency claim and Stripe redelivers.
    const authoritative = await currentPlanSubscriptionForCustomer(customerId);
    if (authoritative) {
      if (authoritative.id !== incomingSub.id) {
        log.warn("Stripe sync: ignoring non-authoritative subscription event", {
          customerId,
          eventSubscriptionId: incomingSub.id,
          authoritativeSubscriptionId: authoritative.id,
          eventStatus: incomingSub.status,
          authoritativeStatus: authoritative.status,
        });
        return;
      }
      sub = authoritative;
    }
  } else {
    // Offline/local compatibility only. Production reaches the authoritative
    // collection reconciliation above and does not rely on created timestamps.
    const incomingIsTerminal = TERMINAL_SUBSCRIPTION_STATUSES.has(sub.status);
    const mirrorIsLive = !!existing.status && !TERMINAL_SUBSCRIPTION_STATUSES.has(existing.status);
    if (existing.stripeSubscriptionId && existing.stripeSubscriptionId !== sub.id) {
      if (incomingIsTerminal && mirrorIsLive) {
        log.warn("Stripe sync: ignoring stale terminal event for a superseded subscription", {
          customerId,
          eventSubscriptionId: sub.id,
          mirroredSubscriptionId: existing.stripeSubscriptionId,
          eventStatus: sub.status,
        });
        return;
      }
      if (await mirrorPointsAtNewerSubscription(sub, existing.stripeSubscriptionId)) {
        log.warn("Stripe sync: ignoring out-of-order event for a superseded subscription", {
          customerId,
          eventSubscriptionId: sub.id,
          mirroredSubscriptionId: existing.stripeSubscriptionId,
          eventStatus: sub.status,
        });
        return;
      }
    }
  }

  const userId = existing.userId;
  const plan =
    sub.items?.data
      ?.map((item) => basePlanByStripePrice(item.price))
      .find((candidate): candidate is StripePlan => !!candidate) ?? null;
  const extraAgents = extraAgentQuantityFromSubscription(sub);
  const stripeStatus = sub.status;

  // Active/trialing Stripe status with an unmapped price must not wipe a
  // known-good plan down to null / maxAgents=1 (catalog/env drift footgun).
  if ((stripeStatus === "active" || stripeStatus === "trialing") && !plan) {
    log.error(
      "Stripe sync: active subscription price did not map to a catalog plan — refusing overwrite",
      {
        userId,
        customerId,
        subscriptionId: sub.id,
        priceIds: (sub.items?.data || []).map((item) =>
          typeof item.price === "string" ? item.price : item.price?.id,
        ),
      },
    );
    throw new Error("Stripe subscription price is not mapped to a Wireline plan catalog entry");
  }

  const baseMaxAgents = plan?.max_agents ?? 1;
  const effectiveMaxAgents = baseMaxAgents + extraAgents;

  const localStatus =
    stripeStatus === "active" || stripeStatus === "trialing"
      ? "active"
      : stripeStatus === "past_due" || stripeStatus === "unpaid"
        ? "past_due"
        : "canceled";

  const currentPeriodEndUnix = subscriptionPeriod(sub).end;
  const currentPeriodEndIso = currentPeriodEndUnix
    ? new Date(currentPeriodEndUnix * 1000).toISOString()
    : null;

  const baseTerminal = TERMINAL_SUBSCRIPTION_STATUSES.has(stripeStatus);
  const baseUnpaid = stripeStatus === "unpaid";
  const priorBaseRequiredCascade =
    existing.cancelAtPeriodEnd === true ||
    existing.status === "unpaid" ||
    (!!existing.status && TERMINAL_SUBSCRIPTION_STATUSES.has(existing.status));
  const restoreCascade =
    priorBaseRequiredCascade &&
    (stripeStatus === "active" || stripeStatus === "trialing") &&
    !sub.cancel_at_period_end;
  await reconcileLiveVideoAddonWithBasePlan({
    customerId,
    baseCancelAtPeriodEnd: !!sub.cancel_at_period_end,
    baseTerminal,
    baseUnpaid,
    restoreCascade,
  });

  await drizzle
    .insert(schema.subscriptions)
    .values({
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      plan: plan?.id ?? null,
      status: stripeStatus,
      currentPeriodEnd: currentPeriodEndIso ? new Date(currentPeriodEndIso) : null,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.subscriptions.userId],
      set: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        plan: plan?.id ?? null,
        status: stripeStatus,
        currentPeriodEnd: currentPeriodEndIso ? new Date(currentPeriodEndIso) : null,
        cancelAtPeriodEnd: !!sub.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });

  await drizzle
    .insert(schema.settings)
    .values({
      id: userId,
      userId,
      subscriptionStatus: localStatus,
      maxAgents: effectiveMaxAgents,
      extraAgents,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.settings.userId],
      set: {
        subscriptionStatus: localStatus,
        maxAgents: effectiveMaxAgents,
        extraAgents,
        updatedAt: new Date(),
      },
    });

  const { ensureDefaultAiSpendBudget } = await import("./workspace-usage-snapshot");
  const spendBudgetPlanId =
    stripeStatus === "active" || stripeStatus === "trialing" ? (plan?.id ?? null) : null;
  await ensureDefaultAiSpendBudget(userId, spendBudgetPlanId);

  invalidateDashboard(userId);

  dispatchWebhook(userId, "subscription.changed", {
    plan: plan?.id ?? null,
    voice_number_slots_cap: effectiveMaxAgents,
    included_extra_agents: extraAgents,
    status: stripeStatus,
    legacy_status: localStatus,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: currentPeriodEndIso,
    at: new Date().toISOString(),
  }).catch((error: unknown) =>
    log.warn("subscription.changed webhook dispatch failed", {
      userId,
      error: getErrorMessage(error),
    }),
  );

  const billingAction: "subscription_created" | "subscription_updated" | "subscription_cancelled" =
    stripeStatus === "canceled" || stripeStatus === "incomplete_expired"
      ? "subscription_cancelled"
      : (incomingSub as Stripe.Subscription & { _auditCreate?: boolean })._auditCreate
        ? "subscription_created"
        : "subscription_updated";

  if ((stripeStatus === "active" || stripeStatus === "trialing") && plan?.id) {
    const interval = subscriptionBillingInterval(sub);
    const periodReference = subscriptionPeriodReference(sub);
    // Must succeed — swallowing here marks the webhook processed with no
    // included Runtime Allowance, and Stripe will not retry.
    await grantSubscriptionRuntimeAllowance(userId, periodReference, plan.id, interval);
  }

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
        extra_agents: extraAgents,
      },
    })
    .catch(() => {});
}
