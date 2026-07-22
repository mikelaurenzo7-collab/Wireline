/**
 * Workspace entitlement for the photoreal live video add-on.
 *
 * The paid streaming add-on is offered only after ops explicitly marks the
 * curated Presence Catalog launch-ready.
 */
import { eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { drizzle } from "../server-context";
import { canonicalPlanId, type StripePlanId } from "../plan-catalog";
import { getLiveAvatarStatus } from "./liveavatar-service";

const PAID_LIVE_VIDEO_PLANS = new Set<StripePlanId>([
  "starter",
  "team",
  "business",
  "enterprise",
]);

export function isLiveVideoCatalogReady(): boolean {
  return process.env.WIRELINE_LIVE_VIDEO_CATALOG_READY === "true";
}

export type LiveVideoEntitlement = {
  platformConfigured: boolean;
  /** Workspace may purchase or enable live video (keys + billing path). */
  addonOffered: boolean;
  /** Tenant is allowed to enable live video right now. */
  billingEntitled: boolean;
  liveVideoAddonEnabled: boolean;
  liveVideoCheckoutAvailable: boolean;
  planId: StripePlanId | null;
  upgradeRequired: boolean;
  reason: string | null;
};

function billingBypassEnabled(): boolean {
  return process.env.LIVE_VIDEO_BYPASS_BILLING === "true";
}

export async function resolveLiveVideoEntitlement(
  userId: string,
  options?: { isOwner?: boolean },
): Promise<LiveVideoEntitlement> {
  const platform = getLiveAvatarStatus();
  const platformConfigured = platform.configured;
  const catalogReady = isLiveVideoCatalogReady();

  if (options?.isOwner || billingBypassEnabled()) {
    return {
      platformConfigured,
      addonOffered: platformConfigured,
      billingEntitled: true,
      liveVideoAddonEnabled: true,
      liveVideoCheckoutAvailable: Boolean(
        process.env.STRIPE_LIVE_VIDEO_ADDON_PRICE_ID ||
        process.env.STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID,
      ),
      planId: "enterprise",
      upgradeRequired: false,
      reason: null,
    };
  }

  const [row] = await drizzle
    .select({
      subscriptionStatus: schema.settings.subscriptionStatus,
      liveVideoAddonEnabled: schema.settings.liveVideoAddonEnabled,
      planId: schema.subscriptions.plan,
      stripeStatus: schema.subscriptions.status,
    })
    .from(schema.settings)
    .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  const planId = canonicalPlanId(row?.planId);
  const workspaceFlag = row?.liveVideoAddonEnabled === true;
  const stripeActive = row?.stripeStatus === "active" || row?.stripeStatus === "trialing";
  const settingsActive =
    row?.subscriptionStatus === "active" || row?.subscriptionStatus === "trialing";
  const onPaidPlan = planId ? PAID_LIVE_VIDEO_PLANS.has(planId) : false;

  const addonOffered = platformConfigured && catalogReady;
  const billingEntitled =
    addonOffered && workspaceFlag && stripeActive && settingsActive && onPaidPlan;

  let reason: string | null = null;
  if (!platformConfigured) {
    reason = "Live video is not available on this workspace yet.";
  } else if (!catalogReady) {
    reason = "Live video is paused while the curated Presence Catalog is prepared.";
  } else if (!onPaidPlan) {
    reason = "Activate a paid plan before adding live video.";
  } else if (!stripeActive || !settingsActive) {
    reason = "Activate your subscription before adding live video.";
  } else if (!workspaceFlag) {
    reason = "Subscribe to the live video add-on ($19/mo) to stream a presenter.";
  }

  const checkoutAvailable =
    addonOffered &&
    Boolean(
      process.env.STRIPE_LIVE_VIDEO_ADDON_PRICE_ID ||
        process.env.STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID,
    );

  return {
    platformConfigured,
    addonOffered,
    billingEntitled,
    liveVideoAddonEnabled: workspaceFlag,
    liveVideoCheckoutAvailable: checkoutAvailable,
    planId,
    upgradeRequired: addonOffered && !billingEntitled && !checkoutAvailable,
    reason,
  };
}
