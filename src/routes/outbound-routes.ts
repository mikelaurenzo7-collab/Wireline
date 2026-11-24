/* eslint-disable @typescript-eslint/no-explicit-any -- tenant configuration columns and aggregated drizzle rows have shapes that vary by route. */
import { Router, Response } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import { validate } from "../middleware/input-validation";
import { AppError } from "../lib/api-error";
import { isDncBlocked } from "../lib/compliance";
import { parseFormData, OutboundBulkSchema } from "../lib/form-validators";
import { evaluateOutboundDialGate } from "../lib/outbound-dial-gate";
import {
  OUTBOUND_CALL_PURPOSES,
  outboundConsentMetadata,
  sanitizeUntrustedOutboundMetadata,
} from "../lib/outbound-call-purpose";
import { readContactOutboundRecord } from "../lib/outbound-contact-consent";
import { screenManualOutbound } from "../lib/outbound-manual-screening";
import {
  CALL_NEEDS_PERMISSION_MESSAGE,
  ONE_CALL_PER_DAY_MESSAGE,
} from "../lib/outbound-compliance-copy";
import { deriveRelationship } from "../lib/outbound-relationship";
import { readSalesDncAttestation } from "../lib/sales-dnc-attestation";
import { emitServerProductEventOnce } from "../lib/product-event-server";
import { SentryEvents } from "../lib/sentry-events";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import { placeOutboundCall } from "../lib/voice/outbound-call-service";
import { assertOutboundPlacementResolved } from "../lib/voice/outbound-placement-funding";
import {
  readNativeOutboundRequestReplay,
  readNativeOutboundRequestStatus,
  cancelMissingNativeOutboundRequest,
} from "../lib/voice/openai-outbound-placement";
import { outboundVoiceGuard } from "../lib/voice-spend-control";
import { phoneSuffixForLog } from "../lib/twilio-webhook-privacy";
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
      .where(
        and(
          eq(schema.outboundLeads.userId, req.user.id),
          sql`${schema.outboundLeads.source} IS DISTINCT FROM 'phone_test'`,
        ),
      );
    const count = Number(countResult.count);

    const data = await drizzle
      .select()
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.userId, req.user.id),
          sql`${schema.outboundLeads.source} IS DISTINCT FROM 'phone_test'`,
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
      const removed = await drizzle.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${req.user.id}))`);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${id}`}))`);
        const [lead] = await tx
          .select()
          .from(schema.outboundLeads)
          .where(
            and(
              eq(schema.outboundLeads.id, BigInt(id)),
              eq(schema.outboundLeads.userId, req.user.id),
            ),
          )
          .limit(1);
        await assertOutboundPlacementResolved(
          tx,
          req.user.id,
          (lead?.metadata as { native_voice?: { placement_id?: unknown } } | null)?.native_voice
            ?.placement_id,
        );
        return tx
          .delete(schema.outboundLeads)
          .where(
            and(
              eq(schema.outboundLeads.id, BigInt(id)),
              eq(schema.outboundLeads.userId, req.user.id),
              sql`${schema.outboundLeads.source} IS DISTINCT FROM 'phone_test'`,
            ),
          )
          .returning({ id: schema.outboundLeads.id });
      });
      if (!removed.length) throw AppError.notFound("Lead not found.");
      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
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
  permissionConfirmed: z.boolean().optional(),
  nonsalesConfirmed: z.boolean().optional(),
  customerSince: z.string().max(40).optional(),
  salesAttestationConfirmed: z.boolean().optional(),
  requestKey: z.string().uuid(),
  consentArtifactId: z.string().uuid().optional(),
  hasExpressWrittenConsent: z.boolean().optional().default(false),
  consentSource: z.enum(["web_form", "lead_import", "crm", "manual_attestation"]).optional(),
  consentLeadId: z.string().max(200).optional(),
});

router.get(
  "/api/outbound/dial/:requestKey",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(await readNativeOutboundRequestStatus(req.user.id, req.params.requestKey));
  },
);
router.post(
  "/api/outbound/dial/:requestKey/cancel-missing",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(await cancelMissingNativeOutboundRequest(req.user.id, req.params.requestKey));
  },
);

function suggestedOutboundPurpose(
  relationship: { kind: string } | null,
  lastPurpose: string | null,
): string {
  if (relationship && (!lastPurpose || lastPurpose === "sales")) return "returning_contact";
  if (lastPurpose && lastPurpose !== "callback") return lastPurpose;
  if (relationship) return "returning_contact";
  return "appointment_service";
}

router.get(
  "/api/outbound/contact-context",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const phone = typeof req.query.phone === "string" ? req.query.phone : "";
    if (!phone.trim()) {
      return res
        .status(400)
        .json({ code: "VALIDATION_ERROR", error: "A phone number is required." });
    }
    try {
      const [relationship, record, attestation, optedOut] = await Promise.all([
        deriveRelationship(req.user.id, phone),
        readContactOutboundRecord(req.user.id, phone),
        readSalesDncAttestation(req.user.id),
        isDncBlocked(req.user.id, phone),
      ]);
      res.json({
        relationship,
        lastPurpose: record.lastPurpose,
        permissionConfirmed: record.permissionConfirmed,
        nonsalesConfirmed: record.nonsalesConfirmed,
        customerSince: record.customerSince,
        suggestedPurpose: suggestedOutboundPurpose(relationship, record.lastPurpose),
        salesAttestationRecorded: Boolean(attestation),
        optedOut,
      });
    } catch (error) {
      log.warn("outbound contact context failed", { error: getErrorMessage(error) });
      res.status(503).json({
        code: "CONTACT_CONFIRMATION_UNAVAILABLE",
        error: "We couldn't check the saved permission for this number. Try again.",
      });
    }
  },
);

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
        consentSource,
        consentLeadId,
        requestKey,
        permissionConfirmed,
        nonsalesConfirmed,
        customerSince,
        salesAttestationConfirmed,
      } = req.body;
      const manual = await screenManualOutbound({
        userId: req.user.id,
        phone: customerNumber,
        channel: "call",
        requestedPurpose: callPurpose,
        permissionConfirmed,
        nonsalesConfirmed,
        customerSince,
        content: context,
        salesAttestationConfirmed,
        actorIp: req.ip,
        userAgent: typeof req.get === "function" ? req.get("user-agent") : null,
      });
      if (!manual.ok) {
        return res.status(manual.status).json({ code: manual.code, error: manual.error });
      }
      const screening = manual.screening;
      const effectiveCallPurpose = screening.callPurpose;
      const replay = await readNativeOutboundRequestReplay({
        userId: req.user.id,
        requestKey,
        agentId,
        customerNumber,
        customerName,
        context,
        callPurpose: effectiveCallPurpose,
      });
      if (replay) return res.status(replay.status).json(replay);

      const gate = await evaluateOutboundDialGate({
        userId: req.user.id,
        phone: customerNumber,
        isMarketingCall: screening.isMarketingCall,
        requireFederalDncScreening: screening.requireFederalDncScreening,
        salesScreening: screening.requireFederalDncScreening ? "one_off" : "bulk",
        hasExpressWrittenConsent: false,
        isRequestedCallback: false,
        metadata: { has_express_written_consent: false },
        audit: manual.audit,
      });
      if (!gate.allowed) {
        if (gate.reason === "federal_dnc_unconfigured") {
          return res.status(503).json({
            code: gate.federalDncCode || "FEDERAL_DNC_UNCONFIGURED",
            error: gate.federalDncMessage || gate.customerMessage,
          });
        }
        if (gate.reason === "sales_attestation_required") {
          return res.status(403).json({
            code: "SALES_ATTESTATION_REQUIRED",
            error: gate.customerMessage,
          });
        }
        if (gate.reason === "blocked_internal_dnc") {
          log.warn("Outbound dial blocked by DNC list", {
            phone: phoneSuffixForLog(customerNumber),
          });
          return res.status(403).json({
            code: "FORBIDDEN",
            error:
              gate.customerMessage ||
              "This person asked not to be contacted. We won't call or text them from this line.",
            dncBlocked: true,
          });
        }
        if (gate.reason === "blocked_tcpa") {
          const tcpa = gate.tcpaDecision;
          log.warn("Outbound dial blocked by TCPA consent gate", {
            phone: phoneSuffixForLog(customerNumber),
            abort_reason: tcpa?.abort_reason,
          });
          return res.status(403).json({
            code: "FORBIDDEN",
            error: gate.customerMessage || tcpa?.disclosure_script || CALL_NEEDS_PERMISSION_MESSAGE,
            tcpaBlocked: true,
            tcpa,
          });
        }
        if (gate.reason === "outside_permitted_calling_hours") {
          return res.status(403).json({
            code: "OUTSIDE_PERMITTED_CALLING_HOURS",
            error:
              gate.customerMessage ||
              "It's outside 8am to 8pm where they are. Try after 8am their time.",
            reason: gate.reason,
            calling_hours: gate.metadataPatch?.calling_hours,
          });
        }
        log.warn("Outbound dial blocked by duplicate guard", {
          phone: phoneSuffixForLog(customerNumber),
          reason: gate.reason,
        });
        return res.status(409).json({
          code: "DUPLICATE_DIAL_SUPPRESSED",
          error: gate.customerMessage || ONE_CALL_PER_DAY_MESSAGE,
          reason: gate.reason,
          status: gate.status,
        });
      }

      const consentMetadata = outboundConsentMetadata({
        callPurpose: effectiveCallPurpose,
        requestedCallPurpose: screening.requestedCallPurpose,
        hasExpressWrittenConsent: false,
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
        callPurpose: effectiveCallPurpose,
        leadMetadata: consentMetadata,
        requestKey,
      });
      if (!result.ok) {
        return res.status(result.status).json({
          code: result.providerOutcomeAmbiguous ? "OUTBOUND_CALL_OUTCOME_UNCERTAIN" : "ERROR",
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
        metadata: { source: "manual_dial", call_purpose: effectiveCallPurpose },
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

      // A request boolean is not auditable, per-recipient written-consent proof.
      // Until bulk imports resolve immutable server-owned artifacts, import the
      // leads as unconsented so the campaign dial gate fails closed.
      if (has_express_written_consent) {
        return res.status(400).json({
          code: "CONSENT_ARTIFACT_REQUIRED",
          error:
            "Bulk consent attestation is not accepted as proof. Attach a verified consent artifact to each recipient before marketing calls.",
        });
      }

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
          ...sanitizeUntrustedOutboundMetadata((lead.metadata as Record<string, unknown>) || {}),
          ...outboundConsentMetadata({
            callPurpose: "marketing_or_sales",
            hasExpressWrittenConsent: false,
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
