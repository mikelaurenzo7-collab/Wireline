import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";

import { AppError } from "./api-error";
import { OPENAI_REALTIME_DEFAULT_MODEL } from "./voice/openai-realtime-config";
import {
  commitPlatformCostReservation,
  extendCommittedPlatformCostReservation,
  markPlatformCostReservationAmbiguous,
  platformCostReserveUsd,
  releasePlatformCostReservationIfReserved,
  reservePlatformCostRecord,
  type PlatformCostReservation,
} from "../middleware/audit-middleware";
import { releaseSimulationMinuteQuota } from "../middleware/api-rate-limits";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { shouldRetainRealtimeReservation } from "./realtime-provider-outcome";

export async function reserveRealtimeSessionSpend(
  req: Request,
  userId: string,
  surface: string,
  idempotencyKey?: string,
): Promise<PlatformCostReservation> {
  const reserveUsd = platformCostReserveUsd("openai_realtime_session");
  const decision = await reservePlatformCostRecord({
    userId,
    action: "voice.realtime.session",
    provider: "openai",
    model: OPENAI_REALTIME_DEFAULT_MODEL,
    costUsd: reserveUsd,
    idempotencyKey,
    requestMeta: { surface, reserve_window_seconds: 300, reserve_window_usd: reserveUsd },
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
    "BotBound could not reserve this session against your spend guard. Try again shortly.",
  );
}

export async function commitRealtimeSessionSpend(
  reservation: PlatformCostReservation,
): Promise<void> {
  await commitPlatformCostReservation(reservation);
}

export async function releaseRealtimeSessionSpendAfterFailure(
  req: Request,
  reservation: PlatformCostReservation,
  error: unknown,
): Promise<void> {
  if (shouldRetainRealtimeReservation(error)) {
    await markPlatformCostReservationAmbiguous(reservation);
    return;
  }

  let costReleased = false;
  try {
    costReleased = await releasePlatformCostReservationIfReserved(reservation);
  } catch (error) {
    log.error("Realtime session reservation cleanup was incomplete", {
      userId: reservation.userId,
      costError: getErrorMessage(error),
    });
    return;
  }
  // A committed or ambiguous debit is intentionally retained. Its paired quota
  // must remain retained too, or a retry could consume provider work twice.
  if (!costReleased) return;
  try {
    await releaseSimulationMinuteQuota(req);
  } catch (error) {
    log.error("Realtime quota refund failed after cost reservation release", {
      userId: reservation.userId,
      quotaError: getErrorMessage(error),
    });
  }
}

/** Durable post-call replay repairs a missed final rolling estimate. */
export async function reconcileOpenAISipDurationSpend(
  userId: string,
  callId: string,
  seconds: number,
): Promise<void> {
  if (seconds <= 300) return;
  const [receipt] = await drizzle
    .select({ id: schema.auditLog.id, costUsd: schema.auditLog.costUsd })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.userId, userId),
        eq(schema.auditLog.action, "voice.realtime.session"),
        eq(schema.auditLog.idempotencyKey, "openai-sip:" + callId),
      ),
    )
    .limit(1);
  if (!receipt) throw new Error("SIP duration accounting receipt is missing.");
  await extendCommittedPlatformCostReservation(
    {
      userId,
      auditId: receipt.id,
      costUsd: Number(receipt.costUsd),
      adopted: true,
    },
    seconds,
  );
}
