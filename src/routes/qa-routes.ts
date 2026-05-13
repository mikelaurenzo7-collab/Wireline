import { Router, Response } from "express";
import { db, log } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { withAudit } from "../middleware/audit-middleware";
import { claudeRateLimiter } from "../middleware/api-rate-limits";
import { enqueue } from "../lib/job-queue";
import * as claudeBrain from "../lib/claude-brain";
import { getErrorMessage } from "../lib/server-utils";
import { MAX_BATCH_SCORE_LIMIT } from "../lib/qa-constants";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

// ==========================================
// QA SCORING — Claude-powered call quality
// ==========================================

interface CallForQa {
  id: string;
  summary?: string;
  transcript?: string;
  sentiment?: string;
  direction?: string;
  duration_seconds?: number;
  coaching_note?: string;
  agent_id?: string;
  wireline_agents?: { role?: string };
}

interface QaUpdatePayload {
  qa_score: number;
  qa_breakdown: Record<string, unknown>;
  coaching_note?: string;
}

// Score a call against a 5-dimension QA rubric (20 pts each = 100 total).
router.post("/score/:callId", authenticateUser, withAudit("qa"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { callId } = req.params;
    const { data: call, error: callErr } = await db
      .from("wireline_call_logs")
      .select("id, summary, transcript, sentiment, direction, duration_seconds, coaching_note, agent_id, wireline_agents(role)")
      .eq("id", callId)
      .eq("user_id", req.user.id)
      .single();

    if (callErr || !call) return res.status(404).json({ error: "Call not found." });

    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude is not configured." });
    }

    const typedCall = call as unknown as CallForQa;
    const agentRole: string | undefined = typedCall.wireline_agents?.role ?? undefined;

    const breakdown = await claudeBrain.qaScore({
      direction: (typedCall.direction || "inbound") as "inbound" | "outbound",
      agentRole,
      summary: typedCall.summary || "",
      transcript: typedCall.transcript || "",
      sentiment: typedCall.sentiment || "neutral",
      durationSeconds: typedCall.duration_seconds,
    });

    const QA_DIMENSIONS = ["greeting", "discovery", "solution", "objection", "closing"] as const;
    const score = Math.min(
      100,
      Math.max(0, QA_DIMENSIONS.reduce((sum, dim) => sum + (Number((breakdown as any)[dim]) || 0), 0))
    );

    const updatePayload: QaUpdatePayload = { qa_score: score, qa_breakdown: breakdown as unknown as Record<string, unknown> };
    if (breakdown.coaching_note) updatePayload.coaching_note = breakdown.coaching_note;

    await db
      .from("wireline_call_logs")
      .update(updatePayload)
      .eq("id", callId)
      .eq("user_id", req.user.id);

    // Adaptive Optimization: Trigger refinement if score is low (< 60)
    if (score < 60) {
      await enqueue(db, {
        userId: req.user.id,
        type: 'adaptive_optimization',
        payload: {
          agentId: typedCall.agent_id,
          callId,
          score,
          breakdown
        }
      }).catch((e: unknown) => log.error("Failed to enqueue adaptive optimization", { error: getErrorMessage(e) }));
    }

    res.json({ success: true, score, breakdown });
  } catch (e: any) {
    log.error("QA scoring failed", { error: getErrorMessage(e) });
    res.status(500).json({ error: "QA scoring failed." });
  }
});

// Batch-score all unscored calls (or up to `limit`) for the authenticated user.
router.post("/score-batch", authenticateUser, claudeRateLimiter, withAudit("qa"), async (req: AuthenticatedRequest, res: Response) => {
  if (!claudeBrain.isClaudeAvailable()) {
    return res.status(503).json({ error: "Claude is not configured." });
  }
  try {
    const limit = Math.min(MAX_BATCH_SCORE_LIMIT, Math.max(1, parseInt(String(req.body.limit || "20"), 10)));
    const days  = req.body.days ? Math.min(90, Math.max(1, parseInt(String(req.body.days), 10))) : undefined;
    const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;

    const baseQuery = db
      .from("wireline_call_logs")
      .select("id, summary, transcript, sentiment, direction, duration_seconds, agent_id, wireline_agents(role)")
      .eq("user_id", req.user.id)
      .is("qa_score", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    const { data: calls, error } = await (since ? baseQuery.gte("created_at", since) : baseQuery);
    if (error) throw error;
    if (!calls || calls.length === 0) {
      return res.json({ scored: 0, skipped: 0, failed: 0, total: 0 });
    }

    const QA_DIMENSIONS = ["greeting", "discovery", "solution", "objection", "closing"] as const;
    const CONCURRENCY = 3;
    let scored = 0, skipped = 0, failed = 0;

    const sem = Array.from({ length: CONCURRENCY }, () => Promise.resolve());
    let slotIdx = 0;

    const tasks = calls.map((call: unknown) => {
      const typedCall = call as CallForQa;
      const slot = slotIdx % CONCURRENCY;
      slotIdx++;
      return (sem[slot] = sem[slot].then(async () => {
        try {
          if (!typedCall.transcript && !typedCall.summary) { skipped++; return; }
          const agentRole: string | undefined = typedCall.wireline_agents?.role ?? undefined;
          const breakdown = await claudeBrain.qaScore({
            direction: (typedCall.direction || "inbound") as "inbound" | "outbound",
            agentRole,
            summary: typedCall.summary || "",
            transcript: typedCall.transcript || "",
            sentiment: typedCall.sentiment || "neutral",
            durationSeconds: typedCall.duration_seconds,
          });
          const score = Math.min(
            100,
            Math.max(0, QA_DIMENSIONS.reduce((s, d) => s + (Number((breakdown as any)[d]) || 0), 0))
          );
          const updatePayload: QaUpdatePayload = { qa_score: score, qa_breakdown: breakdown as unknown as Record<string, unknown> };
          if (breakdown.coaching_note) updatePayload.coaching_note = breakdown.coaching_note;
          await db.from("wireline_call_logs")
            .update(updatePayload)
            .eq("id", typedCall.id)
            .eq("user_id", req.user.id);
          scored++;
        } catch (err: any) {
          log.warn("Batch QA: single call scoring failed", { callId: typedCall.id, error: getErrorMessage(err) });
          failed++;
        }
      }));
    });

    await Promise.all(tasks);
    res.json({ scored, skipped, failed, total: calls.length });
  } catch (e: any) {
    log.error("Batch QA scoring failed", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Batch QA scoring failed." });
  }
});

interface QaCallRow {
  qa_score?: number;
  qa_breakdown?: Record<string, number>;
  direction?: string;
  agent_id?: string;
  created_at: string;
}

// Aggregate QA stats for the Insights Quality tab.
router.get("/stats", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || "30"), 10)));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data: calls, error } = await db
      .from("wireline_call_logs")
      .select("qa_score, qa_breakdown, direction, agent_id, created_at")
      .eq("user_id", req.user.id)
      .gte("created_at", since)
      .not("qa_score", "is", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!calls || calls.length === 0) {
      return res.json({ count: 0, avgScore: 0, distribution: [], dimensions: {}, trend: [] });
    }

    const typedCalls = calls as unknown as QaCallRow[];
    const avgScore = Math.round(typedCalls.reduce((s: number, c: QaCallRow) => s + (c.qa_score || 0), 0) / typedCalls.length);

    // Score distribution buckets
    const distribution = [
      { label: "Poor (0–39)",       min: 0,  max: 39,  count: 0, color: "#FF6BD9" },
      { label: "Fair (40–59)",      min: 40, max: 59,  count: 0, color: "#FF9A5C" },
      { label: "Good (60–74)",      min: 60, max: 74,  count: 0, color: "#FFD166" },
      { label: "Great (75–89)",     min: 75, max: 89,  count: 0, color: "#4DFFC4" },
      { label: "Excellent (90+)",   min: 90, max: 100, count: 0, color: "#7DF9FF" },
    ];
    typedCalls.forEach((c: QaCallRow) => {
      const bucket = distribution.find((b) => (c.qa_score || 0) >= b.min && (c.qa_score || 0) <= b.max);
      if (bucket) bucket.count++;
    });

    // Average by QA dimension
    const dims = { greeting: 0, discovery: 0, solution: 0, objection: 0, closing: 0 };
    let dimCount = 0;
    typedCalls.forEach((c: QaCallRow) => {
      if (c.qa_breakdown && typeof c.qa_breakdown === "object") {
        dims.greeting  += Number(c.qa_breakdown.greeting)  || 0;
        dims.discovery += Number(c.qa_breakdown.discovery) || 0;
        dims.solution  += Number(c.qa_breakdown.solution)  || 0;
        dims.objection += Number(c.qa_breakdown.objection) || 0;
        dims.closing   += Number(c.qa_breakdown.closing)   || 0;
        dimCount++;
      }
    });
    const dimensions = dimCount > 0
      ? {
          greeting:  +(dims.greeting  / dimCount).toFixed(1),
          discovery: +(dims.discovery / dimCount).toFixed(1),
          solution:  +(dims.solution  / dimCount).toFixed(1),
          objection: +(dims.objection / dimCount).toFixed(1),
          closing:   +(dims.closing   / dimCount).toFixed(1),
        }
      : dims;

    // 7-day trend (or last 7 available days)
    const byDay: Record<string, number[]> = {};
    typedCalls.forEach((c: QaCallRow) => {
      const day = c.created_at.slice(0, 10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(c.qa_score || 0);
    });
    const trend = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([day, scores]) => ({ day, avg: Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) }));

    res.json({ count: typedCalls.length, avgScore, distribution, dimensions, trend });
  } catch (e: any) {
    log.error("QA stats failed", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to fetch QA stats." });
  }
});

export default router;
