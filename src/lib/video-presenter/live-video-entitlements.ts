/**
 * Workspace entitlement for the photoreal live video add-on.
 *
 * Catalog face picks stay included; streaming requires platform keys plus a
 * paid capacity plan (or an explicit workspace flag for enterprise pilots).
 */
import { eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { drizzle } from "../server-context";
import { canonicalPlanId, type StripePlanId } from "../plan-catalog";
import { getLiveAvatarStatus } from "./liveavatar-service";

const PAID_LIVE_VIDEO_PLANS = new Set<StripePlanId>(["team", "business", "enterprise"]);

export type LiveVideoEntitlement = {
  platformConfigured: boolean;
  /** Workspace may purchase or enable live video (keys + billing path). */
  addonOffered: boolean;
  /** Tenant is allowed to enable live video right now. */
  billingEntitled: boolean;
  liveVideoAddonEnabled: boolean;
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

  if (options?.isOwner || billingBypassEnabled()) {
    return {
      platformConfigured,
      addonOffered: platformConfigured,
      billingEntitled: true,
      liveVideoAddonEnabled: true,
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

  const billingEntitled = workspaceFlag || (stripeActive && settingsActive && onPaidPlan);

  let reason: string | null = null;
  if (!platformConfigured) {
    reason = "Live video is not available on this workspace yet.";
  } else if (!billingEntitled) {
    reason = onPaidPlan
      ? "Activate your subscription to unlock live video."
      : "Upgrade to Wireline Team or higher to add live video.";
  }

  return {
    platformConfigured,
    addonOffered: platformConfigured,
    billingEntitled,
    liveVideoAddonEnabled: workspaceFlag,
    planId,
    upgradeRequired: platformConfigured && !billingEntitled,
    reason,
  };
}
