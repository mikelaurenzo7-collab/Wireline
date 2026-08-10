/* eslint-disable @typescript-eslint/no-explicit-any -- tenant configuration columns and aggregated drizzle rows have shapes that vary by route. */
import { Router, Response } from "express";
import { AppError } from "../lib/api-error";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, desc, isNotNull, inArray } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import { parseFormData } from "../lib/form-validators";
import { OutboundBulkSchema } from "../lib/form-validators";
import { outboundVoiceGuard } from "../lib/voice-spend-control";
import { stripCallbackRequestMarker } from "../lib/callback-engine";
import {
  OUTBOUND_CALL_PURPOSES,
  isMarketingCallPurpose,
  normalizedExpressConsent,
  outboundConsentMetadata,
} from "../lib/outbound-call-purpose";
import { evaluateOutboundDialGate } from "../lib/outbound-dial-gate";
import { placeOutboundCall } from "../lib/vapi-client";
import { SentryEvents } from "../lib/sentry-events";
import { emitServerProductEventOnce } from "../lib/product-event-server";
import { validate } from "../middleware/input-validation";
import { z } from "zod";
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

    // The SPA reads snake_case (lead.customer_name, etc.) but Drizzle hands
    // us camelCase. Normalize at the boundary so the queue panel actually
    // shows the customer's name instead of falling back to "Unknown subject".
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

// Returns upcoming scheduled callbacks for the Account Holder dashboard.
// Sorted by soonest first, capped at 50 for display purposes.
// Kept as an authenticated dashboard read so missing AI/runtime limiter
// infrastructure cannot blank the Phone callbacks tab.
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
  } catch (e: any) {
    log.error("GET /api/callbacks failed", { error: getErrorMessage(e) });
    throw AppError.fromHttpStatus(500, "Failed to load callbacks.");
  }
});

router.delete(
  "/api/outbound/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      // outboundLeads.id is a bigint — reject non-numeric ids before BigInt()
      // throws (which would surface as a 500 instead of a clean not-found).
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
    // Accept E.164 (+1XXXXXXXXXX) or common US formats (10-15 digits)
    .regex(
      /^\+?[1-9]\d{6,14}$/,
      "Invalid phone number format — expected E.164 (e.g. +15551234567)",
    ),
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
  // Trial gate FIRST so the upgrade-required path takes priority
  // over the generic spend-cap path. Trial-expired tenants see a
  // pick-a-plan modal; tenants over their monthly hard-cap see the
  // standard spend-limit message. Both are 402 but with distinct
  // code values for the frontend.
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

      const result = await placeOutboundCall({
        userId: req.user.id,
        agentId,
        customerName,
        customerNumber,
        context,
        callPurpose,
      });
      if (!result.ok)
        return res.status(result.status).json({
          code: "ERROR",
          error: result.error,
        });

      await drizzle.insert(schema.outboundLeads).values({
        userId: req.user.id,
        agentId: agentId,
        customerName: customerName,
        customerNumber: customerNumber,
        context: context,
        callId: result.callId,
        status: "Dialing",
        attempts: 1,
        lastCalledAt: new Date(),
        metadata: outboundConsentMetadata({
          callPurpose,
          hasExpressWrittenConsent,
          source: "web",
          consentSource,
          consentLeadId,
        }),
      });

      SentryEvents.outboundDialStarted({
        lead_count: 1,
        agent_id: agentId,
      });

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

      res.json({ success: true, callId: result.callId });
    } catch (error: any) {
      log.error("Outbound call failed", { error: getErrorMessage(error) });
      // Don't leak the raw error message; log full server-side, return safe message to client.
      throw AppError.fromHttpStatus(500, "Failed to dispatch call.");
    }
  },
);

router.post(
  "/api/outbound/bulk",
  authenticateUser,
  // Same gate stack as /api/outbound/dial. Trial gate FIRST so the
  // upgrade-required code path takes priority. Bulk is the single
  // highest-risk surface for runaway spend — a CSV with 1k rows
  // triggers 1k Vapi calls without the full launch/spend/rate gate.
  // NOTE: this endpoint is currently import-only: it stores lead rows and
  // does not place calls or enqueue dialing jobs. Keep UI/API copy aligned
  // until a separately controlled bulk-dial worker is introduced.
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

      // SECURITY ENFORCEMENT
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
        // Campaign-bound imports are launch-ready; standalone imports stay Pending.
        status: campaign_id ? "Queued" : "Pending",
        // Imported metadata is stored verbatim, so the callback-request marker
        // must be stripped here exactly as intake strips it: it claims a
        // consumer asked to be called back — which waives express written
        // consent and drops the opt-out announcement — and only a live call
        // may mint that. `has_express_written_consent` stays the deliberate
        // attestation channel; the dial remains marketing-classed either way.
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

      // Track bulk campaign start
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
    } catch (err: any) {
      // Preserve intentional 403/404s (inactive plan, agent/campaign ownership)
      // instead of masking them as a generic 500.
      if (err instanceof AppError) throw err;
      log.error("POST /api/outbound/bulk failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to import leads");
    }
  },
);

export default router;
