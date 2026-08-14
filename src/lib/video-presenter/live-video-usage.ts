import { and, eq, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { drizzle } from "../server-context";
import {
  buildLiveVideoUsageSnapshot,
  liveVideoSessionReservationMinutes,
  liveVideoUsagePeriodKey,
  type LiveVideoUsageSnapshot,
} from "./live-video-policy";

const LIVE_VIDEO_USAGE_DIMENSION = "live_video_reserved_minutes_monthly";

export type LiveVideoSessionReservation = {
  reserved: boolean;
  usage: LiveVideoUsageSnapshot;
  /** Allowance minutes this reservation drew; pass back on release. */
  reservedMinutes: number;
};

function reservationLockKey(userId: string, periodKey: string): string {
  return `live-video:${userId}:${periodKey}`;
}

export async function getLiveVideoUsageSnapshot(
  userId: string,
  now: Date = new Date(),
): Promise<LiveVideoUsageSnapshot> {
  const periodKey = liveVideoUsagePeriodKey(now);
  const [row] = await drizzle
    .select({ used: schema.quotaUsage.used })
    .from(schema.quotaUsage)
    .where(
      and(
        eq(schema.quotaUsage.userId, userId),
        eq(schema.quotaUsage.dimension, LIVE_VIDEO_USAGE_DIMENSION),
        eq(schema.quotaUsage.periodKey, periodKey),
      ),
    )
    .limit(1);

  return buildLiveVideoUsageSnapshot(Number(row?.used ?? 0), periodKey);
}

export async function reserveLiveVideoSessionMinutes(
  userId: string,
  options: { creditsPerMinute?: number } = {},
  now: Date = new Date(),
): Promise<LiveVideoSessionReservation> {
  const periodKey = liveVideoUsagePeriodKey(now);
  // FULL-mode engines burn provider credits at a higher rate for the same
  // wall-clock session, so the allowance draws down proportionally.
  const reservedMinutes = liveVideoSessionReservationMinutes(options.creditsPerMinute);

  return drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${reservationLockKey(userId, periodKey)}))`,
    );

    const [row] = await tx
      .select({ used: schema.quotaUsage.used })
      .from(schema.quotaUsage)
      .where(
        and(
          eq(schema.quotaUsage.userId, userId),
          eq(schema.quotaUsage.dimension, LIVE_VIDEO_USAGE_DIMENSION),
          eq(schema.quotaUsage.periodKey, periodKey),
        ),
      )
      .limit(1);

    const current = buildLiveVideoUsageSnapshot(Number(row?.used ?? 0), periodKey);
    if (current.remainingMinutes < reservedMinutes) {
      return { reserved: false, usage: current, reservedMinutes: 0 };
    }

    const nextUsed = current.usedMinutes + reservedMinutes;
    await tx
      .insert(schema.quotaUsage)
      .values({
        userId,
        dimension: LIVE_VIDEO_USAGE_DIMENSION,
        periodKey,
        used: BigInt(nextUsed),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.quotaUsage.userId,
          schema.quotaUsage.dimension,
          schema.quotaUsage.periodKey,
        ],
        set: { used: BigInt(nextUsed), updatedAt: now },
      });

    return {
      reserved: true,
      usage: buildLiveVideoUsageSnapshot(nextUsed, periodKey),
      reservedMinutes,
    };
  });
}

export async function releaseLiveVideoSessionReservation(
  userId: string,
  periodKey: string,
  reservedMinutes: number = liveVideoSessionReservationMinutes(),
): Promise<void> {
  await drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${reservationLockKey(userId, periodKey)}))`,
    );

    const [row] = await tx
      .select({ used: schema.quotaUsage.used })
      .from(schema.quotaUsage)
      .where(
        and(
          eq(schema.quotaUsage.userId, userId),
          eq(schema.quotaUsage.dimension, LIVE_VIDEO_USAGE_DIMENSION),
          eq(schema.quotaUsage.periodKey, periodKey),
        ),
      )
      .limit(1);

    if (!row) return;
    const nextUsed = Math.max(0, Number(row.used ?? 0) - reservedMinutes);
    await tx
      .update(schema.quotaUsage)
      .set({ used: BigInt(nextUsed), updatedAt: new Date() })
      .where(
        and(
          eq(schema.quotaUsage.userId, userId),
          eq(schema.quotaUsage.dimension, LIVE_VIDEO_USAGE_DIMENSION),
          eq(schema.quotaUsage.periodKey, periodKey),
        ),
      );
  });
}
