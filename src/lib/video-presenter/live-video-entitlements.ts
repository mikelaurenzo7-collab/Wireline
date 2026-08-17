/**
 * Workspace entitlement for the retired Live Video add-on.
 *
 * Live talking-head video is no longer offered. Identity badges remain the
 * in-app visual. Work companions draft clip scripts. Imagine file generation
 * is not offered. Stripe webhooks may still record a leftover subscription;
 * they must not authorize a provider session.
 */
import { eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { drizzle } from "../server-context";
import { canonicalPlanId, type StripePlanId } from "../plan-catalog";
import {
  LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY,
  LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
} from "./live-video-policy";
import { getLiveAvatarStatus } from "./liveavatar-service";

const LIVE_VIDEO_RETIRED_REASON =
  "Live talking-head video is retired. Identity badges stay on every agent. Work companions draft clip scripts for recaps and kiosks.";

/** Always false. Live Video is retired; work companions own clips. */
export function isLiveVideoCatalogReady(): boolean {
  return false;
}

export type LiveVideoEntitlement = {
  platformConfigured: boolean;
  addonOffered: boolean;
  billingEntitled: boolean;
  liveVideoAddonEnabled: boolean;
  liveVideoCheckoutAvailable: boolean;
  liveVideoMinutesIncluded: number;
  liveVideoSessionMinutes: number;
  planId: StripePlanId | null;
  upgradeRequired: boolean;
  reason: string | null;
};

export async function resolveLiveVideoEntitlement(
  userId: string,
  _options?: { isOwner?: boolean },
): Promise<LiveVideoEntitlement> {
  const platform = getLiveAvatarStatus();
  const [row] = await drizzle
    .select({
      liveVideoAddonEnabled: schema.settings.liveVideoAddonEnabled,
      planId: schema.subscriptions.plan,
    })
    .from(schema.settings)
    .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  return {
    platformConfigured: platform.configured,
    addonOffered: false,
    billingEntitled: false,
    liveVideoAddonEnabled: row?.liveVideoAddonEnabled === true,
    liveVideoCheckoutAvailable: false,
    liveVideoMinutesIncluded: LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY,
    liveVideoSessionMinutes: LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
    planId: canonicalPlanId(row?.planId),
    upgradeRequired: false,
    reason: LIVE_VIDEO_RETIRED_REASON,
  };
}
