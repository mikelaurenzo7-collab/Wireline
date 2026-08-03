import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { outboundVoiceGuard } from "../lib/voice-spend-control";
import {
  OUTBOUND_CALL_PURPOSES,
  isMarketingCallPurpose,
  normalizedExpressConsent,
  outboundConsentMetadata,
} from "../lib/outbound-call-purpose";
import { evaluateOutboundDialGate } from "../lib/outbound-dial-gate";
import { placeOutboundCall } from "../lib/vapi-client";
import { normalizeOutboundNumber } from "../lib/dialer-compliance";
import { SentryEvents } from "../lib/sentry-events";
import { emitServerProductEventOnce } from "../lib/product-event-server";
import { authenticateUser } from "../middleware/auth";
import { validate } from "../middleware/input-validation";
import { outboundDialReservations } from "../db/security-schema";
import * as schema from "../db/schema";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const RESERVATION_TTL_MS = 30 * 60_000;
const ACTIVE_RESERVATION_STATES = ["reserved", "dialing"];

const dialSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
  customerNumber: z
    .string()
    .min(1, "customerNumber is required")
    .regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number format — expected E.164"),
  customerName: z.string().max(200).optional(),
  context: z.string().max(2000).optional(),
  callPurpose: z.enum(OUTBOUND_CALL_PURPOSES),
  hasExpressWrittenConsent: z.boolean().optional().default(false),
  consentSource: z.enum(["web_form", "lead_import", "crm", "manual_attestation"]).optional(),
  consentLeadId: z.string().max(200).optional(),
});

async function markReservation(
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
    .where(eq(outboundDialReservations.operationKey, operationKey));
}

function gateResponse(res: Response, gate: Awaited<ReturnType<typeof evaluateOutboundDialGate>>) {
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
  return res.status(409).json({
    code: "DUPLICATE_DIAL_SUPPRESSED",
    error:
      "This number was already dialed recently or has an active dial request. Wait before dialing again, or schedule a callback.",
    reason: gate.reason,
    status: gate.status,
  });
}

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

    const normalized = normalizeOutboundNumber(customerNumber);
    const digits = normalized.replace(/\D/g, "");
    const phoneE164 = normalized.startsWith("+") ? normalized : `+${digits}`;
    if (!/^\+[1-9]\d{6,14}$/.test(phoneE164)) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        error: "Invalid phone number. Use E.164 format like +14155551234.",
      });
    }

    const operationKey = randomUUID();
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
          error: "A call to this number is already being prepared. Check Phone before trying again.",
        });
      }

      const gate = await evaluateOutboundDialGate({
        userId: req.user.id,
        phone: phoneE164,
        isMarketingCall: marketing,
        hasExpressWrittenConsent: expressConsent,
        metadata: { has_express_written_consent: expressConsent },
      });
      if (!gate.allowed) {
        await markReservation(operationKey, {
          status: "failed",
          failureCode: gate.reason || "dial_gate_rejected",
        });
        return gateResponse(res, gate);
      }

      await markReservation(operationKey, { status: "dialing", failureCode: null });
      const result = await placeOutboundCall({
        userId: req.user.id,
        agentId,
        customerName,
        customerNumber: phoneE164,
        context,
      });
      if (!result.ok || !result.callId) {
        await markReservation(operationKey, {
          status: "failed",
          failureCode: `provider_${result.status || 500}`,
        });
        return res.status(result.status || 500).json({
          code: "ERROR",
          error: result.error || "Voice carrier rejected the call.",
        });
      }

      await markReservation(operationKey, { status: "dialing", callId: result.callId });

      await drizzle.transaction(async (tx) => {
        await tx.insert(schema.outboundLeads).values({
          userId: req.user.id,
          agentId,
          customerName,
          customerNumber: phoneE164,
          context,
          callId: result.callId,
          status: "Dialing",
          attempts: 1,
          lastCalledAt: new Date(),
          metadata: {
            ...outboundConsentMetadata({
              callPurpose,
              hasExpressWrittenConsent,
              source: "web",
              consentSource,
              consentLeadId,
            }),
            wireline_dial_operation_id: operationKey,
          },
        });
        await tx
          .update(outboundDialReservations)
          .set({ status: "completed", callId: result.callId, updatedAt: new Date() })
          .where(eq(outboundDialReservations.operationKey, operationKey));
      });

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

      return res.json({
        success: true,
        callId: result.callId,
        operationId: operationKey,
      });
    } catch (error) {
      await markReservation(operationKey, {
        status: "failed",
        failureCode: "internal_error",
      }).catch(() => {});
      log.error("Atomic outbound call failed", {
        operationKey,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Failed to dispatch call.");
    }
  },
);

export default router;
