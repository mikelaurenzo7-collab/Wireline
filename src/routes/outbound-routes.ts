/* eslint-disable @typescript-eslint/no-explicit-any -- tenant configuration columns and aggregated drizzle rows have shapes that vary by route. */
import { Router, Response } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import { validate } from "../middleware/input-validation";
import { AppError } from "../lib/api-error";
import { parseFormData, OutboundBulkSchema } from "../lib/form-validators";
import { evaluateOutboundDialGate } from "../lib/outbound-dial-gate";
import {
  OUTBOUND_CALL_PURPOSES,
  outboundConsentMetadata,
  sanitizeUntrustedOutboundMetadata,
  screenedDirectOutboundCall,
} from "../lib/outbound-call-purpose";
import { emitServerProductEventOnce } from "../lib/product-event-server";
import { SentryEvents } from "../lib/sentry-events";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage, mapObjectToSnake, parseBigIntId, toJsonbSafe } from "../lib/server-utils";
import { placeOutboundCall } from "../lib/voice/outbound-call-service";
import { assertOutboundPlacementResolved } from "../lib/voice/outbound-placement-funding";
import {
  readNativeOutboundRequestReplay,
  readNativeOutboundRequestStatus,
  cancelMissingNativeOutboundRequest,
} from "../lib/voice/openai-outbound-placement";
import { outboundVoiceGuard } from "../lib/voice-spend-control";
import { LEAD_STATUS } from "../lib/outbound-status";
import { campaignWriteRateLimit } from "../middleware/api-rate-limits";
import { phoneSuffixForLog } from "../lib/twilio-webhook-privacy";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const LeadHuntIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,18}$/, "Lead IDs must be positive integers")
  .refine((value) => {
    const parsed = parseBigIntId(value);
    // Let the regex own malformed values. Zod still runs refinements after a
    // regex issue, so calling the BigInt constructor here turned bad client input into a
    // server exception instead of a normal validation response.
    return parsed === null || parsed <= POSTGRES_BIGINT_MAX;
  }, "Lead ID is out of range");

const LeadHuntApprovalSchema = z
  .object({
    lead_ids: z
      .array(LeadHuntIdSchema)
      .min(1, "Select at least one lead")
      .max(100, "Approve at most 100 leads at a time"),
    campaign_id: z.string().uuid("Invalid campaign ID"),
    agent_id: z.string().min(1, "Select a Bot").max(128, "Invalid Bot ID"),
    review_approved: z.literal(true),
  })
  .strict();

router.get(
  "/api/lead-hunt/leads",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rows = await drizzle
        .select({
          id: schema.outboundLeads.id,
          customerName: schema.outboundLeads.customerName,
          customerNumber: schema.outboundLeads.customerNumber,
          status: schema.outboundLeads.status,
          metadata: schema.outboundLeads.metadata,
          createdAt: schema.outboundLeads.createdAt,
        })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.userId, req.user.id),
            eq(schema.outboundLeads.source, "apollo"),
            isNull(schema.outboundLeads.campaignId),
            inArray(schema.outboundLeads.status, [LEAD_STATUS.PENDING, "New"]),
            isNotNull(schema.outboundLeads.customerNumber),
          ),
        )
        .orderBy(desc(schema.outboundLeads.createdAt))
        .limit(100);

      const leads = rows.map((row) => {
        const metadata =
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, any>)
            : {};
        const details =
          metadata.lead_hunt && typeof metadata.lead_hunt === "object"
            ? (metadata.lead_hunt as Record<string, any>)
            : {};
        return {
          id: String(row.id),
          customer_name: row.customerName,
          customer_number: row.customerNumber,
          status: row.status,
          title: typeof details.title === "string" ? details.title : null,
          company: typeof details.company === "string" ? details.company : null,
          phone_source:
            details.phone_source === "person" || details.phone_source === "organization"
              ? details.phone_source
              : null,
          city: typeof details.city === "string" ? details.city : null,
          state: typeof details.state === "string" ? details.state : null,
          created_at: row.createdAt,
        };
      });

      res.json({ leads, total: leads.length });
    } catch (error: any) {
      log.error("GET /api/lead-hunt/leads failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to load Lead Hunt results.");
    }
  },
);

router.delete(
  "/api/lead-hunt/leads/:id",
  authenticateUser,
  campaignWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsedId = LeadHuntIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(404).json({ code: "NOT_FOUND", error: "Lead Hunt result not found." });
    }

    try {
      const removed = await drizzle.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${req.user.id}))`);
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${parsedId.data}`}))`,
        );
        const [lead] = await tx
          .select()
          .from(schema.outboundLeads)
          .where(
            and(
              eq(schema.outboundLeads.id, BigInt(parsedId.data)),
              eq(schema.outboundLeads.userId, req.user.id),
            ),
          )
          .limit(1);
        const voice = (lead?.metadata as { native_voice?: { placement_id?: unknown } } | null)
          ?.native_voice;
        await assertOutboundPlacementResolved(tx, req.user.id, voice?.placement_id);
        return tx
          .delete(schema.outboundLeads)
          .where(
            and(
              eq(schema.outboundLeads.id, BigInt(parsedId.data)),
              eq(schema.outboundLeads.userId, req.user.id),
              eq(schema.outboundLeads.source, "apollo"),
              isNull(schema.outboundLeads.campaignId),
              inArray(schema.outboundLeads.status, [LEAD_STATUS.PENDING, "New"]),
            ),
          )
          .returning({ id: schema.outboundLeads.id });
      });

      if (removed.length !== 1) {
        return res.status(409).json({
          code: "LEAD_HUNT_RESULT_CHANGED",
          error: "This lead is no longer awaiting review. Refresh Lead Hunt and try again.",
        });
      }

      res.json({ success: true, id: parsedId.data });
    } catch (error: any) {
      log.error("DELETE /api/lead-hunt/leads/:id failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to remove Lead Hunt result.");
    }
  },
);

router.post(
  "/api/lead-hunt/approve",
  authenticateUser,
  campaignWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = LeadHuntApprovalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: "BAD_REQUEST",
        error: parsed.error.issues[0]?.message || "Invalid Lead Hunt approval.",
      });
    }

    const { campaign_id, agent_id } = parsed.data;
    const leadIds = [...new Set(parsed.data.lead_ids)].map((id) => BigInt(id));

    try {
      const assigned = await drizzle.transaction(async (tx) => {
        const [campaign] = await tx
          .select({
            id: schema.outboundCampaigns.id,
            status: schema.outboundCampaigns.status,
            agentId: schema.outboundCampaigns.agentId,
          })
          .from(schema.outboundCampaigns)
          .where(
            and(
              eq(schema.outboundCampaigns.id, campaign_id),
              eq(schema.outboundCampaigns.userId, req.user.id),
            ),
          )
          .limit(1);
        if (!campaign) throw AppError.fromHttpStatus(404, "Campaign not found.");
        if (campaign.status !== "draft") {
          throw AppError.fromHttpStatus(
            409,
            "Lead Hunt results can only be assigned to a draft campaign.",
          );
        }
        if (campaign.agentId && campaign.agentId !== agent_id) {
          throw AppError.fromHttpStatus(
            409,
            "This draft already uses a different Bot. Select that Bot or choose another draft.",
          );
        }

        const [agent] = await tx
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agent_id), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        if (!agent) throw AppError.fromHttpStatus(404, "Bot not found.");

        const eligible = await tx
          .select({ id: schema.outboundLeads.id, metadata: schema.outboundLeads.metadata })
          .from(schema.outboundLeads)
          .where(
            and(
              eq(schema.outboundLeads.userId, req.user.id),
              eq(schema.outboundLeads.source, "apollo"),
              isNull(schema.outboundLeads.campaignId),
              inArray(schema.outboundLeads.status, [LEAD_STATUS.PENDING, "New"]),
              isNotNull(schema.outboundLeads.customerNumber),
              inArray(schema.outboundLeads.id, leadIds),
            ),
          );
        if (eligible.length !== leadIds.length) {
          throw AppError.fromHttpStatus(
            409,
            "One or more leads are no longer awaiting review. Refresh Lead Hunt and try again.",
          );
        }

        const reviewedAt = new Date().toISOString();
        for (const lead of eligible) {
          const metadata =
            lead.metadata && typeof lead.metadata === "object"
              ? (lead.metadata as Record<string, any>)
              : {};
          const leadHunt =
            metadata.lead_hunt && typeof metadata.lead_hunt === "object"
              ? (metadata.lead_hunt as Record<string, any>)
              : {};
          const updated = await tx
            .update(schema.outboundLeads)
            .set({
              agentId: agent_id,
              campaignId: campaign_id,
              // Reviewed records may enter the campaign queue, but the dialer
              // still requires the campaign's separate guarded Launch action.
              // Queuing here also prevents a concurrent launch from missing a
              // just-approved Pending row between its promote and transition.
              status: LEAD_STATUS.QUEUED,
              metadata: toJsonbSafe({
                ...metadata,
                lead_hunt: {
                  ...leadHunt,
                  review_status: "approved",
                  reviewed_at: reviewedAt,
                  campaign_id,
                  agent_id,
                },
              }) as any,
            })
            .where(
              and(
                eq(schema.outboundLeads.id, lead.id),
                eq(schema.outboundLeads.userId, req.user.id),
                isNull(schema.outboundLeads.campaignId),
              ),
            )
            .returning({ id: schema.outboundLeads.id });
          if (updated.length !== 1) {
            throw AppError.fromHttpStatus(
              409,
              "A lead changed while it was being approved. Refresh Lead Hunt and try again.",
            );
          }
        }

        const updatedCampaign = await tx
          .update(schema.outboundCampaigns)
          .set({ agentId: agent_id, updatedAt: new Date() })
          .where(
            and(
              eq(schema.outboundCampaigns.id, campaign_id),
              eq(schema.outboundCampaigns.userId, req.user.id),
              eq(schema.outboundCampaigns.status, "draft"),
              or(
                isNull(schema.outboundCampaigns.agentId),
                eq(schema.outboundCampaigns.agentId, agent_id),
              ),
            ),
          )
          .returning({ id: schema.outboundCampaigns.id });
        if (updatedCampaign.length !== 1) {
          throw AppError.fromHttpStatus(
            409,
            "The campaign changed while leads were being approved. Refresh and try again.",
          );
        }

        return eligible.length;
      });

      res.json({ success: true, assigned, campaign_id, agent_id, status: "Queued" });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      log.error("POST /api/lead-hunt/approve failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to approve Lead Hunt results.");
    }
  },
);

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
      } = req.body;
      const screening = screenedDirectOutboundCall(callPurpose);
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
        hasExpressWrittenConsent: screening.hasExpressWrittenConsent,
        isRequestedCallback: screening.isRequestedCallback,
        metadata: { has_express_written_consent: false },
      });
      if (!gate.allowed) {
        if (gate.reason === "federal_dnc_unconfigured") {
          return res.status(503).json({
            code: gate.federalDncCode || "FEDERAL_DNC_UNCONFIGURED",
            error:
              gate.federalDncMessage ||
              "Screening has to clear this sales outreach before it goes out. Answering calls still works.",
          });
        }
        if (gate.reason === "blocked_internal_dnc") {
          log.warn("Outbound dial blocked by DNC list", {
            phone: phoneSuffixForLog(customerNumber),
          });
          return res.status(403).json({
            code: "FORBIDDEN",
            error: "This number is on the Do Not Call list and cannot be dialed.",
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
            error: tcpa?.disclosure_script || "Call blocked by TCPA consent rules.",
            tcpaBlocked: true,
            tcpa,
          });
        }
        if (gate.reason === "outside_permitted_calling_hours") {
          return res.status(403).json({
            code: "OUTSIDE_PERMITTED_CALLING_HOURS",
            error: "This number cannot be dialed outside permitted calling hours.",
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
          error:
            "This number was already dialed in the last 24 hours. Wait before dialing again, or schedule a callback.",
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
