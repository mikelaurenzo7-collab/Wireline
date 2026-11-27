/**
 * Voice observability — per-call metrics tracking and tenant reliability analysis.
 *
 * Tracks:
 *   - TTFT (time-to-first-token): target <900ms, alert threshold 1.2s p95
 *   - STT/TTS error rates per call
 *   - Full pipeline latency (time-to-first-audio)
 *
 * Reliability windows can be computed for authenticated operator workflows.
 */
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, gte, desc } from "drizzle-orm";

export { isPipelineFailure } from "./call-reliability-capture";

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil(p * (sorted.length - 1));
  return sorted[Math.min(idx, sorted.length - 1)];
}

/**
 * Recent latency trends for Insights Latency tab.
 */
export async function getLatencyTrends(opts: {
  userId: string;
  days?: number;
}): Promise<
  { date: string; avgTtftMs: number | null; p95TtftMs: number | null; errorRate: number }[]
> {
  const days = Math.min(opts.days ?? 30, 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await drizzle
    .select({
      createdAt: schema.callLogs.createdAt,
      ttftMs: schema.callLogs.ttftMs,
      sttError: schema.callLogs.sttError,
      ttsError: schema.callLogs.ttsError,
    })
    .from(schema.callLogs)
    .where(and(eq(schema.callLogs.userId, opts.userId), gte(schema.callLogs.createdAt, since)))
    .orderBy(desc(schema.callLogs.createdAt));

  // Bucket by date (YYYY-MM-DD)
  const byDate = new Map<string, { ttfts: number[]; errors: number; total: number }>();

  for (const r of rows) {
    if (!r.createdAt) continue;
    const dateKey = r.createdAt.toISOString().slice(0, 10);
    const bucket = byDate.get(dateKey) ?? { ttfts: [], errors: 0, total: 0 };
    if (r.ttftMs != null) bucket.ttfts.push(r.ttftMs);
    if (r.sttError || r.ttsError) bucket.errors++;
    bucket.total++;
    byDate.set(dateKey, bucket);
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  return sortedDates.map((d) => {
    const b = byDate.get(d)!;
    const sorted = b.ttfts.sort((a, b) => a - b);
    return {
      date: d,
      avgTtftMs: sorted.length
        ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
        : null,
      p95TtftMs: percentile(sorted, 0.95),
      errorRate: b.total ? Math.round((b.errors / b.total) * 10000) / 100 : 0,
    };
  });
}
