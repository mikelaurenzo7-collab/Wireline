/* eslint-disable @typescript-eslint/no-explicit-any -- tenant configuration columns and aggregated drizzle rows have shapes that vary by route. */
import { Router, Response } from "express";
import { AppError, rethrowIfAppError } from "../lib/api-error";
import type { AuthenticatedRequest } from "../types/auth";

import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, desc, inArray, isNotNull } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import { CampaignCreateSchema, CampaignUpdateSchema } from "../lib/form-validators";
import { computeOutcomeBreakdown, computeCallStats } from "../lib/campaign-analytics";
import { validateBody } from "../lib/api-validation";
import { claudeRateLimiter, campaignWriteRateLimit } from "../middleware/api-rate-limits";
import { touchNavCounts } from "../lib/nav-counts-invalidate";
import { CAMPAIGN_STATUS, LEAD_STATUS } from "../lib/outbound-status";
import { outboundVoiceGuard } from "../lib/voice-spend-control";
import { assertFederalDncForMarketing } from "../lib/federal-dnc-service";
import { enqueue } from "../lib/job-queue";

const router = Router();

router.get("/api/campaigns", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const campaigns = await drizzle
      .select()
      .from(schema.outboundCampaigns)
      .where(eq(schema.outboundCampaigns.userId, req.user.id))
      .orderBy(desc(schema.outboundCampaigns.createdAt));

    const campaignIds = campaigns.map((c) => c.id);
    let leadStats: Record<string, { total: number; dialed: number; connected: number }> = {};

    if (campaignIds.length > 0) {
      // Aggregate lead stats in SQL — avoids loading all lead rows into memory
      const rows = await drizzle
        .select({
          campaignId: schema.outboundLeads.campaignId,
          total: sql<number>`count(*)`,
          dialed: sql<number>`count(*) filter (where ${schema.outboundLeads.status} not in ('Pending', 'Queued'))`,
          connected: sql<number>`count(*) filter (where ${schema.outboundLeads.status} in ('Connected', 'Completed'))`,
        })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.userId, req.user.id),
            isNotNull(schema.outboundLeads.campaignId),
            inArray(schema.outboundLeads.campaignId, campaignIds),
          ),
        )
        .groupBy(schema.outboundLeads.campaignId);

      for (const row of rows) {
        if (!row.campaignId) continue;
        leadStats[row.campaignId] = {
          total: Number(row.total),
          dialed: Number(row.dialed),
          connected: Number(row.connected),
        };
      }
    }

    const enriched = campaigns.map((c) => {
      const s = leadStats[c.id] ?? { total: 0, dialed: 0, connected: 0 };
      return { ...c, leads_count: s.total, dialed_count: s.dialed, connected_count: s.connected };
    });

    res.json({ campaigns: mapObjectToSnake(enriched) });
  } catch (error: any) {
    log.error("Failed to fetch campaigns", { error: getErrorMessage(error) });
    throw AppError.fromHttpStatus(500, "Failed to fetch campaigns");
  }
});

router.post(
  "/api/campaigns",
  authenticateUser,
  campaignWriteRateLimit,
  validateBody(CampaignCreateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, goal, agent_id, call_window_start, call_window_end, max_attempts } = req.body;

      if (agent_id) {
        const [agent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agent_id), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
      }

      const [data] = (await drizzle
        .insert(schema.outboundCampaigns)
        .values({
          userId: req.user.id,
          name: name.trim(),
          goal: goal?.trim() || null,
          agentId: agent_id || null,
          callWindowStart: call_window_start || "09:00",
          callWindowEnd: call_window_end || "17:00",
          maxAttempts: Number(max_attempts) || 3,
          status: "draft",
        })
        .returning()) as any[];

      res.json({ campaign: mapObjectToSnake(data) });
    } catch (error: any) {
      log.error("Failed to create campaign", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to create campaign");
    }
  },
);

router.patch(
  "/api/campaigns/:id",
  authenticateUser,
  campaignWriteRateLimit,
  validateBody(CampaignUpdateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.body?.agent_id) {
        const [agent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(
            and(eq(schema.agents.id, req.body.agent_id), eq(schema.agents.userId, req.user.id)),
          )
          .limit(1);
        if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
      }

      const updates: any = { updatedAt: new Date() };
      if (req.body?.name !== undefined) updates.name = req.body.name;
      if (req.body?.goal !== undefined) updates.goal = req.body.goal;
      if (req.body?.agent_id !== undefined) updates.agentId = req.body.agent_id;
      if (req.body?.status !== undefined) updates.status = req.body.status;
      if (req.body?.call_window_start !== undefined)
        updates.callWindowStart = req.body.call_window_start;
      if (req.body?.call_window_end !== undefined) updates.callWindowEnd = req.body.call_window_end;
      if (req.body?.max_attempts !== undefined) updates.maxAttempts = req.body.max_attempts;

      const [data] = (await drizzle
        .update(schema.outboundCampaigns)
        .set(updates)
        .where(
          and(
            eq(schema.outboundCampaigns.id, req.params.id),
            eq(schema.outboundCampaigns.userId, req.user.id),
          ),
        )
        .returning()) as any[];

      // Without this the handler answered 200 with an empty body for a campaign
      // the caller does not own or that no longer exists, so a client read the
      // edit as saved.
      if (!data) throw AppError.fromHttpStatus(404, "Campaign not found.");

      res.json({ campaign: mapObjectToSnake(data) });
    } catch (error: any) {
      // The handler above throws its own 404 for an unknown campaign; without
      // this that is caught here and reported as a server fault.
      rethrowIfAppError(error);
      log.error("Failed to update campaign", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to update campaign");
    }
  },
);

router.delete(
  "/api/campaigns/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await drizzle
        .delete(schema.outboundCampaigns)
        .where(
          and(
            eq(schema.outboundCampaigns.id, req.params.id),
            eq(schema.outboundCampaigns.userId, req.user.id),
          ),
        );
      res.json({ success: true });
    } catch (error: any) {
      log.error("Failed to delete campaign", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to delete campaign");
    }
  },
);

router.get(
  "/api/campaigns/:id/leads",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const limitRaw = parseInt(req.query.limit as string);
      const offsetRaw = parseInt(req.query.offset as string);
      const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 200 : limitRaw), 1000);
      const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);

      const [countResult] = await drizzle
        .select({ count: sql`count(*)` })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.campaignId, req.params.id),
            eq(schema.outboundLeads.userId, req.user.id),
          ),
        );

      const count = Number(countResult.count);

      const data = await drizzle
        .select()
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.campaignId, req.params.id),
            eq(schema.outboundLeads.userId, req.user.id),
          ),
        )
        .orderBy(desc(schema.outboundLeads.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({
        leads: mapObjectToSnake(data || []),
        total: count || 0,
        hasMore: offset + limit < count,
      });
    } catch (error: any) {
      log.error("Failed to fetch campaign leads", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to fetch campaign leads");
    }
  },
);

router.get(
  "/api/campaigns/:id/analytics",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campaignId = req.params.id;
      const userId = req.user.id;

      const [campaign] = await drizzle
        .select({
          id: schema.outboundCampaigns.id,
          name: schema.outboundCampaigns.name,
          status: schema.outboundCampaigns.status,
          createdAt: schema.outboundCampaigns.createdAt,
        })
        .from(schema.outboundCampaigns)
        .where(
          and(
            eq(schema.outboundCampaigns.id, campaignId),
            eq(schema.outboundCampaigns.userId, userId),
          ),
        )
        .limit(1);

      if (!campaign) throw AppError.fromHttpStatus(404, "Campaign not found");

      const leads = await drizzle
        .select({ status: schema.outboundLeads.status, callId: schema.outboundLeads.callId })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.campaignId, campaignId),
            eq(schema.outboundLeads.userId, userId),
          ),
        );

      const leadRows = leads ?? [];
      const { total, outcomes } = computeOutcomeBreakdown(leadRows as any);

      const callIds = leadRows.map((l) => l.callId).filter(Boolean) as string[];
      let call_stats = computeCallStats([]);
      if (callIds.length > 0) {
        const callRows = await drizzle
          .select({
            durationSeconds: schema.callLogs.durationSeconds,
            costUsd: schema.callLogs.cost,
            leadScore: schema.callLogs.leadScore,
          })
          .from(schema.callLogs)
          .where(
            and(eq(schema.callLogs.userId, userId), inArray(schema.callLogs.vapiCallId, callIds)),
          );

        call_stats = computeCallStats(
          callRows.map((c) => ({
            duration_seconds: c.durationSeconds,
            cost_usd: c.costUsd,
            lead_score: c.leadScore,
          })),
        );
      }

      res.json({
        campaign: mapObjectToSnake(campaign),
        total,
        outcomes,
        call_stats,
      });
    } catch (e: any) {
      // The handler above throws its own 404 for an unknown campaign; without
      // this that is caught here and reported as a server fault.
      rethrowIfAppError(e);
      log.error("Campaign analytics failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Failed to load analytics");
    }
  },
);

router.post(
  "/api/campaigns/:id/launch",
  authenticateUser,
  outboundVoiceGuard("campaign"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campaignId = req.params.id;

      const [campaign] = await drizzle
        .select({
          id: schema.outboundCampaigns.id,
          name: schema.outboundCampaigns.name,
          goal: schema.outboundCampaigns.goal,
          agentId: schema.outboundCampaigns.agentId,
          status: schema.outboundCampaigns.status,
          callWindowStart: schema.outboundCampaigns.callWindowStart,
          callWindowEnd: schema.outboundCampaigns.callWindowEnd,
          maxAttempts: schema.outboundCampaigns.maxAttempts,
        })
        .from(schema.outboundCampaigns)
        .where(
          and(
            eq(schema.outboundCampaigns.id, campaignId),
            eq(schema.outboundCampaigns.userId, req.user.id),
          ),
        )
        .limit(1);

      if (!campaign) throw AppError.fromHttpStatus(404, "Campaign not found.");
      if (campaign.status === CAMPAIGN_STATUS.RUNNING)
        throw AppError.fromHttpStatus(409, "Campaign is already running.");

      const launchApprovalConfirmed =
        req.body?.launch_approval_confirmed === true || req.body?.launchApprovalConfirmed === true;
      if (!launchApprovalConfirmed) {
        return res.status(400).json({
          code: "LAUNCH_APPROVAL_REQUIRED",
          error:
            "Confirm the compliance checklist before launching. Set launch_approval_confirmed: true after review.",
        });
      }

      // Promote imported Pending leads into Queued so create → import → launch works.
      await drizzle
        .update(schema.outboundLeads)
        .set({ status: LEAD_STATUS.QUEUED })
        .where(
          and(
            eq(schema.outboundLeads.campaignId, campaignId),
            eq(schema.outboundLeads.userId, req.user.id),
            eq(schema.outboundLeads.status, LEAD_STATUS.PENDING),
          ),
        );

      const queued = await drizzle
        .select({
          id: schema.outboundLeads.id,
          customerName: schema.outboundLeads.customerName,
          customerNumber: schema.outboundLeads.customerNumber,
          context: schema.outboundLeads.context,
          agentId: schema.outboundLeads.agentId,
          attempts: schema.outboundLeads.attempts,
        })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.campaignId, campaignId),
            eq(schema.outboundLeads.userId, req.user.id),
            eq(schema.outboundLeads.status, LEAD_STATUS.QUEUED),
          ),
        );

      if (!queued || queued.length === 0) {
        throw AppError.fromHttpStatus(400, "No queued leads in this campaign.");
      }

      const federalGate = assertFederalDncForMarketing();
      if (!federalGate.allowed) {
        return res.status(503).json({
          code: federalGate.code,
          error: federalGate.message,
        });
      }

      const previousStatus = campaign.status;

      await drizzle
        .update(schema.outboundCampaigns)
        .set({ status: CAMPAIGN_STATUS.RUNNING, updatedAt: new Date() })
        .where(
          and(
            eq(schema.outboundCampaigns.id, campaignId),
            eq(schema.outboundCampaigns.userId, req.user.id),
          ),
        );

      const enq = await enqueue(drizzle, {
        userId: req.user.id,
        type: "campaign_dial",
        payload: { userId: req.user.id, campaignId },
      });

      if (!enq.ok) {
        await drizzle
          .update(schema.outboundCampaigns)
          .set({ status: previousStatus, updatedAt: new Date() })
          .where(
            and(
              eq(schema.outboundCampaigns.id, campaignId),
              eq(schema.outboundCampaigns.userId, req.user.id),
            ),
          );
        return res.status(503).json({
          code: "CAMPAIGN_ENQUEUE_FAILED",
          error: enq.error || "Failed to enqueue campaign dial job.",
        });
      }

      res.json({ success: true, jobId: enq.jobId, dispatching: queued.length });
    } catch (error: any) {
      log.error("Campaign launch failed", { error: getErrorMessage(error) });
      if (error instanceof AppError) throw error;
      throw AppError.fromHttpStatus(500, "Failed to launch campaign.");
    }
  },
);

router.post(
  "/api/campaigns/:id/retry-failed",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campaignId = req.params.id;
      const [campaign] = await drizzle
        .select({
          id: schema.outboundCampaigns.id,
          agentId: schema.outboundCampaigns.agentId,
          status: schema.outboundCampaigns.status,
        })
        .from(schema.outboundCampaigns)
        .where(
          and(
            eq(schema.outboundCampaigns.id, campaignId),
            eq(schema.outboundCampaigns.userId, req.user.id),
          ),
        )
        .limit(1);

      if (!campaign) throw AppError.fromHttpStatus(404, "Campaign not found.");

      const failed = await drizzle
        .select({ id: schema.outboundLeads.id })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.campaignId, campaignId),
            eq(schema.outboundLeads.userId, req.user.id),
            eq(schema.outboundLeads.status, "Failed"),
          ),
        );

      if (!failed || failed.length === 0) {
        throw AppError.fromHttpStatus(400, "No failed leads to retry.");
      }

      const failedIds = failed.map((l) => l.id);

      await drizzle
        .update(schema.outboundLeads)
        .set({ status: "Queued" })
        .where(
          and(
            inArray(schema.outboundLeads.id, failedIds),
            eq(schema.outboundLeads.userId, req.user.id),
          ),
        );

      touchNavCounts(req.user.id);
      res.json({ success: true, reset: failed.length });
    } catch (error: any) {
      // The handler above throws its own 404 for an unknown campaign; without
      // this that is caught here and reported as a server fault.
      rethrowIfAppError(error);
      log.error("Retry failed leads error", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to retry leads.");
    }
  },
);

router.post(
  "/api/campaigns/:id/stop",
  authenticateUser,
  claudeRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campaignId = req.params.id;
      const [campaign] = await drizzle
        .select({ id: schema.outboundCampaigns.id, status: schema.outboundCampaigns.status })
        .from(schema.outboundCampaigns)
        .where(
          and(
            eq(schema.outboundCampaigns.id, campaignId),
            eq(schema.outboundCampaigns.userId, req.user.id),
          ),
        )
        .limit(1);

      if (!campaign) throw AppError.fromHttpStatus(404, "Campaign not found.");
      if (campaign.status !== "running") {
        throw AppError.fromHttpStatus(409, "Campaign is not currently running.");
      }

      await drizzle
        .update(schema.outboundCampaigns)
        .set({ status: "paused", updatedAt: new Date() })
        .where(
          and(
            eq(schema.outboundCampaigns.id, campaignId),
            eq(schema.outboundCampaigns.userId, req.user.id),
          ),
        );

      res.json({ success: true });
    } catch (error: any) {
      // The handler above throws its own 404 for an unknown campaign; without
      // this that is caught here and reported as a server fault.
      rethrowIfAppError(error);
      log.error("Campaign stop failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to stop campaign.");
    }
  },
);

export default router;
