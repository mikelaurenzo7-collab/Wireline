import { Router, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { outboundDialReservations } from "../db/security-schema";
import { authenticateUser } from "../middleware/auth";
import { validate } from "../middleware/input-validation";
import { AppError } from "../lib/api-error";
import { normalizeOutboundNumber } from "../lib/dialer-compliance";
import { evaluateOutboundDialGate } from "../lib/outbound-dial-gate";
import {
  OUTBOUND_CALL_PURPOSES,
  isMarketingCallPurpose,
  outboundConsentMetadata,
} from "../lib/outbound-call-purpose";
import { emitServerProductEventOnce } from "../lib/product-event-server";
import { SentryEvents } from "../lib/sentry-events";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { placeOutboundCall } from "../lib/voice/outbound-call-service";
import {
  readNativeOutboundRequestReplay,
  readNativeOutboundRequestStatus,
  cancelMissingNativeOutboundRequest,
} from "../lib/voice/openai-outbound-placement";
import { inspectOutboundRecipientPermission } from "../lib/recipient-voice-permission-store";
import { outboundVoiceGuard } from "../lib/voice-spend-control";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const RESERVATION_TTL_MS = 30 * 60_000;
const ACTIVE_RESERVATION_STATES = ["reserved", "dialing"];

type OutboundDialGateResult = Awaited<ReturnType<typeof evaluateOutboundDialGate>>;
type DeniedOutboundDialGate = Extract<OutboundDialGateResult, { allowed: false }>;

const dialSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
  customerNumber: z
    .string()
    .min(1, "customerNumber is required")
    .regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number format, expected E.164"),
  customerName: z.string().max(200).optional(),
  context: z.string().max(2000).optional(),
  callPurpose: z.enum(OUTBOUND_CALL_PURPOSES),
  requestKey: z.string().uuid(),
  consentArtifactId: z.string().uuid().optional(),
  hasExpressWrittenConsent: z.boolean().optional().default(false),
  consentSource: z.enum(["web_form", "lead_import", "crm", "manual_attestation"]).optional(),
  consentLeadId: z.string().max(200).optional(),
});

async function markReservation(
  userId: string,
  operationKey: string,
  values: {
    status: "dialing" | "completed" | "failed" | "expired";
    callId?: string | null;
    failureCode?: string | null;
  },
) {
  await drizzle
    .update(outboundDialReservations)
    .set({
      status: values.status,
      ...(values.callId !== undefined ? { callId: values.callId } : {}),
      ...(values.failureCode !== undefined ? { failureCode: values.failureCode } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(outboundDialReservations.operationKey, operationKey),
        eq(outboundDialReservations.userId, userId),
      ),
    );
}

function gateResponse(res: Response, gate: DeniedOutboundDialGate) {
  if (gate.reason === "federal_dnc_unconfigured") {
    return res.status(503).json({
      code: gate.federalDncCode || "FEDERAL_DNC_UNCONFIGURED",
      error: gate.federalDncMessage || "Federal DNC is not configured for marketing dials.",
    });
  }
  if (gate.reason === "blocked_internal_dnc") {
    return res.status(403).json({
      code: "FORBIDDEN",
      error: "This number is on the Do Not Call list and cannot be dialed.",
      dncBlocked: true,
    });
  }
  if (gate.reason === "blocked_tcpa") {
    return res.status(403).json({
      code: "FORBIDDEN",
      error: gate.tcpaDecision?.disclosure_script || "Call blocked by TCPA consent rules.",
      tcpaBlocked: true,
      tcpa: gate.tcpaDecision,
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
  return res.status(409).json({
    code: "DUPLICATE_DIAL_SUPPRESSED",
    error:
      "This number was already dialed recently or has an active dial request. Wait before dialing again, or schedule a callback.",
    reason: gate.reason,
    status: gate.status,
  });
}

function isAmbiguousProviderResult(result: Awaited<ReturnType<typeof placeOutboundCall>>): boolean {
  return (
    (result.ok && !result.callId) ||
    (!result.ok &&
      (result.providerOutcomeAmbiguous === true ||
        result.doNotRetry === true ||
        String(result.error || "").startsWith("Voice carrier unavailable after retries:")))
  );
}

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
    const {
      agentId,
      customerName,
      customerNumber,
      context,
      callPurpose,
      consentSource,
      consentLeadId,
      requestKey,
      consentArtifactId,
    } = req.body;
    const normalized = normalizeOutboundNumber(customerNumber);
    const digits = normalized.replace(/\D/g, "");
    const phoneE164 = normalized.startsWith("+") ? normalized : `+${digits}`;
    if (!/^\+[1-9]\d{6,14}$/.test(phoneE164)) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        error: "Invalid phone number. Use E.164 format like +14155551234.",
      });
    }

    const replay = await readNativeOutboundRequestReplay({
      userId: req.user.id,
      requestKey,
      agentId,
      customerNumber: phoneE164,
      customerName,
      context,
      callPurpose,
      consentArtifactId,
    });
    if (replay) return res.status(replay.status).json({ ...replay, operationId: requestKey });
    const permission = await inspectOutboundRecipientPermission({
      userId: req.user.id,
      agentId,
      phone: phoneE164,
      callPurpose,
      artifactId: consentArtifactId,
      attemptId: requestKey,
    });
    const effectiveCallPurpose = permission.effectiveCallPurpose;
    const marketing = isMarketingCallPurpose(effectiveCallPurpose);
    const expressConsent = marketing;
    const operationKey = requestKey.toLowerCase();
    let providerCallId: string | null = null;
    let nativeLeadId: string | null = null;
    try {
      await drizzle
        .update(outboundDialReservations)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(outboundDialReservations.userId, req.user.id),
            inArray(outboundDialReservations.status, ACTIVE_RESERVATION_STATES),
            sql`${outboundDialReservations.expiresAt} < clock_timestamp()`,
          ),
        );

      const [reservation] = await drizzle
        .insert(outboundDialReservations)
        .values({
          userId: req.user.id,
          phoneE164,
          operationKey,
          status: "reserved",
          expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
        })
        .onConflictDoNothing()
        .returning({ id: outboundDialReservations.id });

      if (!reservation) {
        return res.status(409).json({
          code: "DIAL_ALREADY_IN_PROGRESS",
          doNotRetry: true,
          error:
            "A call to this number is already being prepared. Check Phone before trying again.",
        });
      }

      const gate = await evaluateOutboundDialGate({
        userId: req.user.id,
        phone: phoneE164,
        isMarketingCall: marketing,
        requireFederalDncScreening: marketing,
        hasExpressWrittenConsent: expressConsent,
        isRequestedCallback: effectiveCallPurpose === "callback",
        metadata: { has_express_written_consent: expressConsent },
      });
      if (!gate.allowed) {
        await markReservation(req.user.id, operationKey, {
          status: "failed",
          failureCode: gate.reason || "dial_gate_rejected",
        });
        return gateResponse(res, gate);
      }

      await markReservation(req.user.id, operationKey, { status: "dialing", failureCode: null });
      const result = await placeOutboundCall({
        userId: req.user.id,
        agentId,
        customerName,
        customerNumber: phoneE164,
        context,
        callPurpose: effectiveCallPurpose,
        requestKey,
        consentArtifactId,
        leadMetadata: {
          ...outboundConsentMetadata({
            callPurpose: effectiveCallPurpose,
            requestedCallPurpose: callPurpose,
            hasExpressWrittenConsent: expressConsent,
            source: "web",
            consentSource,
            consentLeadId,
          }),
          wireline_dial_operation_id: operationKey,
        },
      });
      nativeLeadId = result.leadId || null;
      if (!result.ok || !result.callId) {
        if (isAmbiguousProviderResult(result)) {
          await markReservation(req.user.id, operationKey, {
            status: "dialing",
            failureCode: "provider_outcome_ambiguous",
          });
          return res.status(202).json({
            success: false,
            code: "DIAL_STATUS_UNCERTAIN",
            error:
              "The carrier response was interrupted. BotBound is holding this number to prevent a duplicate call; check Phone before trying again.",
            operationId: operationKey,
            doNotRetry: true,
            leadId: nativeLeadId,
          });
        }
        await markReservation(req.user.id, operationKey, {
          status: "failed",
          failureCode: `provider_${result.status || 500}`,
        });
        return res.status(result.status || 500).json({
          code: "ERROR",
          error: result.error || "Voice carrier rejected the call.",
          leadId: nativeLeadId,
        });
      }

      providerCallId = result.callId;
      await markReservation(req.user.id, operationKey, {
        status: "completed",
        callId: providerCallId,
        failureCode: null,
      });

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

      return res.json({
        success: true,
        callId: providerCallId,
        leadId: nativeLeadId,
        operationId: operationKey,
      });
    } catch (error) {
      if (providerCallId || nativeLeadId) {
        await markReservation(req.user.id, operationKey, {
          status: "dialing",
          callId: providerCallId,
          failureCode: "post_provider_persistence_failed",
        }).catch(() => {});
        log.error("Carrier/native placement accepted but reservation reconciliation failed", {
          operationKey,
          callId: providerCallId,
          leadId: nativeLeadId,
          error: getErrorMessage(error),
        });
        return res.status(202).json({
          success: true,
          code: "DIAL_ACCEPTED_RECONCILING",
          callId: providerCallId,
          leadId: nativeLeadId,
          operationId: operationKey,
          doNotRetry: true,
          warning:
            "The call is being reconciled. BotBound is holding this number; do not retry it.",
        });
      }

      await markReservation(req.user.id, operationKey, {
        status: "failed",
        failureCode: "internal_error",
      }).catch(() => {});
      if (error instanceof AppError) throw error;
      log.error("Atomic outbound call failed", {
        operationKey,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Failed to dispatch call.");
    }
  },
);

export default router;
