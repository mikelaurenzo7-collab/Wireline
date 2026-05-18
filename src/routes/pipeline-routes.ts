/**
 * Sales pipeline endpoint — exposes outbound leads grouped by
 * pipeline_stage for the /pipeline Kanban view.
 *
 * Stages: cold → contacted → qualified → demo → won | lost
 *
 * Operators move cards manually via PATCH (drag-drop in the UI ends up
 * here), or agents auto-progress them via the action-engine.
 */

import { Router, Response } from "express";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

export const PIPELINE_STAGES = ["cold", "contacted", "qualified", "demo", "won", "lost"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

function isStage(s: unknown): s is PipelineStage {
  return typeof s === "string" && (PIPELINE_STAGES as readonly string[]).includes(s);
}

router.get("/api/pipeline", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });

  const rows = await drizzle
    .select({
      id: schema.outboundLeads.id,
      customerName: schema.outboundLeads.customerName,
      customerNumber: schema.outboundLeads.customerNumber,
      email: schema.outboundLeads.email,
      status: schema.outboundLeads.status,
      pipelineStage: schema.outboundLeads.pipelineStage,
      campaignSource: schema.outboundLeads.campaignSource,
      attempts: schema.outboundLeads.attempts,
      lastCalledAt: schema.outboundLeads.lastCalledAt,
      lastContactSummary: schema.outboundLeads.lastContactSummary,
      agentId: schema.outboundLeads.agentId,
      demo: schema.outboundLeads.demo,
      createdAt: schema.outboundLeads.createdAt,
    })
    .from(schema.outboundLeads)
    .where(eq(schema.outboundLeads.userId, req.user.id))
    .orderBy(desc(schema.outboundLeads.lastCalledAt))
    .limit(500);

  // Group by stage; ensure every stage is present (empty array if no leads).
  const board: Record<PipelineStage, typeof rows> = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s, []]),
  ) as any;
  for (const r of rows) {
    const stage = isStage(r.pipelineStage) ? r.pipelineStage : "cold";
    board[stage].push(r);
  }

  // Summary counts for header chips
  const counts = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, board[s].length])) as Record<
    PipelineStage,
    number
  >;

  return res.json({ board, counts });
});

router.patch(
  "/api/pipeline/lead/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    const targetStage = req.body?.pipelineStage;
    if (!isStage(targetStage)) {
      return res
        .status(400)
        .json({ error: `pipelineStage must be one of ${PIPELINE_STAGES.join(", ")}` });
    }
    const [row] = await drizzle
      .update(schema.outboundLeads)
      .set({ pipelineStage: targetStage })
      .where(
        and(
          eq(schema.outboundLeads.id, BigInt(req.params.id)),
          eq(schema.outboundLeads.userId, req.user.id),
        ),
      )
      .returning({
        id: schema.outboundLeads.id,
        pipelineStage: schema.outboundLeads.pipelineStage,
      });
    if (!row) return res.status(404).json({ error: "Lead not found" });
    log.info("Pipeline stage updated", {
      userId: req.user.id,
      leadId: req.params.id,
      stage: targetStage,
    });
    return res.json({ lead: row });
  },
);

/**
 * Lightweight summary endpoint for the Insights page — calls grouped by
 * campaign_source for the past N days (default 30).
 */
router.get(
  "/api/insights/campaign-attribution",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    const days = Math.min(180, Math.max(1, Number(req.query.days) || 30));
    const rows = await drizzle.execute(sql`
      SELECT
        COALESCE(campaign_source, '(untagged)') AS source,
        COUNT(*)::int                          AS calls,
        SUM(duration_seconds)::int             AS total_seconds,
        COUNT(*) FILTER (WHERE outcome_tag = 'booked')::int    AS booked,
        COUNT(*) FILTER (WHERE outcome_tag = 'qualified')::int AS qualified
      FROM wireline_call_logs
      WHERE user_id = ${req.user.id}
        AND created_at >= NOW() - INTERVAL '${sql.raw(String(days))} days'
      GROUP BY 1
      ORDER BY calls DESC
      LIMIT 50
    `);
    const data = (rows as any).rows ?? rows;
    return res.json({ days, attribution: data });
  },
);

export default router;
