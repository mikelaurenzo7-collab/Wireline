/**
 * Compose and publish a shareable weekly review from the
 * `generateScheduledOperatingReport` payload. Only fires on weekly
 * cadence (the daily report keeps its existing Sheets/Drive delivery
 * without publishing a shareable URL — recap fatigue is real).
 */
import { eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { planById } from "../plan-catalog";
import { isBrandedArtifactEntitled } from "./entitlement";
import { publishWeeklyRecap, type RecapArtifactHandle } from "./service";
import type { WeeklyRecapContent, WeeklyRecapOutcomeSlice, WeeklyRecapVolumePoint } from "./types";

const DAY_ORDER: readonly string[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toIso(day: Date): string {
  return day.toISOString().slice(0, 10);
}

function bucketVolume(
  createdTimestamps: readonly Date[],
  start: Date,
  end: Date,
): WeeklyRecapVolumePoint[] {
  const dayCount = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const buckets: WeeklyRecapVolumePoint[] = [];
  for (let index = 0; index < dayCount; index++) {
    const bucketStart = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    const label = DAY_ORDER[bucketStart.getUTCDay() === 0 ? 6 : bucketStart.getUTCDay() - 1] || "";
    buckets.push({ label, count: 0 });
  }
  for (const timestamp of createdTimestamps) {
    const dayIndex = Math.min(
      buckets.length - 1,
      Math.max(0, Math.floor((timestamp.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))),
    );
    buckets[dayIndex].count += 1;
  }
  return buckets;
}

async function tenantPlanId(userId: string): Promise<string | null> {
  try {
    const [row] = await drizzle
      .select({ plan: schema.subscriptions.plan })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1);
    return row?.plan ?? null;
  } catch {
    return null;
  }
}

export interface MaybePublishWeeklyRecapInput {
  userId: string;
  weekLabel: string;
  periodStart: Date;
  periodEnd: Date;
  callTimestamps: readonly Date[];
  totals: {
    calls: number;
    voiceMinutes: number;
    booked: number;
    qualified: number;
    followup: number;
  };
  averageQaScore: number | null;
  outcomeMix: WeeklyRecapOutcomeSlice[];
  topMoments: WeeklyRecapContent["topMoments"];
  followUps: WeeklyRecapContent["followUps"];
  headline?: string | null;
}

export async function maybePublishWeeklyRecap(
  input: MaybePublishWeeklyRecapInput,
): Promise<RecapArtifactHandle | null> {
  try {
    const planId = await tenantPlanId(input.userId);
    const plan = planById(planId);
    if (!isBrandedArtifactEntitled(plan)) return null;

    const content: WeeklyRecapContent = {
      kind: "weekly_recap",
      version: 1,
      period: {
        startIso: toIso(input.periodStart),
        endIso: toIso(input.periodEnd),
        label: input.weekLabel,
      },
      totals: input.totals,
      volumeByDay: bucketVolume(input.callTimestamps, input.periodStart, input.periodEnd),
      outcomeMix: input.outcomeMix,
      averageQaScore: input.averageQaScore,
      topMoments: input.topMoments,
      followUps: input.followUps,
      headline: input.headline ?? null,
    };

    return await publishWeeklyRecap({
      userId: input.userId,
      weekLabel: input.weekLabel,
      content,
    });
  } catch (error) {
    log.warn("weekly recap artifact publish skipped — non-fatal", {
      userId: input.userId,
      weekLabel: input.weekLabel,
      error: getErrorMessage(error),
    });
    return null;
  }
}
