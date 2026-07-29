import { estimatedStripeCommercialFeesUsd } from "../plan-catalog";

export const LIVE_VIDEO_ADDON_PRICE_USD = 19;
export const LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY = 60;
export const LIVE_VIDEO_SESSION_RESERVATION_MINUTES = 10;
export const LIVE_VIDEO_PROVIDER_COST_PER_MINUTE_USD = 0.12;
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
  return (LIVE_VIDEO_ADDON_PRICE_USD - providerCost - commercialFees) /
    LIVE_VIDEO_ADDON_PRICE_USD;
}
