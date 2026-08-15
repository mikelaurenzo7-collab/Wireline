import type { Request } from "express";

import { AppError } from "./api-error";
import { OPENAI_REALTIME_DEFAULT_MODEL } from "./voice/openai-realtime-config";
import {
  commitPlatformCostReservation,
  platformCostReserveUsd,
  releasePlatformCostReservation,
  reservePlatformCostRecord,
  type PlatformCostReservation,
} from "../middleware/audit-middleware";
import { releaseSimulationMinuteQuota } from "../middleware/api-rate-limits";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

export async function reserveRealtimeSessionSpend(
  req: Request,
  userId: string,
  surface: string,
): Promise<PlatformCostReservation> {
  const decision = await reservePlatformCostRecord({
    userId,
    action: "voice.realtime.session",
    provider: "openai",
    model: OPENAI_REALTIME_DEFAULT_MODEL,
    costUsd: platformCostReserveUsd("openai_realtime_session"),
    requestMeta: { surface },
  });

  if (decision.reserved) return decision.reservation;

  await releaseSimulationMinuteQuota(req).catch((error: unknown) =>
    log.error("Realtime quota refund failed after spend reservation refusal", {
      userId,
      error: getErrorMessage(error),
    }),
  );

  if (decision.reason === "cap_reached") {
    throw new AppError(
      402,
      "SPEND_CAP_REACHED",
      "This session would exceed your provider spend limit. Review Billing before starting new live work.",
      {
        period: decision.period,
        month_to_date_usd: decision.monthToDateUsd,
        monthly_limit_usd: decision.monthlyLimitUsd,
        recovery_path: "/settings/billing",
      },
    );
  }

  throw new AppError(
    503,
    "SPEND_GUARD_UNAVAILABLE",
    "Wireline could not reserve this session against your spend guard. Try again shortly.",
  );
}

export async function commitRealtimeSessionSpend(
  reservation: PlatformCostReservation,
): Promise<void> {
  await commitPlatformCostReservation(reservation);
}

/**
 * A 502 represents an ambiguous upstream/network outcome, so its conservative
 * reserve stays in place. All validation, local, and explicit provider 4xx
 * failures prove that no usable session reached the browser and are refunded.
 */
export async function releaseRealtimeSessionSpendAfterFailure(
  req: Request,
  reservation: PlatformCostReservation,
  error: unknown,
): Promise<void> {
  if (error instanceof AppError && error.status === 502) return;

  const [costRelease, quotaRelease] = await Promise.allSettled([
    releasePlatformCostReservation(reservation),
    releaseSimulationMinuteQuota(req),
  ]);
  if (costRelease.status === "rejected" || quotaRelease.status === "rejected") {
    log.error("Realtime session reservation cleanup was incomplete", {
      userId: reservation.userId,
      costError:
        costRelease.status === "rejected" ? getErrorMessage(costRelease.reason) : undefined,
      quotaError:
        quotaRelease.status === "rejected" ? getErrorMessage(quotaRelease.reason) : undefined,
    });
  }
}
