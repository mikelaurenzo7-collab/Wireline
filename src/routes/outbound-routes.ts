/* eslint-disable @typescript-eslint/no-explicit-any -- tenant configuration columns and aggregated drizzle rows have shapes that vary by route. */
import { Router, Response } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import { validate } from "../middleware/input-validation";
import { AppError } from "../lib/api-error";
import { stripCallbackRequestMarker } from "../lib/callback-engine";
import { parseFormData, OutboundBulkSchema } from "../lib/form-validators";
import { evaluateOutboundDialGate } from "../lib/outbound-dial-gate";
import {
  OUTBOUND_CALL_PURPOSES,
  isMarketingCallPurpose,
  normalizedExpressConsent,
  outboundConsentMetadata,
} from "../lib/outbound-call-purpose";
import { emitServerProductEventOnce } from "../lib/product-event-server";
import { SentryEvents } from "../lib/sentry-events";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import { placeOutboundCall } from "../lib/voice/outbound-call-service";
import { outboundVoiceGuard } from "../lib/voice-spend-control";
import type { AuthenticatedRequest } from "../types/auth";

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

    res.json({
      leads: mapObjectToSnake(data || []),
      total: count || 0,
      hasMore: offset + limit < count,
    });
  } catch (error: any) {
    log.error("GET /api/outbound failed", { error: getErrorMessage(error) });
    throw AppError.fromHttpStatus(500, "Failed to fetch leads");
  }
});

router.get("/api/callbacks", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await drizzle
      .select({
        id: schema.outboundLeads.id,
        customer_number: schema.outboundLeads.customerNumber,
        scheduled_at: schema.outboundLeads.callbackScheduledAt,
        notes: schema.outboundLeads.lastContactSummary,
        status: schema.outboundLeads.status,
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
  } catch (error: any) {
    log.error("GET /api/callbacks failed", { error: getErrorMessage(error) });
    throw AppError.fromHttpStatus(500, "Failed to load callbacks.");
  }
});

router.delete(
  "/api/outbound/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!/^\d+$/.test(id)) {
        return res.status(404).json({ code: "NOT_FOUND", error: "Lead not found." });
      }
      await drizzle
        .delete(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.id, BigInt(id)),
            eq(schema.outboundLeads.userId, req.user.id),
          ),
        );
      res.json({ success: true });
    } catch (error: any) {
      log.error("Failed to delete lead", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to delete lead.");
    }
  },
);

const dialSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
  customerNumber: z
    .string()
    .min(1, "customerNumber is required")
    .regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number format, expected E.164 (e.g. +15551234567)"),
  customerName: z.string().max(200).optional(),
  context: z.string().max(2000).optional(),
  callPurpose: z.enum(OUTBOUND_CALL_PURPOSES),
  hasExpressWrittenConsent: z.boolean().optional().default(false),
  consentSource: z.enum(["web_form", "lead_import", "crm", "manual_attestation"]).optional(),
  consentLeadId: z.string().max(200).optional(),
});

router.post(
  "/api/outbound/dial",
  authenticateUser,
  outboundVoiceGuard("manual"),
  validate({ body: dialSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        agentId,
        customerName,
        customerNumber,
        context,
        callPurpose,
        hasExpressWrittenConsent,
        consentSource,
        consentLeadId,
      } = req.body;
      const expressConsent = normalizedExpressConsent({ callPurpose, hasExpressWrittenConsent });
      const marketing = isMarketingCallPurpose(callPurpose);

      if (marketing && expressConsent && !consentSource && !consentLeadId) {
        return res.status(400).json({
          code: "CONSENT_ARTIFACT_REQUIRED",
          error:
            "Marketing calls with express written consent require consentSource or consentLeadId for auditability.",
        });
      }

      const gate = await evaluateOutboundDialGate({
        userId: req.user.id,
        phone: customerNumber,
        isMarketingCall: marketing,
        hasExpressWrittenConsent: expressConsent,
        metadata: { has_express_written_consent: expressConsent },
      });
      if (!gate.allowed) {
        if (gate.reason === "federal_dnc_unconfigured") {
          return res.status(503).json({
            code: gate.federalDncCode || "FEDERAL_DNC_UNCONFIGURED",
            error: gate.federalDncMessage || "Federal DNC is not configured for marketing dials.",
          });
        }
        if (gate.reason === "blocked_internal_dnc") {
          log.warn("Outbound dial blocked by DNC list", { customerNumber });
          return res.status(403).json({
            code: "FORBIDDEN",
            error: "This number is on the Do Not Call list and cannot be dialed.",
            dncBlocked: true,
          });
        }
        if (gate.reason === "blocked_tcpa") {
          const tcpa = gate.tcpaDecision;
          log.warn("Outbound dial blocked by TCPA consent gate", {
            customerNumber,
            abort_reason: tcpa?.abort_reason,
          });
          return res.status(403).json({
            code: "FORBIDDEN",
            error: tcpa?.disclosure_script || "Call blocked by TCPA consent rules.",
            tcpaBlocked: true,
            tcpa,
          });
        }
        log.warn("Outbound dial blocked by duplicate guard", {
          customerNumber,
          reason: gate.reason,
        });
        return res.status(409).json({
          code: "DUPLICATE_DIAL_SUPPRESSED",
          error:
            "This number was already dialed in the last 24 hours. Wait before dialing again, or schedule a callback.",
          reason: gate.reason,
          status: gate.status,
        });
      }

      const consentMetadata = outboundConsentMetadata({
        callPurpose,
        hasExpressWrittenConsent,
        source: "web",
        consentSource,
        consentLeadId,
      });
      const result = await placeOutboundCall({
        userId: req.user.id,
        agentId,
        customerName,
        customerNumber,
        context,
        callPurpose,
        leadMetadata: consentMetadata,
      });
      if (!result.ok) {
        return res.status(result.status).json({
          code: result.providerOutcomeAmbiguous
            ? "OUTBOUND_CALL_OUTCOME_UNCERTAIN"
            : "ERROR",
          error: result.error,
          doNotRetry: result.doNotRetry === true,
          leadId: result.leadId ?? null,
        });
      }

      SentryEvents.outboundDialStarted({ lead_count: 1, agent_id: agentId });
      emitServerProductEventOnce({
        event: "lead_source_added",
        userId: req.user.id,
        agentId,
        audience: "sales",
        metadata: { source: "manual_dial", call_purpose: callPurpose },
      });
      if (consentSource) {
        emitServerProductEventOnce({
          event: "consent_source_captured",
          userId: req.user.id,
          agentId,
          audience: "sales",
          metadata: { consent_source: consentSource, consent_lead_id: consentLeadId ?? null },
        });
      }

      res.json({ success: true, callId: result.callId, leadId: result.leadId });
    } catch (error: any) {
      log.error("Outbound call failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to dispatch call.");
    }
  },
);

router.post(
  "/api/outbound/bulk",
  authenticateUser,
  // Import only. Dialing remains in the paced campaign/cadence workers so a
  // single request cannot create an unbounded fan-out of carrier calls.
  outboundVoiceGuard("bulk_import"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validation = parseFormData(OutboundBulkSchema, {
        leads: req.body.leads,
        campaign_id: req.body.campaign_id,
        has_express_written_consent: req.body.has_express_written_consent,
      });
      if (!validation.success) {
        return res.status(400).json({
          code: "BAD_REQUEST",
          error: "Validation failed",
          errors: validation.errors,
        });
      }
      const { leads, campaign_id, has_express_written_consent } = validation.data!;

      const [userSettings] = await drizzle
        .select({ subscriptionStatus: schema.settings.subscriptionStatus })
        .from(schema.settings)
        .where(eq(schema.settings.userId, req.user.id))
        .limit(1);
      if (userSettings?.subscriptionStatus !== "active") {
        throw AppError.fromHttpStatus(403, "Access Denied: Inactive billing plan.");
      }

      const suppliedAgentIds = [
        ...new Set((leads || []).map((lead: any) => lead.agent_id).filter(Boolean)),
      ];
      if (suppliedAgentIds.length > 0) {
        const ownedAgents = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(
            and(eq(schema.agents.userId, req.user.id), inArray(schema.agents.id, suppliedAgentIds)),
          );
        if (ownedAgents.length !== suppliedAgentIds.length) {
          throw AppError.fromHttpStatus(
            403,
            "One or more supplied agents do not belong to this tenant.",
          );
        }
      }

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
        if (!ownedCampaign) throw AppError.fromHttpStatus(404, "Campaign not found");
      }

      const leadsWithUser = (leads || []).map((lead: any) => ({
        userId: req.user.id,
        agentId: lead.agent_id,
        customerName: lead.customer_name,
        customerNumber: lead.customer_number || lead.phone_number,
        phoneNumber: lead.phone_number || lead.customer_number,
        context: lead.context,
        campaignId: campaign_id || null,
        status: campaign_id ? "Queued" : "Pending",
        metadata: {
          ...stripCallbackRequestMarker((lead.metadata as Record<string, unknown>) || {}),
          ...outboundConsentMetadata({
            callPurpose: "marketing_or_sales",
            hasExpressWrittenConsent: !!has_express_written_consent,
            source: "bulk",
          }),
        },
      }));

      const insertedLeads = await drizzle
        .insert(schema.outboundLeads)
        .values(leadsWithUser)
        .returning({ id: schema.outboundLeads.id });

      if (insertedLeads.length > 0) {
        const [agent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(eq(schema.agents.userId, req.user.id))
          .limit(1);

        SentryEvents.outboundLeadsImported({
          lead_count: insertedLeads.length,
          agent_id: agent?.id || "unknown",
        });
        emitServerProductEventOnce({
          event: "lead_source_added",
          userId: req.user.id,
          agentId: agent?.id,
          audience: "sales",
          metadata: {
            source: "bulk_import",
            lead_count: insertedLeads.length,
            campaign_id: campaign_id ?? null,
          },
        });
        if (has_express_written_consent) {
          emitServerProductEventOnce({
            event: "consent_source_captured",
            userId: req.user.id,
            agentId: agent?.id,
            audience: "sales",
            metadata: { consent_source: "lead_import", campaign_id: campaign_id ?? null },
          });
        }
      }

      res.json({ success: true, inserted: insertedLeads.length });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      log.error("POST /api/outbound/bulk failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to import leads");
    }
  },
);

export default router;
