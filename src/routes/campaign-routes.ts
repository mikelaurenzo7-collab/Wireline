import { Router, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";

import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { parseFormData, CampaignCreateSchema, CampaignUpdateSchema } from "../lib/form-validators";
import { computeOutcomeBreakdown, computeCallStats, callIdsFromLeads } from "../lib/campaign-analytics";
import { claudeRateLimiter } from "../middleware/api-rate-limits";

const router = Router();

const CALL_WINDOW_CHECK_INTERVAL_MS = 30000;
const CAMPAIGN_DIAL_SPACING_MS = 2000;

import { isDncBlocked } from "../lib/compliance";
import { placeOutboundCall } from "../lib/vapi-client";

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
      const allLeads = await drizzle
        .select({
          campaignId: schema.outboundLeads.campaignId,
          status: schema.outboundLeads.status
        })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.userId, req.user.id),
            isNotNull(schema.outboundLeads.campaignId),
            inArray(schema.outboundLeads.campaignId, campaignIds)
          )
        );

      for (const row of allLeads) {
        if (!row.campaignId) continue;
        const s = leadStats[row.campaignId] ?? { total: 0, dialed: 0, connected: 0 };
        s.total++;
        if (row.status !== 'Pending' && row.status !== 'Queued') s.dialed++;
        if (row.status === 'Completed') s.connected++;
        leadStats[row.campaignId] = s;
      }
    }

    const enriched = campaigns.map((c) => {
      const s = leadStats[c.id] ?? { total: 0, dialed: 0, connected: 0 };
      return { ...c, leads_count: s.total, dialed_count: s.dialed, connected_count: s.connected };
    });

    res.json({ campaigns: enriched });
  } catch (error: any) {
    log.error("Failed to fetch campaigns", { error: getErrorMessage(error) });
    res.json({ campaigns: [] });
  }
});

router.post("/api/campaigns", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = parseFormData(CampaignCreateSchema, {
      name: req.body.name,
      goal: req.body.goal,
      agent_id: req.body.agent_id,
      call_window_start: req.body.call_window_start,
      call_window_end: req.body.call_window_end,
      max_attempts: req.body.max_attempts,
    });
    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }
    const { name, goal, agent_id, call_window_start, call_window_end, max_attempts } = validation.data!;

    if (agent_id) {
      const [agent] = await drizzle
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agent_id), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }

    const [data] = await drizzle
      .insert(schema.outboundCampaigns)
      .values({
        userId: req.user.id,
        name: name.trim(),
        goal: goal?.trim() || null,
        agentId: agent_id || null,
        callWindowStart: call_window_start || '09:00',
        callWindowEnd: call_window_end || '17:00',
        maxAttempts: Number(max_attempts) || 3,
        status: 'draft',
      })
      .returning();

    res.json({ campaign: data });
  } catch (error: any) {
    log.error("Failed to create campaign", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.patch("/api/campaigns/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = parseFormData(CampaignUpdateSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }

    if (validation.data?.agent_id) {
      const [agent] = await drizzle
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, validation.data.agent_id), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }

    const updates: any = { updatedAt: new Date() };
    if (validation.data?.name !== undefined) updates.name = validation.data.name;
    if (validation.data?.goal !== undefined) updates.goal = validation.data.goal;
    if (validation.data?.agent_id !== undefined) updates.agentId = validation.data.agent_id;
    if (validation.data?.status !== undefined) updates.status = validation.data.status;
    if (validation.data?.call_window_start !== undefined) updates.callWindowStart = validation.data.call_window_start;
    if (validation.data?.call_window_end !== undefined) updates.callWindowEnd = validation.data.call_window_end;
    if (validation.data?.max_attempts !== undefined) updates.maxAttempts = validation.data.max_attempts;

    const [data] = await drizzle
      .update(schema.outboundCampaigns)
      .set(updates)
      .where(and(eq(schema.outboundCampaigns.id, req.params.id), eq(schema.outboundCampaigns.userId, req.user.id)))
      .returning();

    res.json({ campaign: data });
  } catch (error: any) {
    log.error("Failed to update campaign", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

router.delete("/api/campaigns/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await drizzle
      .delete(schema.outboundCampaigns)
      .where(and(eq(schema.outboundCampaigns.id, req.params.id), eq(schema.outboundCampaigns.userId, req.user.id)));
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to delete campaign", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

router.get("/api/campaigns/:id/leads", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 200 : limitRaw), 1000);
    const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);

    const [countResult] = await drizzle
      .select({ count: sql`count(*)` })
      .from(schema.outboundLeads)
      .where(and(eq(schema.outboundLeads.campaignId, req.params.id), eq(schema.outboundLeads.userId, req.user.id)));
    
    const count = Number(countResult.count);

    const data = await drizzle
      .select()
      .from(schema.outboundLeads)
      .where(and(eq(schema.outboundLeads.campaignId, req.params.id), eq(schema.outboundLeads.userId, req.user.id)))
      .orderBy(desc(schema.outboundLeads.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      leads: data || [],
      total: count || 0,
      hasMore: (offset + limit) < count,
    });
  } catch (error: any) {
    log.error("Failed to fetch campaign leads", { error: getErrorMessage(error) });
    res.json({ leads: [] });
  }
});

router.get("/api/campaigns/:id/analytics", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user.id;

    const [campaign] = await drizzle
      .select({ id: schema.outboundCampaigns.id, name: schema.outboundCampaigns.name, status: schema.outboundCampaigns.status, createdAt: schema.outboundCampaigns.createdAt })
      .from(schema.outboundCampaigns)
      .where(and(eq(schema.outboundCampaigns.id, campaignId), eq(schema.outboundCampaigns.userId, userId)))
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const leads = await drizzle
      .select({ status: schema.outboundLeads.status, callId: schema.outboundLeads.callId })
      .from(schema.outboundLeads)
      .where(and(eq(schema.outboundLeads.campaignId, campaignId), eq(schema.outboundLeads.userId, userId)));

    const leadRows = leads ?? [];
    const { total, outcomes } = computeOutcomeBreakdown(leadRows as any);

    const callIds = leadRows.map(l => l.callId).filter(Boolean) as string[];
    let call_stats = computeCallStats([]);
    if (callIds.length > 0) {
      const callRows = await drizzle
        .select({ durationSeconds: schema.callLogs.durationSeconds, costUsd: schema.callLogs.cost, leadScore: schema.callLogs.leadScore })
        .from(schema.callLogs)
        .where(and(eq(schema.callLogs.userId, userId), inArray(schema.callLogs.id, callIds)));
      
      call_stats = computeCallStats(callRows.map(c => ({ duration_seconds: c.durationSeconds, cost: c.costUsd, lead_score: c.leadScore })) as any);
    }

    res.json({ campaign, total, outcomes, call_stats });
  } catch (e: any) {
    log.error("Campaign analytics failed", { error: e?.message });
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

router.post("/api/campaigns/:id/launch", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const campaignId = req.params.id;

    const [campaign] = await drizzle
      .select({ id: schema.outboundCampaigns.id, name: schema.outboundCampaigns.name, agentId: schema.outboundCampaigns.agentId, status: schema.outboundCampaigns.status, callWindowStart: schema.outboundCampaigns.callWindowStart, callWindowEnd: schema.outboundCampaigns.callWindowEnd, maxAttempts: schema.outboundCampaigns.maxAttempts })
      .from(schema.outboundCampaigns)
      .where(and(eq(schema.outboundCampaigns.id, campaignId), eq(schema.outboundCampaigns.userId, req.user.id)))
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (campaign.status === 'running') return res.status(409).json({ error: "Campaign is already running." });

    const queued = await drizzle
      .select({ id: schema.outboundLeads.id, customerName: schema.outboundLeads.customerName, customerNumber: schema.outboundLeads.customerNumber, context: schema.outboundLeads.context, agentId: schema.outboundLeads.agentId, attempts: schema.outboundLeads.attempts })
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.campaignId, campaignId),
          eq(schema.outboundLeads.userId, req.user.id),
          eq(schema.outboundLeads.status, 'Queued')
        )
      );

    if (!queued || queued.length === 0) {
      return res.status(400).json({ error: "No queued leads in this campaign." });
    }

    await drizzle
      .update(schema.outboundCampaigns)
      .set({ status: 'running', updatedAt: new Date() })
      .where(and(eq(schema.outboundCampaigns.id, campaignId), eq(schema.outboundCampaigns.userId, req.user.id)));

    res.json({ success: true, dispatching: queued.length });

    // Fire-and-forget: dial sequentially with a configurable gap between calls
    // so the Vapi rate limiter is not hit. The entire async body is wrapped in
    // try/catch so a thrown error always marks the campaign completed/failed.
    const windowStart = campaign.callWindowStart || '09:00';
    const windowEnd   = campaign.callWindowEnd   || '21:00';

    function isWithinCallWindow(): boolean {
      const now = new Date();
      const hhmm = now.toISOString().slice(11, 16); // "HH:MM" in UTC
      return hhmm >= windowStart && hhmm <= windowEnd;
    }

    (async () => {
      try {
        for (const lead of queued) {
          const [campaignCheck] = await drizzle
            .select({ status: schema.outboundCampaigns.status })
            .from(schema.outboundCampaigns)
            .where(eq(schema.outboundCampaigns.id, campaignId))
            .limit(1);

          if (!campaignCheck || campaignCheck.status !== 'running') {
            log.info("Campaign stopped by operator between leads", { campaignId });
            return;
          }

          while (!isWithinCallWindow()) {
            log.info("Campaign paused — outside call window", { campaignId, window: `${windowStart}-${windowEnd}` });
            await new Promise(resolve => setTimeout(resolve, CALL_WINDOW_CHECK_INTERVAL_MS));
            
            const [campaignStatus] = await drizzle
              .select({ status: schema.outboundCampaigns.status })
              .from(schema.outboundCampaigns)
              .where(eq(schema.outboundCampaigns.id, campaignId))
              .limit(1);

            if (!campaignStatus || campaignStatus.status !== 'running') {
              log.info("Campaign stopped during window wait", { campaignId });
              return;
            }
          }

          try {
            if (lead.customerNumber && await isDncBlocked(req.user.id, lead.customerNumber)) {
              log.warn("Campaign: lead skipped — DNC match", { leadId: lead.id });
              await drizzle
                .update(schema.outboundLeads)
                .set({ status: 'Blocked-DNC' })
                .where(eq(schema.outboundLeads.id, lead.id));
              await new Promise(resolve => setTimeout(resolve, CAMPAIGN_DIAL_SPACING_MS));
              continue;
            }

            const maxAttempts = campaign.maxAttempts || 3;
            if ((lead.attempts || 0) >= maxAttempts) {
              log.info("Campaign: lead max_attempts reached — skipping", { leadId: lead.id, attempts: lead.attempts });
              await drizzle
                .update(schema.outboundLeads)
                .set({ status: 'Max-Attempts' })
                .where(eq(schema.outboundLeads.id, lead.id));
              await new Promise(resolve => setTimeout(resolve, CAMPAIGN_DIAL_SPACING_MS));
              continue;
            }

            const result = await placeOutboundCall({
              userId: req.user.id,
              agentId: lead.agentId || campaign.agentId || undefined,
              customerName: lead.customerName,
              customerNumber: lead.customerNumber!,
              context: lead.context || undefined,
            });
            const newStatus = result.ok ? 'Dialing' : 'Failed';
            await drizzle
              .update(schema.outboundLeads)
              .set({ status: newStatus, lastCalledAt: new Date(), attempts: (lead.attempts || 0) + 1 })
              .where(eq(schema.outboundLeads.id, lead.id));
          } catch (e) {
            log.error("Campaign launch: lead dial failed", { leadId: lead.id, error: e instanceof Error ? e.message : String(e) });
            await drizzle
              .update(schema.outboundLeads)
              .set({ status: 'Failed', lastCalledAt: new Date() })
              .where(eq(schema.outboundLeads.id, lead.id));
          }
          await new Promise(resolve => setTimeout(resolve, CAMPAIGN_DIAL_SPACING_MS));
        }
        // Mark campaign complete when all leads have been attempted.
        await drizzle
          .update(schema.outboundCampaigns)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(and(eq(schema.outboundCampaigns.id, campaignId), eq(schema.outboundCampaigns.userId, req.user.id)));
      } catch (e: any) {
        log.error("Campaign launch loop failed", { campaignId, error: e?.message });
        await drizzle
          .update(schema.outboundCampaigns)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(and(eq(schema.outboundCampaigns.id, campaignId), eq(schema.outboundCampaigns.userId, req.user.id)));
      }
    })();
  } catch (error: any) {
    log.error("Campaign launch failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to launch campaign." });
  }
});

router.post("/api/campaigns/:id/retry-failed", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const campaignId = req.params.id;
    const [campaign] = await drizzle
      .select({ id: schema.outboundCampaigns.id, agentId: schema.outboundCampaigns.agentId, status: schema.outboundCampaigns.status })
      .from(schema.outboundCampaigns)
      .where(and(eq(schema.outboundCampaigns.id, campaignId), eq(schema.outboundCampaigns.userId, req.user.id)))
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found." });

    const failed = await drizzle
      .select({ id: schema.outboundLeads.id })
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.campaignId, campaignId),
          eq(schema.outboundLeads.userId, req.user.id),
          eq(schema.outboundLeads.status, 'Failed')
        )
      );

    if (!failed || failed.length === 0) {
      return res.status(400).json({ error: "No failed leads to retry." });
    }

    const failedIds = failed.map((l) => l.id);

    await drizzle
      .update(schema.outboundLeads)
      .set({ status: 'Queued', updatedAt: new Date() })
      .where(
        and(
          inArray(schema.outboundLeads.id, failedIds),
          eq(schema.outboundLeads.userId, req.user.id)
        )
      );

    res.json({ success: true, reset: failed.length });
  } catch (error: any) {
    log.error("Retry failed leads error", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to retry leads." });
  }
});

router.post("/api/campaigns/:id/stop", authenticateUser, claudeRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const campaignId = req.params.id;
    const [campaign] = await drizzle
      .select({ id: schema.outboundCampaigns.id, status: schema.outboundCampaigns.status })
      .from(schema.outboundCampaigns)
      .where(and(eq(schema.outboundCampaigns.id, campaignId), eq(schema.outboundCampaigns.userId, req.user.id)))
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (campaign.status !== 'running') {
      return res.status(409).json({ error: "Campaign is not currently running." });
    }
    
    await drizzle
      .update(schema.outboundCampaigns)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(and(eq(schema.outboundCampaigns.id, campaignId), eq(schema.outboundCampaigns.userId, req.user.id)));
      
    res.json({ success: true });
  } catch (error: any) {
    log.error("Campaign stop failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to stop campaign." });
  }
});

export default router;
