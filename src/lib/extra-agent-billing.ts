import type Stripe from "stripe";

import {
  EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID,
  STRIPE_PLANS,
  planExtraAgentPriceId,
} from "./plan-catalog";

const LEGACY_EXTRA_AGENT_LOOKUP_KEYS = new Set([
  "extra_agent_monthly_founder_2026_07_v3",
]);

function objectId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function knownExtraAgentPriceIds(configuredPriceId: string): Set<string> {
  const ids = new Set<string>([configuredPriceId, EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID]);
  for (const plan of STRIPE_PLANS) {
    const priceId = planExtraAgentPriceId(plan);
    if (priceId) ids.add(priceId);
  }
  return ids;
}

/**
 * Identify every add-on item Wireline has ever advertised as an Extra Agent.
 * Exact-current-price matching is insufficient after a catalog rotation: it can
 * create a second licensed item beside a legacy one and double-bill the tenant.
 */
export function isExtraAgentSubscriptionItem(
  item: Stripe.SubscriptionItem,
  configuredPriceId: string,
): boolean {
  const price = item.price;
  if (knownExtraAgentPriceIds(configuredPriceId).has(price.id)) return true;
  if (price.metadata?.wireline_addon_id === "extra_agent") return true;
  return Boolean(price.lookup_key && LEGACY_EXTRA_AGENT_LOOKUP_KEYS.has(price.lookup_key));
}

export function extraAgentItems(
  subscription: Stripe.Subscription,
  configuredPriceId: string,
): Stripe.SubscriptionItem[] {
  return subscription.items.data.filter((item) =>
    isExtraAgentSubscriptionItem(item, configuredPriceId),
  );
}

export function extraAgentQuantity(items: readonly Stripe.SubscriptionItem[]): number {
  return items.reduce((total, item) => total + Math.max(0, item.quantity ?? 0), 0);
}

/**
 * Preserve an explicit capacity grant above the old catalog mirror while still
 * moving purchased capacity down immediately when add-ons are removed.
 */
export function reconciledStoredAgentCap(input: {
  planMaxAgents: number;
  currentExtraAgents: number;
  targetExtraAgents: number;
  storedMaxAgents: number | null | undefined;
}): number {
  const planMax = Math.max(0, Math.floor(input.planMaxAgents));
  const currentExtras = Math.max(0, Math.floor(input.currentExtraAgents));
  const targetExtras = Math.max(0, Math.floor(input.targetExtraAgents));
  const stored = Math.max(0, Math.floor(input.storedMaxAgents ?? 0));
  const oldCatalogCap = planMax + currentExtras;
  const explicitGrant = Math.max(0, stored - oldCatalogCap);
  return planMax + targetExtras + explicitGrant;
}

/**
 * Identical concurrent mutations share one Stripe idempotency key. A failed
 * immediate invoice changes latest_invoice, so a retry after the payment method
 * is repaired receives a fresh key instead of replaying Stripe's cached 402.
 */
export function extraAgentMutationIdempotencyKey(input: {
  subscription: Stripe.Subscription;
  configuredPriceId: string;
  currentQuantity: number;
  targetQuantity: number;
}): string {
  const latestInvoiceId = objectId(input.subscription.latest_invoice) || "none";
  return [
    "wireline-extra-agents",
    input.subscription.id,
    input.configuredPriceId,
    `${Math.max(0, input.currentQuantity)}-to-${Math.max(0, input.targetQuantity)}`,
    latestInvoiceId,
  ]
    .join(":")
    .slice(0, 255);
}

export function hasPendingSubscriptionUpdate(subscription: Stripe.Subscription): boolean {
  return Boolean(
    (subscription as Stripe.Subscription & { pending_update?: unknown | null }).pending_update,
  );
}

export function isStripePaymentRequiredError(error: unknown): boolean {
  const row = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const raw =
    row.raw && typeof row.raw === "object" ? (row.raw as Record<string, unknown>) : undefined;
  const statusCode = Number(row.statusCode ?? raw?.statusCode ?? 0);
  const code = String(row.code ?? raw?.code ?? "");
  const type = String(row.type ?? raw?.type ?? "");
  return (
    statusCode === 402 ||
    type === "StripeCardError" ||
    code === "card_declined" ||
    code === "payment_intent_payment_attempt_failed"
  );
}
