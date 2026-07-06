import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import { withAudit } from "../middleware/audit-middleware";
import { createRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import { AppError } from "../lib/api-error";
import { runStructured } from "../lib/ai-structured";
import { AI_TOOLS } from "../lib/ai-tools";
import { computeQaStats, listUnscoredCallIds } from "../lib/qa-stats";

const router = Router();
const limiter = createRateLimiter({ bucket: "api:qa", windowMs: 60_000, max: 30 });

router.get("/stats", authenticateUser, limiter, async (req: AuthenticatedRequest, res) => {
  const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || "30"), 10) || 30));
  const stats = await computeQaStats(req.user.id, days);
  res.json(stats);
});

router.post("/score-batch", authenticateUser, limiter, withAudit("qa"), async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const limit = Math.min(50, Math.max(1, parseInt(String(req.body?.limit || "20"), 10) || 20));
  const days = Math.min(365, Math.max(1, parseInt(String(req.body?.days || "30"), 10) || 30));
  const ids = await listUnscoredCallIds(authReq.user.id, days, limit);

  let scored = 0;
  let failed = 0;

  for (const callId of ids) {
    try {
      const [call] = await drizzle
        .select({
          id: schema.callLogs.id,
          summary: schema.callLogs.summary,
          transcript: schema.callLogs.transcript,
          sentiment: schema.callLogs.sentiment,
          direction: schema.callLogs.direction,
          durationSeconds: schema.callLogs.durationSeconds,
          agentRole: schema.agents.role,
        })
        .from(schema.callLogs)
        .leftJoin(schema.agents, eq(schema.callLogs.agentId, schema.agents.id))
        .where(
          and(eq(schema.callLogs.id, callId), eq(schema.callLogs.userId, authReq.user.id)),
        )
        .limit(1);
      if (!call) continue;

      const breakdown = await runStructured<{
        greeting: number;
        discovery: number;
        solution: number;
        objection: number;
        closing: number;
        coaching_note: string;
      }>({
        system:
          "Score a customer call from 0 to 20 each for greeting, discovery, solution, objection handling, and closing. Use only evidence and return concise coaching.",
        user: `Direction: ${call.direction || "inbound"}\nRole: ${call.agentRole || "assistant"}\nSummary: ${call.summary || ""}\nTranscript: ${(call.transcript || "").slice(0, 22000)}`,
        tool: AI_TOOLS.qaScore,
        complexity: "medium",
        maxTokens: 1200,
      });
      const score = Math.max(
        0,
        Math.min(
          100,
          breakdown.greeting +
            breakdown.discovery +
            breakdown.solution +
            breakdown.objection +
            breakdown.closing,
        ),
      );
      await drizzle
        .update(schema.callLogs)
        .set({ qaScore: score, qaBreakdown: breakdown, coachingNote: breakdown.coaching_note })
        .where(eq(schema.callLogs.id, call.id));
      scored++;
    } catch {
      failed++;
    }
  }

  res.json({ scored, total: ids.length, failed });
});

router.post(
  "/score/:callId",
  authenticateUser,
  limiter,
  withAudit("qa"),
  async (req: AuthenticatedRequest, res) => {
    const [call] = await drizzle
      .select({
        id: schema.callLogs.id,
        summary: schema.callLogs.summary,
        transcript: schema.callLogs.transcript,
        sentiment: schema.callLogs.sentiment,
        direction: schema.callLogs.direction,
        durationSeconds: schema.callLogs.durationSeconds,
        agentRole: schema.agents.role,
      })
      .from(schema.callLogs)
      .leftJoin(schema.agents, eq(schema.callLogs.agentId, schema.agents.id))
      .where(
        and(
          eq(schema.callLogs.id, BigInt(req.params.callId)),
          eq(schema.callLogs.userId, req.user.id),
        ),
      )
      .limit(1);
    if (!call) throw AppError.fromHttpStatus(404, "Call not found");
    const breakdown = await runStructured<{
      greeting: number;
      discovery: number;
      solution: number;
      objection: number;
      closing: number;
      coaching_note: string;
    }>({
      system:
        "Score a customer call from 0 to 20 each for greeting, discovery, solution, objection handling, and closing. Use only evidence and return concise coaching.",
      user: `Direction: ${call.direction || "inbound"}\nRole: ${call.agentRole || "assistant"}\nSummary: ${call.summary || ""}\nTranscript: ${(call.transcript || "").slice(0, 22000)}`,
      tool: AI_TOOLS.qaScore,
      complexity: "medium",
      maxTokens: 1200,
    });
    const score = Math.max(
      0,
      Math.min(
        100,
        breakdown.greeting +
          breakdown.discovery +
          breakdown.solution +
          breakdown.objection +
          breakdown.closing,
      ),
    );
    await drizzle
      .update(schema.callLogs)
      .set({ qaScore: score, qaBreakdown: breakdown, coachingNote: breakdown.coaching_note })
      .where(eq(schema.callLogs.id, call.id));
    res.json({ success: true, score, breakdown });
  },
);
export default router;
