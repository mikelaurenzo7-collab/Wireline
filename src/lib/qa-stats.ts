/**
 * QA stats aggregation for GET /api/qa/stats.
 */
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";

type QaBreakdown = {
  greeting?: number;
  discovery?: number;
  solution?: number;
  objection?: number;
  closing?: number;
};

const DISTRIBUTION_BUCKETS = [
  { label: "90–100", min: 90, max: 100, color: "#A78BFA" },
  { label: "75–89", min: 75, max: 89, color: "#A78BFA" },
  { label: "60–74", min: 60, max: 74, color: "#8B87A0" },
  { label: "40–59", min: 40, max: 59, color: "#C77DFF" },
  { label: "0–39", min: 0, max: 39, color: "#EF4444" },
] as const;

export async function computeQaStats(userId: string, windowDays: number) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const where = and(
    eq(schema.callLogs.userId, userId),
    gte(schema.callLogs.createdAt, since),
    isNotNull(schema.callLogs.qaScore),
  );

  const rows = await drizzle
    .select({
      qaScore: schema.callLogs.qaScore,
      qaBreakdown: schema.callLogs.qaBreakdown,
      createdAt: schema.callLogs.createdAt,
    })
    .from(schema.callLogs)
    .where(where)
    .limit(5000);

  if (rows.length === 0) {
    return { count: 0, avgScore: 0, dimensions: {}, distribution: [], trend: [] };
  }

  let scoreSum = 0;
  const dimSums = { greeting: 0, discovery: 0, solution: 0, objection: 0, closing: 0 };
  let dimCount = 0;

  for (const row of rows) {
    scoreSum += row.qaScore ?? 0;
    const b = (row.qaBreakdown ?? {}) as QaBreakdown;
    if (b.greeting != null) {
      dimSums.greeting += b.greeting;
      dimSums.discovery += b.discovery ?? 0;
      dimSums.solution += b.solution ?? 0;
      dimSums.objection += b.objection ?? 0;
      dimSums.closing += b.closing ?? 0;
      dimCount++;
    }
  }

  const distribution = DISTRIBUTION_BUCKETS.map((bucket) => ({
    label: bucket.label,
    color: bucket.color,
    count: rows.filter((r) => {
      const s = r.qaScore ?? 0;
      return s >= bucket.min && s <= bucket.max;
    }).length,
  }));

  const byDay = new Map<string, { sum: number; n: number }>();
  for (const row of rows) {
    const day = (row.createdAt ?? new Date()).toISOString().slice(0, 10);
    const cur = byDay.get(day) ?? { sum: 0, n: 0 };
    cur.sum += row.qaScore ?? 0;
    cur.n++;
    byDay.set(day, cur);
  }
  const trend = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([day, { sum, n }]) => ({
      day: day.slice(5),
      avg: Math.round(sum / n),
    }));

  const dimensions =
    dimCount > 0
      ? {
          greeting: Math.round((dimSums.greeting / dimCount) * 10) / 10,
          discovery: Math.round((dimSums.discovery / dimCount) * 10) / 10,
          solution: Math.round((dimSums.solution / dimCount) * 10) / 10,
          objection: Math.round((dimSums.objection / dimCount) * 10) / 10,
          closing: Math.round((dimSums.closing / dimCount) * 10) / 10,
        }
      : {};

  return {
    count: rows.length,
    avgScore: Math.round(scoreSum / rows.length),
    dimensions,
    distribution,
    trend,
  };
}

export async function listUnscoredCallIds(userId: string, windowDays: number, limit: number) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await drizzle
    .select({ id: schema.callLogs.id })
    .from(schema.callLogs)
    .where(
      and(
        eq(schema.callLogs.userId, userId),
        gte(schema.callLogs.createdAt, since),
        sql`${schema.callLogs.qaScore} is null`,
        sql`coalesce(${schema.callLogs.durationSeconds}, 0) >= 30`,
        sql`coalesce(length(${schema.callLogs.transcript}), 0) > 80`,
      ),
    )
    .orderBy(sql`${schema.callLogs.createdAt} desc`)
    .limit(limit);

  return rows.map((r) => r.id);
}
