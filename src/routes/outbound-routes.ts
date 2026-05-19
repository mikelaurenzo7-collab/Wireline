import { Router, Request, Response, NextFunction } from "express";
import { log, quotaTracker, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, desc, isNotNull } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import { parseFormData } from "../lib/form-validators";
import { OutboundBulkSchema } from "../lib/form-validators";
import { enforceSpendCap, enforce24hSpendCap } from "../lib/spend-guards";
import { isDncBlocked } from "../lib/compliance";
import { evaluateOutboundConsent } from "../lib/tcpa-consent";
import { quotaRejectionHeaders } from "../lib/tenant-quotas";
import { placeOutboundCall } from "../lib/vapi-client";
import { SentryEvents } from "../lib/sentry-events";
import { claudeRateLimiter, dialRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

interface OutboundLead {
  agent_id?: string;
  customer_name?: string;
  customer_number?: string;
  phone_number?: string;
  context?: string;
}

const router = Router();

router.get("/api/outbound", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 100 : limitRaw), 500);
    const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);

    const [countResult] = await drizzle
      .select({ count: sql`count(*)` })
      .from(schema.outboundLeads)
      .where(eq(schema.outboundLeads.userId, req.user.id));

    const count = Number(countResult.count);

    const data = await drizzle
      .select()
      .from(schema.outboundLeads)
      .where(eq(schema.outboundLeads.userId, req.user.id))
      .orderBy(desc(schema.outboundLeads.createdAt))
      .limit(limit)
      .offset(offset);

    // The SPA reads snake_case (lead.customer_name, etc.) but Drizzle hands
    // us camelCase. Normalize at the boundary so the queue panel actually
    // shows the customer's name instead of falling back to "Unknown subject".
    res.json({
      leads: mapObjectToSnake(data || []),
      total: count || 0,
      hasMore: offset + limit < count,
    });
  } catch (error: any) {
    log.error("GET /api/outbound failed", { error: error.message });
    res.json({ leads: [], total: 0, hasMore: false });
  }
});

// Returns upcoming scheduled callbacks for the operator dashboard.
// Sorted by soonest first, capped at 50 for display purposes.
// Rate-limited to 30 req/min per user to prevent scraping.
router.get(
  "/api/callbacks",
  claudeRateLimiter,
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await drizzle
        .select({
          id: schema.outboundLeads.id,
          customer_name: schema.outboundLeads.customerName,
          customer_number: schema.outboundLeads.customerNumber,
          callback_scheduled_at: schema.outboundLeads.callbackScheduledAt,
          last_contact_summary: schema.outboundLeads.lastContactSummary,
          agent_id: schema.outboundLeads.agentId,
          attempts: schema.outboundLeads.attempts,
        })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.userId, req.user.id),
            eq(schema.outboundLeads.status, "Callback-Scheduled"),
            isNotNull(schema.outboundLeads.callbackScheduledAt),
          ),
        )
        .orderBy(schema.outboundLeads.callbackScheduledAt)
        .limit(50);

      res.json({ callbacks: data || [] });
    } catch (e: any) {
      log.error("GET /api/callbacks failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to load callbacks." });
    }
  },
);

router.delete(
  "/api/outbound/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await drizzle
        .delete(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.id, BigInt(req.params.id)),
            eq(schema.outboundLeads.userId, req.user.id),
          ),
        );
      res.json({ success: true });
    } catch (error: any) {
      log.error("Failed to delete lead", { error: getErrorMessage(error) });
      res.status(500).json({ error: "Failed to delete lead." });
    }
  },
);

router.post(
  "/api/outbound/dial",
  authenticateUser,
  // Pre-call spend gate — return 402 BEFORE we kick a Vapi call (which
  // bills per-minute) when the tenant has hit their monthly hard cap
  // or the platform's 24h Claude budget. Previously these guards were
  // mounted only on /api/insights/* — meaning a runaway outbound dial
  // could rack up unlimited Vapi/Anthropic spend without hitting the
  // brakes. Adding both layers (per-tenant monthly + platform daily)
  // closes that gap.
  enforce24hSpendCap,
  enforceSpendCap,
  dialRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { agentId, customerName, customerNumber, context } = req.body;
      if (!agentId || !customerNumber) {
        return res.status(400).json({ error: "agentId and customerNumber are required." });
      }

      // DNC compliance check — block calls to numbers on the Do Not Call list.
      if (await isDncBlocked(req.user.id, customerNumber)) {
        log.warn("Outbound dial blocked by DNC list", { customerNumber });
        return res.status(403).json({
          error: "This number is on the Do Not Call list and cannot be dialed.",
          dncBlocked: true,
        });
      }

      // TCPA pre-call consent gate.
      const tcpaDecision = evaluateOutboundConsent({
        phone: customerNumber,
        is_internal_dnc: false, // already checked above
        is_marketing_call: true,
        has_express_written_consent: false,
      });
      if (!tcpaDecision.allowed) {
        log.warn("Outbound dial blocked by TCPA consent gate", {
          customerNumber,
          abort_reason: tcpaDecision.abort_reason,
        });
        return res.status(403).json({
          error: tcpaDecision.disclosure_script || "Call blocked by TCPA consent rules.",
          tcpaBlocked: true,
          tcpa: tcpaDecision,
        });
      }

      // Per-tenant voice-minute quota check.
      const quotaDecision = await quotaTracker.checkAndIncrement(
        req.user.id,
        "voice_minutes_daily",
        0,
      );
      if (!quotaDecision.allowed) {
        Object.entries(quotaRejectionHeaders(quotaDecision)).forEach(([k, v]) =>
          res.setHeader(k, v),
        );
        return res.status(429).json({
          error: "Daily voice-minute quota exceeded.",
          code: "QUOTA_VOICE",
          quota: quotaDecision,
        });
      }

      const result = await placeOutboundCall({
        userId: req.user.id,
        agentId,
        customerName,
        customerNumber,
        context,
      });
      if (!result.ok) return res.status(result.status).json({ error: result.error });

      await drizzle.insert(schema.outboundLeads).values({
        userId: req.user.id,
        agentId: agentId,
        customerName: customerName,
        customerNumber: customerNumber,
        context: context,
        callId: result.callId,
        status: "Dialing",
      });

      SentryEvents.outboundDialStarted({
        lead_count: 1,
        agent_id: agentId,
      });

      res.json({ success: true, callId: result.callId });
    } catch (error: any) {
      log.error("Outbound call failed", { error: getErrorMessage(error) });
      // Don't leak the raw error message; log full server-side, return safe message to client.
      res.status(500).json({ error: "Failed to dispatch call." });
    }
  },
);

router.post(
  "/api/outbound/bulk",
  authenticateUser,
  // Same spend gate as /api/outbound/dial. Bulk endpoint is the
  // single highest-risk surface for runaway spend — a CSV with 1k
  // rows triggers 1k Vapi calls. Block at the door, not after we're
  // 200 calls into a burned card.
  enforce24hSpendCap,
  enforceSpendCap,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validation = parseFormData(OutboundBulkSchema, {
        leads: req.body.leads,
        campaign_id: req.body.campaign_id,
      });
      if (!validation.success) {
        return res.status(400).json({ error: "Validation failed", errors: validation.errors });
      }
      const { leads, campaign_id } = validation.data!;

      // SECURITY ENFORCEMENT
      const [userSettings] = await drizzle
        .select({ subscriptionStatus: schema.settings.subscriptionStatus })
        .from(schema.settings)
        .where(eq(schema.settings.userId, req.user.id))
        .limit(1);

      if (userSettings?.subscriptionStatus !== "active") {
        return res.status(403).json({ error: "Access Denied: Inactive billing plan." });
      }

      // Verify campaign_id (when supplied) belongs to the caller.
      if (campaign_id) {
        const [ownedCampaign] = await drizzle
          .select({ id: schema.outboundCampaigns.id })
          .from(schema.outboundCampaigns)
          .where(
            and(
              eq(schema.outboundCampaigns.id, campaign_id),
              eq(schema.outboundCampaigns.userId, req.user.id),
            ),
          )
          .limit(1);
        if (!ownedCampaign) return res.status(404).json({ error: "Campaign not found" });
      }

      const leadsWithUser = (leads || []).map((lead: any) => ({
        userId: req.user.id,
        agentId: lead.agent_id,
        customerName: lead.customer_name,
        customerNumber: lead.customer_number || lead.phone_number,
        phoneNumber: lead.phone_number || lead.customer_number,
        context: lead.context,
        campaignId: campaign_id || null,
      }));

      const insertedLeads = await drizzle
        .insert(schema.outboundLeads)
        .values(leadsWithUser)
        .returning({ id: schema.outboundLeads.id });

      // Track bulk campaign start
      if (insertedLeads.length > 0) {
        const [agent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(eq(schema.agents.userId, req.user.id))
          .limit(1);

        SentryEvents.outboundDialStarted({
          lead_count: insertedLeads.length,
          agent_id: agent?.id || "unknown",
        });
      }

      res.json({ success: true, inserted: insertedLeads.length });
    } catch {
      res.status(500).json({ error: "Failed to queue leads" });
    }
  },
);

export default router;
