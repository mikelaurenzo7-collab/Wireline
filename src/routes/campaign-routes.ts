import { Router } from "express";

import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, sanitizeForAudit } from "../lib/server-utils";
import { parseFormData, CampaignCreateSchema, CampaignUpdateSchema } from "../lib/form-validators";
import { computeOutcomeBreakdown, computeCallStats, callIdsFromLeads } from "../lib/campaign-analytics";
import { SentryEvents } from "../lib/sentry-events";
import { claudeRateLimiter } from "../middleware/api-rate-limits";

const router = Router();

const CALL_WINDOW_CHECK_INTERVAL_MS = 30000;
const CAMPAIGN_DIAL_SPACING_MS = 2000;

// isDncBlocked and placeOutboundCall are imported lazily to avoid a circular
// module dependency. They are resolved at call time via dynamic require-style
// indirection — server.ts exports them and is the definitive implementation.
// We re-declare the signatures here for type safety.
type PlaceCallResult = { ok: boolean; status?: number; error?: string; callId?: string };

async function isDncBlocked(userId: string, phone: string): Promise<boolean> {
  // Lazy import — avoids circular dep with server.ts at module-load time.
  const srv = await import("../../server") as any;
  return srv.isDncBlocked(userId, phone);
}

async function placeOutboundCall(opts: {
  userId: string; agentId: string;
  customerName?: string | null; customerNumber: string; context?: string | null;
}): Promise<PlaceCallResult> {
  const srv = await import("../../server") as any;
  return srv.placeOutboundCall(opts);
}

router.get("/api/campaigns", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db
      .from('wireline_outbound_campaigns')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Pull lead counts via a single GROUP BY aggregation, then merge.
    const campaignIds = (data || []).map((c: any) => c.id);
    let leadStats: Record<string, { total: number; dialed: number; connected: number }> = {};
    if (campaignIds.length > 0) {
      const { data: allLeads } = await db
        .from('wireline_outbound_leads')
        .select('campaign_id, status')
        .in('campaign_id', campaignIds);

      for (const row of allLeads ?? []) {
        const s = leadStats[row.campaign_id] ?? { total: 0, dialed: 0, connected: 0 };
        s.total++;
        if (row.status !== 'Pending' && row.status !== 'Queued') s.dialed++;
        if (row.status === 'Completed') s.connected++;
        leadStats[row.campaign_id] = s;
      }
    }

    const enriched = (data || []).map((c: any) => {
      const s = leadStats[c.id] ?? { total: 0, dialed: 0, connected: 0 };
      return { ...c, leads_count: s.total, dialed_count: s.dialed, connected_count: s.connected };
    });

    res.json({ campaigns: enriched });
  } catch (error: any) {
    log.error("Failed to fetch campaigns", { error: getErrorMessage(error) });
    res.json({ campaigns: [] });
  }
});

router.post("/api/campaigns", authenticateUser, async (req: any, res: any) => {
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

    // SECURITY: same ownership check as the PATCH path — without it the
    // attacker could create a campaign that dials leads through another
    // user's agent (and bills against that user).
    if (agent_id) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', agent_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }

    const { data, error } = await db.from('wireline_outbound_campaigns').insert({
      user_id: req.user.id,
      name: name.trim(),
      goal: goal?.trim() || null,
      agent_id: agent_id || null,
      call_window_start: call_window_start || '09:00',
      call_window_end: call_window_end || '17:00',
      max_attempts: Number(max_attempts) || 3,
      status: 'draft',
    }).select().single();
    if (error) throw error;
    res.json({ campaign: data });
  } catch (error: any) {
    log.error("Failed to create campaign", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.patch("/api/campaigns/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const validation = parseFormData(CampaignUpdateSchema, {
      name: req.body.name,
      goal: req.body.goal,
      agent_id: req.body.agent_id,
      status: req.body.status,
      call_window_start: req.body.call_window_start,
      call_window_end: req.body.call_window_end,
      max_attempts: req.body.max_attempts,
    });
    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }

    // SECURITY: if reassigning the campaign to an agent, verify the
    // caller owns that agent — otherwise the campaign would dial leads
    // through (and bill against) another user's agent.
    if (validation.data?.agent_id) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', validation.data.agent_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }

    const allowed = ['name', 'goal', 'agent_id', 'status', 'call_window_start', 'call_window_end', 'max_attempts'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (validation.data?.[k as keyof typeof validation.data] !== undefined) updates[k] = validation.data[k as keyof typeof validation.data];
    const { data, error } = await db.from('wireline_outbound_campaigns')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select().single();
    if (error) throw error;
    res.json({ campaign: data });
  } catch (error: any) {
    log.error("Failed to update campaign", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

router.delete("/api/campaigns/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { error } = await db.from('wireline_outbound_campaigns')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to delete campaign", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

router.get("/api/campaigns/:id/leads", authenticateUser, async (req: any, res: any) => {
  try {
    // Bounded fetch: bulk endpoint accepts up to 5000 leads, so a campaign
    // can have many. Stream them in chunks instead of loading everything.
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 200 : limitRaw), 1000);
    const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);

    const { data, error, count } = await db.from('wireline_outbound_leads')
      .select('*', { count: 'exact' })
      .eq('campaign_id', req.params.id)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    res.json({
      leads: data || [],
      total: count || 0,
      hasMore: count ? (offset + limit) < count : false,
    });
  } catch (error: any) {
    log.error("Failed to fetch campaign leads", { error: getErrorMessage(error) });
    res.json({ leads: [] });
  }
});

router.get("/api/campaigns/:id/analytics", authenticateUser, async (req: any, res: any) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user.id;

    // Verify campaign ownership
    const { data: campaign } = await db
      .from('wireline_outbound_campaigns')
      .select('id, name, status, created_at')
      .eq('id', campaignId)
      .eq('user_id', userId)
      .single();
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    // Lead outcome breakdown
    const { data: leads } = await db
      .from('wireline_outbound_leads')
      .select('status, call_id')
      .eq('campaign_id', campaignId)
      .eq('user_id', userId);

    const leadRows = leads ?? [];
    const { total, outcomes } = computeOutcomeBreakdown(leadRows);

    // Pull call-level stats (duration, cost, lead_score) for enrichment.
    const callIds = callIdsFromLeads(leadRows);
    let call_stats = computeCallStats([]);
    if (callIds.length > 0) {
      const { data: callRows } = await db
        .from('wireline_call_logs')
        .select('duration_seconds, cost_usd, lead_score')
        .in('id', callIds)
        .eq('user_id', userId);
      call_stats = computeCallStats(callRows ?? []);
    }

    res.json({ campaign, total, outcomes, call_stats });
  } catch (e: any) {
    log.error("Campaign analytics failed", { error: e?.message });
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

router.post("/api/campaigns/:id/launch", authenticateUser, async (req: any, res: any) => {
  try {
    const campaignId = req.params.id;

    // Verify campaign belongs to user and is not already running.
    const { data: campaign, error: campErr } = await db
      .from('wireline_outbound_campaigns')
      .select('id, name, agent_id, status, call_window_start, call_window_end, max_attempts')
      .eq('id', campaignId)
      .eq('user_id', req.user.id)
      .single();
    if (campErr || !campaign) return res.status(404).json({ error: "Campaign not found." });
    if (campaign.status === 'running') return res.status(409).json({ error: "Campaign is already running." });

    // Fetch queued leads for this campaign.
    const { data: queued } = await db
      .from('wireline_outbound_leads')
      .select('id, customer_name, customer_number, context, agent_id, attempts')
      .eq('campaign_id', campaignId)
      .eq('user_id', req.user.id)
      .eq('status', 'Queued');

    if (!queued || queued.length === 0) {
      return res.status(400).json({ error: "No queued leads in this campaign." });
    }

    // Mark campaign as running.
    await db.from('wireline_outbound_campaigns')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('user_id', req.user.id);

    res.json({ success: true, dispatching: queued.length });

    // Fire-and-forget: dial sequentially with a configurable gap between calls
    // so the Vapi rate limiter is not hit. The entire async body is wrapped in
    // try/catch so a thrown error always marks the campaign completed/failed.
    const windowStart = campaign.call_window_start || '09:00';
    const windowEnd   = campaign.call_window_end   || '21:00';

    /** Returns true when the current UTC hour:minute falls within the operator's
     *  configured calling window. Both the window strings and the comparison use
     *  UTC HH:MM so behaviour is consistent regardless of server timezone.
     *  NOTE: campaigns are memory-volatile — if the server restarts while a loop
     *  is paused outside the window, the in-flight campaign will not auto-resume.
     *  Operators can re-launch the campaign from the UI; leads already marked
     *  'Dialing' will not be double-dialed (status guard prevents re-queue). */
    function isWithinCallWindow(): boolean {
      const now = new Date();
      const hhmm = now.toISOString().slice(11, 16); // "HH:MM" in UTC
      return hhmm >= windowStart && hhmm <= windowEnd;
    }

    (async () => {
      try {
        for (const lead of queued) {
          // Honor stop requests between leads — operator may have hit the Stop
          // button via POST /api/campaigns/:id/stop while the loop was running.
          const { data: campaignCheck } = await db.from('wireline_outbound_campaigns')
            .select('status').eq('id', campaignId).single();
          if (!campaignCheck || campaignCheck.status !== 'running') {
            log.info("Campaign stopped by operator between leads", { campaignId });
            return;
          }

          // Respect the operator's call window — pause until we're within it.
          // Check every 30s rather than calculating exact wait to keep the loop simple.
          while (!isWithinCallWindow()) {
            log.info("Campaign paused — outside call window", { campaignId, window: `${windowStart}-${windowEnd}` });
            await new Promise(resolve => setTimeout(resolve, CALL_WINDOW_CHECK_INTERVAL_MS));
            // Re-check campaign status in case it was cancelled during the wait
            const { data: campaignStatus } = await db.from('wireline_outbound_campaigns')
              .select('status').eq('id', campaignId).single();
            if (!campaignStatus || campaignStatus.status !== 'running') {
              log.info("Campaign stopped during window wait", { campaignId });
              return;
            }
          }

          try {
            // DNC compliance — skip leads whose number is on the Do Not Call list.
            if (lead.customer_number && await isDncBlocked(req.user.id, lead.customer_number)) {
              log.warn("Campaign: lead skipped — DNC match", { leadId: lead.id });
              await db.from('wireline_outbound_leads')
                .update({ status: 'Blocked-DNC' })
                .eq('id', lead.id);
              await new Promise(resolve => setTimeout(resolve, CAMPAIGN_DIAL_SPACING_MS));
              continue;
            }

            // Enforce max_attempts per lead
            const maxAttempts = campaign.max_attempts || 3;
            if ((lead.attempts || 0) >= maxAttempts) {
              log.info("Campaign: lead max_attempts reached — skipping", { leadId: lead.id, attempts: lead.attempts });
              await db.from('wireline_outbound_leads')
                .update({ status: 'Max-Attempts' })
                .eq('id', lead.id);
              await new Promise(resolve => setTimeout(resolve, CAMPAIGN_DIAL_SPACING_MS));
              continue;
            }

            const result = await placeOutboundCall({
              userId: req.user.id,
              agentId: lead.agent_id || campaign.agent_id,
              customerName: lead.customer_name,
              customerNumber: lead.customer_number,
              context: lead.context,
            });
            const newStatus = result.ok ? 'Dialing' : 'Failed';
            await db.from('wireline_outbound_leads')
              .update({ status: newStatus, last_called_at: new Date().toISOString(), attempts: (lead.attempts || 0) + 1 })
              .eq('id', lead.id);
          } catch (e) {
            log.error("Campaign launch: lead dial failed", { leadId: lead.id, error: (e as any)?.message });
            await db.from('wireline_outbound_leads')
              .update({ status: 'Failed', last_called_at: new Date().toISOString() })
              .eq('id', lead.id);
          }
          await new Promise(resolve => setTimeout(resolve, CAMPAIGN_DIAL_SPACING_MS));
        }
        // Mark campaign complete when all leads have been attempted.
        await db.from('wireline_outbound_campaigns')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', campaignId)
          .eq('user_id', req.user.id);
      } catch (e: any) {
        log.error("Campaign launch loop failed", { campaignId, error: e?.message });
        // Ensure campaign doesn't remain stuck in 'running'.
        await db.from('wireline_outbound_campaigns')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', campaignId)
          .eq('user_id', req.user.id);
      }
    })();
  } catch (error: any) {
    log.error("Campaign launch failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to launch campaign." });
  }
});

router.post("/api/campaigns/:id/retry-failed", authenticateUser, async (req: any, res: any) => {
  try {
    const campaignId = req.params.id;
    const { data: campaign } = await db
      .from('wireline_outbound_campaigns')
      .select('id, agent_id, status')
      .eq('id', campaignId)
      .eq('user_id', req.user.id)
      .single();
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });

    const { data: failed } = await db
      .from('wireline_outbound_leads')
      .select('id, customer_name, customer_number, context, agent_id')
      .eq('campaign_id', campaignId)
      .eq('user_id', req.user.id)
      .eq('status', 'Failed');

    if (!failed || failed.length === 0) {
      return res.status(400).json({ error: "No failed leads to retry." });
    }

    // Reset them to Queued so the launch endpoint can pick them up.
    await db.from('wireline_outbound_leads')
      .update({ status: 'Queued', updated_at: new Date().toISOString() })
      .in('id', failed.map((l: any) => l.id))
      .eq('user_id', req.user.id);

    res.json({ success: true, reset: failed.length });
  } catch (error: any) {
    log.error("Retry failed leads error", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to retry leads." });
  }
});

router.post("/api/campaigns/:id/stop", authenticateUser, claudeRateLimiter, async (req: any, res: any) => {
  try {
    const campaignId = req.params.id;
    const { data: campaign, error: campErr } = await db
      .from('wireline_outbound_campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .eq('user_id', req.user.id)
      .single();
    if (campErr || !campaign) return res.status(404).json({ error: "Campaign not found." });
    if (campaign.status !== 'running') {
      return res.status(409).json({ error: "Campaign is not currently running." });
    }
    const { error } = await db.from('wireline_outbound_campaigns')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    log.error("Campaign stop failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to stop campaign." });
  }
});

export default router;
