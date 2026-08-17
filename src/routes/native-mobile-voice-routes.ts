import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import * as schema from "../db/schema";
import { outboundDialReservations } from "../db/security-schema";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import { validate } from "../middleware/input-validation";
import { AppError } from "../lib/api-error";
import { normalizeOutboundNumber } from "../lib/dialer-compliance";
import { evaluateOutboundDialGate } from "../lib/outbound-dial-gate";
import {
  OUTBOUND_CALL_PURPOSES,
  isMarketingCallPurpose,
  normalizedExpressConsent,
  outboundConsentMetadata,
} from "../lib/outbound-call-purpose";
import { emitServerProductEventOnce } from "../lib/product-event-server";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { placeOutboundCall } from "../lib/voice/outbound-call-service";
import { normalizeXAIPhoneNumber } from "../lib/voice/xai-sip-config";
import { referXAISipCall } from "../lib/voice/xai-sip-session";
import { outboundVoiceGuard } from "../lib/voice-spend-control";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const ACTIVE_RESERVATION_STATES = ["reserved", "dialing"];
const RESERVATION_TTL_MS = 30 * 60_000;

const mobileSensitiveRateLimiter = createRateLimiter({
  bucket: "api:mobile:sensitive",
  windowMs: 60_000,
  max: 20,
});

const mobileDialSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
  customerNumber: z
    .string()
    .min(1, "customerNumber is required")
    .regex(
      /^\+?[1-9]\d{6,14}$/,
      "Invalid phone number format, expected E.164 (e.g. +15551234567)",
    ),
  customerName: z.string().max(200).optional(),
  context: z.string().max(2000).optional(),
  callPurpose: z.enum(OUTBOUND_CALL_PURPOSES),
  hasExpressWrittenConsent: z.boolean().optional().default(false),
  consentSource: z.enum(["web_form", "lead_import", "crm", "manual_attestation"]).optional(),
  consentLeadId: z.string().max(200).optional(),
});

const handoffSchema = z.object({
  to: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Expected E.164 (e.g. +15551234567)").optional(),
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

function xaiCallId(controlToken: string): string | null {
  const token = controlToken.trim();
  if (!token.startsWith("xai:")) return null;
  const value = token.slice(4).trim();
  return value && value.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(value) ? value : null;
}

router.post(
  "/api/mobile/calls/outbound",
  authenticateUser,
  mobileSensitiveRateLimiter,
  outboundVoiceGuard("manual"),
  validate({ body: mobileDialSchema }),
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
    const phoneE164 = normalized.startsWith("+")
      ? normalized
      : `+${normalized.replace(/\D/g, "")}`;
    if (!/^\+[1-9]\d{6,14}$/.test(phoneE164)) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        error: "Invalid phone number. Use E.164 format like +14155551234.",
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
          "This number was already dialed recently or has an active dial request. Check Phone before trying again.",
        reason: gate.reason,
        status: gate.status,
      });
    }

    const operationKey = randomUUID();
    let nativeLeadId: string | null = null;
    let providerCallId: string | null = null;
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
          error:
            "A call to this number is already being prepared. Check Phone before trying again.",
        });
      }

      await markReservation(operationKey, { status: "dialing", failureCode: null });
      const result = await placeOutboundCall({
        userId: req.user.id,
        agentId,
        customerName,
        customerNumber: phoneE164,
        context,
        callPurpose,
        leadMetadata: {
          ...outboundConsentMetadata({
            callPurpose,
            hasExpressWrittenConsent,
            source: "mobile",
            consentSource,
            consentLeadId,
          }),
          wireline_dial_operation_id: operationKey,
        },
      });
      nativeLeadId = result.leadId || null;

      if (!result.ok || !result.callId) {
        const uncertain =
          result.providerOutcomeAmbiguous === true ||
          result.doNotRetry === true ||
          (result.ok && !result.callId);
        await markReservation(operationKey, {
          status: uncertain ? "dialing" : "failed",
          failureCode: uncertain ? "provider_outcome_ambiguous" : `provider_${result.status || 500}`,
        });
        return res.status(uncertain ? 202 : result.status || 500).json({
          success: false,
          code: uncertain ? "DIAL_STATUS_UNCERTAIN" : "ERROR",
          error: uncertain
            ? "The carrier response was interrupted. Wireline is holding this number to prevent a duplicate call; check Phone before trying again."
            : result.error || "Voice carrier rejected the call.",
          doNotRetry: uncertain,
          operationId: operationKey,
          leadId: nativeLeadId,
        });
      }

      providerCallId = result.callId;
      await markReservation(operationKey, {
        status: "completed",
        callId: providerCallId,
        failureCode: null,
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
        await markReservation(operationKey, {
          status: "dialing",
          callId: providerCallId,
          failureCode: "post_provider_reconciliation_failed",
        }).catch(() => {});
        log.error("Native mobile dial accepted but reconciliation failed", {
          userId: req.user.id,
          operationKey,
          leadId: nativeLeadId,
          callId: providerCallId,
          error: getErrorMessage(error),
        });
        return res.status(202).json({
          success: true,
          code: "DIAL_ACCEPTED_RECONCILING",
          callId: providerCallId,
          leadId: nativeLeadId,
          operationId: operationKey,
          warning: "The call is being reconciled. Do not retry it.",
        });
      }

      await markReservation(operationKey, {
        status: "failed",
        failureCode: "internal_error",
      }).catch(() => {});
      log.error("Native mobile outbound call failed", {
        userId: req.user.id,
        operationKey,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Failed to dispatch call.");
    }
  },
);

router.post(
  "/api/mobile/calls/:callId/handoff",
  authenticateUser,
  mobileSensitiveRateLimiter,
  validate({ body: handoffSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    const [presence] = await drizzle
      .select({
        controlUrl: schema.signalPresence.controlUrl,
        status: schema.signalPresence.status,
      })
      .from(schema.signalPresence)
      .where(
        and(
          eq(schema.signalPresence.id, req.params.callId),
          eq(schema.signalPresence.userId, req.user.id),
        ),
      )
      .limit(1);
    if (!presence) {
      return res.status(404).json({ code: "NOT_FOUND", error: "That call isn't active." });
    }
    if (!presence.controlUrl) {
      return res.status(409).json({
        code: "HANDOFF_UNAVAILABLE",
        error: "This call is not attached to the native voice control plane yet.",
      });
    }

    let destination = (req.body as { to?: string }).to;
    if (!destination) {
      const [settings] = await drizzle
        .select({ handoffPhone: schema.settings.handoffPhone })
        .from(schema.settings)
        .where(eq(schema.settings.userId, req.user.id))
        .limit(1);
      destination = settings?.handoffPhone || undefined;
    }
    const normalizedDestination = normalizeXAIPhoneNumber(destination);
    if (!normalizedDestination) {
      return res.status(400).json({
        code: "NO_CALLBACK_NUMBER",
        error: "Set a valid callback number first so Wireline knows where to send the call.",
      });
    }

    const callId = xaiCallId(presence.controlUrl);
    if (!callId) {
      return res.status(409).json({
        code: "HANDOFF_UNAVAILABLE",
        error: "This call is not controlled by the native xAI runtime.",
      });
    }

    const [claimed] = await drizzle
      .update(schema.signalPresence)
      .set({ status: "transferring" })
      .where(
        and(
          eq(schema.signalPresence.id, req.params.callId),
          eq(schema.signalPresence.userId, req.user.id),
          eq(schema.signalPresence.status, "connected"),
        ),
      )
      .returning({ id: schema.signalPresence.id });
    if (!claimed) {
      return res.status(409).json({
        code: "HANDOFF_IN_PROGRESS",
        error: "This call is already being transferred or has ended.",
      });
    }

    try {
      await referXAISipCall(callId, normalizedDestination);
      await drizzle
        .update(schema.signalPresence)
        .set({ status: "transferred" })
        .where(
          and(
            eq(schema.signalPresence.id, req.params.callId),
            eq(schema.signalPresence.userId, req.user.id),
          ),
        );
      return res.json({ success: true });
    } catch (error) {
      await drizzle
        .update(schema.signalPresence)
        .set({ status: "connected" })
        .where(
          and(
            eq(schema.signalPresence.id, req.params.callId),
            eq(schema.signalPresence.userId, req.user.id),
            eq(schema.signalPresence.status, "transferring"),
          ),
        )
        .catch(() => {});
      log.error("Native mobile handoff failed", {
        userId: req.user.id,
        presenceId: req.params.callId,
        error: getErrorMessage(error),
      });
      return res.status(502).json({
        code: "HANDOFF_FAILED",
        error: "The carrier could not complete the handoff. The AI call remains active.",
      });
    }
  },
);

export default router;
