import { estimatedStripeCommercialFeesUsd } from "../plan-catalog";

export const LIVE_VIDEO_ADDON_PRICE_USD = 19;
export const LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY = 60;
/** LiveAvatar Starter sessions are capped at five minutes. Reserve one full session atomically. */
export const LIVE_VIDEO_SESSION_RESERVATION_MINUTES = 5;
export const LIVE_VIDEO_MAX_SESSION_SECONDS = LIVE_VIDEO_SESSION_RESERVATION_MINUTES * 60;
/**
 * Conservative Lite-mode reserve. The monthly add-on divided by 150 minutes is
 * about $0.1267/min before any overage, so $0.13/min is a safer launch reserve
 * than pricing every minute at the lower published overage rate.
 */
export const LIVE_VIDEO_PROVIDER_COST_PER_MINUTE_USD = 0.13;
export const LIVE_VIDEO_MIN_FULL_USE_MARGIN = 0.5;

export function estimatedLiveVideoFullUseMargin(): number {
  const providerCost =
    LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY * LIVE_VIDEO_PROVIDER_COST_PER_MINUTE_USD;
  const commercialFees = estimatedStripeCommercialFeesUsd(LIVE_VIDEO_ADDON_PRICE_USD);
  return (LIVE_VIDEO_ADDON_PRICE_USD - providerCost - commercialFees) / LIVE_VIDEO_ADDON_PRICE_USD;
}
