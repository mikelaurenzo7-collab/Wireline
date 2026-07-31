import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
/**
 * Sales pipeline endpoint — exposes outbound leads grouped by
 * pipeline_stage for the /pipeline Kanban view.
 *
 * Stages: cold → contacted → qualified → demo → won | lost
 *
 * Account Holders move cards manually via PATCH (drag-drop in the UI ends up
 * here), or agents auto-progress them via the action-engine.
 */

import { Router, Response } from "express";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, parseBigIntId } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

export const PIPELINE_STAGES = ["cold", "contacted", "qualified", "demo", "won", "lost"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

function isStage(s: unknown): s is PipelineStage {
  return typeof s === "string" && (PIPELINE_STAGES as readonly string[]).includes(s);
}

router.get("/api/pipeline", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");

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
    if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");
    const targetStage = req.body?.pipelineStage;
    if (!isStage(targetStage)) {
      return res
        .status(400)
        .json({ error: `pipelineStage must be one of ${PIPELINE_STAGES.join(", ")}` });
    }
    const leadId = parseBigIntId(req.params.id);
    if (leadId === null) {
      throw AppError.fromHttpStatus(400, "Lead id must be a positive integer");
    }
    const [row] = await drizzle
      .update(schema.outboundLeads)
      .set({ pipelineStage: targetStage })
      .where(and(eq(schema.outboundLeads.id, leadId), eq(schema.outboundLeads.userId, req.user.id)))
      .returning({
        id: schema.outboundLeads.id,
        pipelineStage: schema.outboundLeads.pipelineStage,
      });
    if (!row) throw AppError.fromHttpStatus(404, "Lead not found");
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
    try {
      if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");
      const days = Math.min(180, Math.max(1, Number(req.query.days) || 30));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const rows = await drizzle
        .select({
          source: sql<string>`COALESCE(${schema.callLogs.campaignSource}, '(untagged)')`,
          calls: sql<number>`count(*)::int`,
          total_seconds: sql<number>`coalesce(sum(${schema.callLogs.durationSeconds}), 0)::int`,
          booked: sql<number>`count(*) filter (where ${schema.callLogs.outcomeTag} = 'booked')::int`,
          qualified: sql<number>`count(*) filter (where ${schema.callLogs.outcomeTag} = 'qualified')::int`,
        })
        .from(schema.callLogs)
        .where(and(eq(schema.callLogs.userId, req.user.id), gte(schema.callLogs.createdAt, since)))
        .groupBy(sql`COALESCE(${schema.callLogs.campaignSource}, '(untagged)')`)
        .orderBy(sql`count(*) desc`)
        .limit(50);
      return res.json({ days, attribution: rows });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("campaign-attribution failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to load campaign attribution");
    }
  },
);

export default router;
