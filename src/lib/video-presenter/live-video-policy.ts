import { estimatedStripeCommercialFeesUsd } from "../plan-catalog";

export const LIVE_VIDEO_ADDON_PRICE_USD = 19;
export const LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY = 60;
/** LiveAvatar Starter sessions are capped at five minutes. Reserve one full session atomically. */
export const LIVE_VIDEO_SESSION_RESERVATION_MINUTES = 5;
export const LIVE_VIDEO_MAX_SESSION_SECONDS = LIVE_VIDEO_SESSION_RESERVATION_MINUTES * 60;
/**
 * Conservative Lite-mode reserve. Starter's included-credit basis is about
 * $19 / 150 = $0.1267/min before any overage, so $0.13/min is a safer launch
 * reserve than pricing every minute at the lower published overage rate.
 */
export const LIVE_VIDEO_PROVIDER_COST_PER_MINUTE_USD = 0.13;
export const LIVE_VIDEO_MIN_FULL_USE_MARGIN = 0.5;

export type LiveVideoUsageSnapshot = {
  periodKey: string;
  includedMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
  sessionReservationMinutes: number;
  exhausted: boolean;
};

export function liveVideoUsagePeriodKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Allowance minutes one session reserves, scaled by the engine's provider
 * credit rate. A FULL session costs 2 provider credits per wall-clock minute
 * against LITE's 1, so it must draw the allowance down at 2× or the modeled
 * margin (and the pause-at-limit promise) silently halves. Clamped so a
 * malformed rate can never zero out metering or reserve absurd amounts.
 */
export function liveVideoSessionReservationMinutes(creditsPerMinute = 1): number {
  const credits = Number.isFinite(creditsPerMinute)
    ? Math.min(4, Math.max(1, Math.floor(creditsPerMinute)))
    : 1;
  return LIVE_VIDEO_SESSION_RESERVATION_MINUTES * credits;
}

export function buildLiveVideoUsageSnapshot(
  usedMinutes: number,
  periodKey: string = liveVideoUsagePeriodKey(),
): LiveVideoUsageSnapshot {
  const safeUsed = Number.isFinite(usedMinutes) ? Math.max(0, Math.floor(usedMinutes)) : 0;
  const remainingMinutes = Math.max(0, LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY - safeUsed);

  return {
    periodKey,
    includedMinutes: LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY,
    usedMinutes: safeUsed,
    remainingMinutes,
    sessionReservationMinutes: LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
    exhausted: remainingMinutes < LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
  };
}

export function estimatedLiveVideoFullUseMargin(): number {
  const providerCost =
    LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY * LIVE_VIDEO_PROVIDER_COST_PER_MINUTE_USD;
  const commercialFees = estimatedStripeCommercialFeesUsd(LIVE_VIDEO_ADDON_PRICE_USD);
  return (LIVE_VIDEO_ADDON_PRICE_USD - providerCost - commercialFees) / LIVE_VIDEO_ADDON_PRICE_USD;
}
