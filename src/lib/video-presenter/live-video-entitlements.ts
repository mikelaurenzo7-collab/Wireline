/**
 * Workspace entitlement for the photoreal Live Video add-on.
 *
 * Live Video is a launch-active paid add-on when the provider is configured.
 * WIRELINE_LIVE_VIDEO_DISABLED=true is the emergency operator kill switch.
 */
import { eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { drizzle, log } from "../server-context";
import { canonicalPlanId, type StripePlanId } from "../plan-catalog";
import { stripe, stripeAvailable } from "../stripe-helpers";
import { isCurrentLiveVideoAddon } from "../stripe-live-video-addon";
import {
  LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY,
  LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
} from "./live-video-policy";
import { getLiveAvatarStatus } from "./liveavatar-service";

const PAID_LIVE_VIDEO_PLANS = new Set<StripePlanId>(["starter", "team", "business", "enterprise"]);

const TERMINAL_BASE_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);

/** Legacy name retained at call sites; semantics are now launch-active unless explicitly killed. */
export function isLiveVideoCatalogReady(): boolean {
  return process.env.WIRELINE_LIVE_VIDEO_DISABLED !== "true";
}

export type LiveVideoEntitlement = {
  platformConfigured: boolean;
  /** Workspace may purchase or enable live video (keys + billing path). */
  addonOffered: boolean;
  /** Tenant is allowed to enable live video right now. */
  billingEntitled: boolean;
  liveVideoAddonEnabled: boolean;
  liveVideoCheckoutAvailable: boolean;
  liveVideoMinutesIncluded: number;
  liveVideoSessionMinutes: number;
  planId: StripePlanId | null;
  upgradeRequired: boolean;
  reason: string | null;
};

function billingBypassEnabled(): boolean {
  return process.env.LIVE_VIDEO_BYPASS_BILLING === "true";
}

/**
 * The workspace flag is a webhook-maintained cache, not sufficient payment
 * proof once the base plan is terminal. Re-check Stripe only in that rare grace
 * state so a missed terminal add-on webhook cannot leave provider-funded Live
 * Video enabled forever. Past-due/incomplete deliberately preserve the existing
 * dunning posture; only true terminal/unpaid add-on states revoke entitlement.
 */
async function hasCurrentStripeLiveVideoAddon(stripeCustomerId: string | null): Promise<boolean> {
  if (!stripeCustomerId || !stripeAvailable()) return false;
  try {
    for await (const subscription of stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 100,
    })) {
      if (isCurrentLiveVideoAddon(subscription)) {
        return true;
      }
    }
    return false;
  } catch (error) {
    // Terminal grace is an exception after the base entitlement has already
    // ended. Fail closed if Stripe truth cannot be established rather than
    // letting a stale local boolean authorize indefinite provider spend.
    log.warn("Live Video terminal-grace Stripe verification failed closed", {
      stripeCustomerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function resolveLiveVideoEntitlement(
  userId: string,
  options?: { isOwner?: boolean },
): Promise<LiveVideoEntitlement> {
  const platform = getLiveAvatarStatus();
  const platformConfigured = platform.configured;
  const launchEnabled = isLiveVideoCatalogReady();
  const liveVideoAllowance = {
    liveVideoMinutesIncluded: LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY,
    liveVideoSessionMinutes: LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
  } as const;

  if (options?.isOwner || billingBypassEnabled()) {
    return {
      platformConfigured,
      addonOffered: platformConfigured && launchEnabled,
      billingEntitled: platformConfigured && launchEnabled,
      liveVideoAddonEnabled: true,
      liveVideoCheckoutAvailable: Boolean(
        platformConfigured &&
        launchEnabled &&
        (process.env.STRIPE_LIVE_VIDEO_ADDON_PRICE_ID ||
          process.env.STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID),
      ),
      ...liveVideoAllowance,
      planId: "enterprise",
      upgradeRequired: false,
      reason: !platformConfigured
        ? "Live video provider is not configured on this workspace."
        : !launchEnabled
          ? "Live video is temporarily disabled by the platform operator."
          : null,
    };
  }

  const [row] = await drizzle
    .select({
      subscriptionStatus: schema.settings.subscriptionStatus,
      liveVideoAddonEnabled: schema.settings.liveVideoAddonEnabled,
      planId: schema.subscriptions.plan,
      stripeStatus: schema.subscriptions.status,
      stripeCustomerId: schema.subscriptions.stripeCustomerId,
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
  const baseSubscriptionActive = stripeActive && settingsActive && onPaidPlan;

  // When a paid base plan reaches a terminal state, Stripe reconciliation first
  // schedules the independently billed Live Video add-on to stop renewing. Keep
  // an already-paid add-on usable only while Stripe still reports that add-on as
  // current. This converts the local flag from authority into the cache it was
  // intended to be and closes the missed-webhook indefinite-grace path.
  const terminalBase =
    workspaceFlag && onPaidPlan && TERMINAL_BASE_SUBSCRIPTION_STATUSES.has(row?.stripeStatus ?? "");
  const terminalPaidPeriodGrace =
    terminalBase && (await hasCurrentStripeLiveVideoAddon(row?.stripeCustomerId ?? null));
  const existingAddonEntitled = baseSubscriptionActive || terminalPaidPeriodGrace;

  const addonOffered = platformConfigured && launchEnabled;
  const billingEntitled = addonOffered && workspaceFlag && existingAddonEntitled;
  const priceConfigured = Boolean(
    process.env.STRIPE_LIVE_VIDEO_ADDON_PRICE_ID || process.env.STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID,
  );
  const checkoutAvailable = addonOffered && baseSubscriptionActive && priceConfigured;

  let reason: string | null = null;
  if (!platformConfigured) {
    reason = "Live video is not available on this workspace yet.";
  } else if (!launchEnabled) {
    reason = "Live video is temporarily disabled by the platform operator.";
  } else if (!onPaidPlan) {
    reason = "Activate a paid plan before adding live video.";
  } else if (!baseSubscriptionActive && !terminalPaidPeriodGrace) {
    reason = "Activate your subscription before adding live video.";
  } else if (!workspaceFlag) {
    reason = `Subscribe to Live Video ($19/mo, ${LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY} reserved minutes, up to ${LIVE_VIDEO_SESSION_RESERVATION_MINUTES} minutes per session) to stream a presenter.`;
  }

  return {
    platformConfigured,
    addonOffered,
    billingEntitled,
    liveVideoAddonEnabled: workspaceFlag,
    liveVideoCheckoutAvailable: checkoutAvailable,
    ...liveVideoAllowance,
    planId,
    upgradeRequired: addonOffered && !baseSubscriptionActive && !terminalPaidPeriodGrace,
    reason,
  };
}
