import { quotaTracker } from "../lib/server-context";
import { buildDecision, dailyPeriodKey, quotaRejectionHeaders } from "../lib/tenant-quotas";

function nextDailyResetIso(now: Date = new Date()): string {
  const t = new Date(now);
  t.setUTCHours(24, 0, 0, 0);
  return t.toISOString();
}

/**
 * Hard stop when today’s Anthropic token tally is already at or above plan
 * limit — runs *before* Claude calls. Actual usage is recorded post-call
 * via audit-middleware (+ async job worker) using token-accurate counts.
 */
export async function enforceClaudeDailyTokenQuota(req: any, res: any, next: any) {
  const userId = req.user?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });

  try {
    const { profile } = await quotaTracker.getProfile(userId);
    const limit = profile.claude_tokens_daily;
    const used = await quotaTracker.getUsage(userId, "claude_tokens_daily");
    if (used >= limit) {
      const decision = buildDecision({
        dimension: "claude_tokens_daily",
        limit,
        used,
        delta: 0,
        period_key: dailyPeriodKey(),
        reset_at: nextDailyResetIso(),
      });
      Object.entries(quotaRejectionHeaders(decision)).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(429).json({
        error: "Daily Claude token quota exceeded for your plan.",
        code: "QUOTA_CLAUDE_TOKENS",
        quota: decision,
      });
    }
    next();
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: "Quota check failed.", code: "QUOTA_CHECK_FAILED", detail: msg });
  }
}
