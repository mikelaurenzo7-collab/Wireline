import { and, eq, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { drizzle } from "../server-context";
import {
  buildLiveVideoUsageSnapshot,
  LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
  liveVideoUsagePeriodKey,
  type LiveVideoUsageSnapshot,
} from "./live-video-policy";

const LIVE_VIDEO_USAGE_DIMENSION = "live_video_reserved_minutes_monthly";

export type LiveVideoSessionReservation = {
  reserved: boolean;
  usage: LiveVideoUsageSnapshot;
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
  now: Date = new Date(),
): Promise<LiveVideoSessionReservation> {
  const periodKey = liveVideoUsagePeriodKey(now);

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
    if (current.exhausted) return { reserved: false, usage: current };

    const nextUsed = current.usedMinutes + LIVE_VIDEO_SESSION_RESERVATION_MINUTES;
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
    };
  });
}

export async function releaseLiveVideoSessionReservation(
  userId: string,
  periodKey: string,
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
    const nextUsed = Math.max(
      0,
      Number(row.used ?? 0) - LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
    );
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
