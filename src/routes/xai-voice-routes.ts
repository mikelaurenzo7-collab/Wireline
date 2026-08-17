import { Router, type Request, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import * as schema from "../db/schema";
import { xaiPhoneBindings, type XAIPhoneBinding } from "../db/xai-voice-schema";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { AppError, asyncHandler } from "../lib/api-error";
import { validateBody } from "../lib/api-validation";
import { runInBackground } from "../lib/background-work";
import {
  isOutboundCallPurpose,
  type OutboundCallPurpose,
} from "../lib/outbound-call-purpose";
import { LEAD_STATUS } from "../lib/outbound-status";
import { decryptSecret } from "../lib/secret-vault";
import { drizzle, log } from "../lib/server-context";
import { phoneSuffixForLog } from "../lib/twilio-webhook-privacy";
import { verifyXAIOutboundToken } from "../lib/voice/xai-outbound-token";
import {
  getNativeXAIPhoneStatus,
  provisionNativeXAIPhone,
} from "../lib/voice/xai-sip-provisioning";
import {
  XAI_OUTBOUND_SIP_TOKEN_HEADER,
  normalizeXAIPhoneNumber,
} from "../lib/voice/xai-sip-config";
import { runXAISipCallSession, type XAISipIncomingCall } from "../lib/voice/xai-sip-session";
import { verifyXAIWebhook } from "../lib/voice/xai-webhook-auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const webhookLimiter = createRateLimiter({
  bucket: "provider:xai-voice-webhook",
  windowMs: 60_000,
  max: 300,
  failClosedOnError: true,
});
const provisioningLimiter = createRateLimiter({
  bucket: "api:xai-phone-provision",
  windowMs: 60 * 60 * 1_000,
  max: 8,
  failClosedOnError: true,
});
const statusLimiter = createRateLimiter({
  bucket: "api:xai-phone-status",
  windowMs: 60_000,
  max: 60,
});
const ACTIVE_OUTBOUND_STATUSES: readonly string[] = [
  LEAD_STATUS.PENDING,
  LEAD_STATUS.QUEUED,
  LEAD_STATUS.RETRYING,
  LEAD_STATUS.DIALING,
  LEAD_STATUS.CONNECTED,
];
const OUTBOUND_ATTACHABLE_STATUSES: readonly string[] = [
  ...ACTIVE_OUTBOUND_STATUSES,
  LEAD_STATUS.ERROR,
];

const provisionSchema = z.object({
  agentId: z.string().min(1).max(200),
});

type XAIIncomingWebhook = {
  type?: unknown;
  data?: {
    call_id?: unknown;
    sip_headers?: unknown;
  };
};

type AgentContext = {
  businessName: string | null;
  complianceMode: string | null;
};

function rawBody(req: Request): Buffer | null {
  return Buffer.isBuffer(req.body) ? req.body : null;
}

function parseWebhook(body: Buffer): XAIIncomingWebhook | null {
  try {
    const parsed = JSON.parse(body.toString("utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as XAIIncomingWebhook)
      : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sipHeader(payload: XAIIncomingWebhook, name: string): string {
  const headers = Array.isArray(payload.data?.sip_headers) ? payload.data?.sip_headers : [];
  const row = headers.find((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return String((value as { name?: unknown }).name || "").toLowerCase() === name.toLowerCase();
  }) as { value?: unknown } | undefined;
  return typeof row?.value === "string" ? row.value.trim() : "";
}

function phoneFromSipValue(value: string): string | null {
  const direct = normalizeXAIPhoneNumber(value);
  if (direct) return direct;
  const match = value.match(/\+[1-9]\d{7,14}/);
  return match ? normalizeXAIPhoneNumber(match[0]) : null;
}

function outboundPurpose(value: unknown): OutboundCallPurpose {
  return isOutboundCallPurpose(value) ? value : "service_or_requested";
}

async function resolveAgentContext(binding: XAIPhoneBinding): Promise<AgentContext> {
  const [agentContext] = await drizzle
    .select({
      businessName: schema.settings.businessName,
      complianceMode: schema.agents.complianceMode,
    })
    .from(schema.agents)
    .leftJoin(schema.settings, eq(schema.settings.userId, schema.agents.userId))
    .where(
      and(
        eq(schema.agents.id, binding.agentId),
        eq(schema.agents.userId, binding.userId),
      ),
    )
    .limit(1);
  if (!agentContext) {
    log.error("xAI incoming call rejected: native binding points to a missing agent", {
      bindingId: binding.id,
      calledSuffix: phoneSuffixForLog(binding.phoneNumber),
    });
    throw AppError.serviceUnavailable("This phone line is not ready for native voice.");
  }
  return agentContext;
}

/**
 * Resolve an outbound xAI SIP leg from the signed, PII-free token that Twilio
 * inserted as a custom SIP header. This transition is committed before the
 * webhook is acknowledged so Twilio's terminal callback cannot race ahead and
 * misclassify a real conversation as a failed bridge.
 */
async function resolveOutboundSession(input: {
  token: string;
  callId: string;
  binding: XAIPhoneBinding;
  agentContext: AgentContext;
}): Promise<XAISipIncomingCall> {
  const verification = verifyXAIOutboundToken(input.token);
  if (!verification.ok) {
    log.warn("xAI outbound SIP token rejected", {
      bindingId: input.binding.id,
      reason: verification.reason,
    });
    throw AppError.unauthorized("Invalid outbound voice correlation token.");
  }

  const leadId = BigInt(verification.claims.leadId);
  return drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-outbound:${String(leadId)}`}))`,
    );

    const [lead] = await tx
      .select()
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.id, leadId),
          eq(schema.outboundLeads.userId, input.binding.userId),
          eq(schema.outboundLeads.agentId, input.binding.agentId),
        ),
      )
      .limit(1);
    if (!lead) throw AppError.notFound("The correlated outbound call no longer exists.");

    const metadata = asRecord(lead.metadata);
    const nativeVoice = asRecord(metadata.native_voice);
    const recoverableCarrierRace =
      lead.status === LEAD_STATUS.ERROR &&
      nativeVoice.state === "carrier_completed_without_xai_confirmation";
    if (!ACTIVE_OUTBOUND_STATUSES.includes(lead.status || "") && !recoverableCarrierRace) {
      throw AppError.conflict("This outbound call is no longer attachable.");
    }

    const customerNumber = normalizeXAIPhoneNumber(lead.customerNumber || lead.phoneNumber);
    if (!customerNumber) {
      throw AppError.conflict("The outbound contact no longer has a valid phone number.");
    }

    const now = new Date();
    const [attached] = await tx
      .update(schema.outboundLeads)
      .set({
        status: LEAD_STATUS.CONNECTED,
        lastCalledAt: now,
        metadata: {
          ...metadata,
          native_voice: {
            ...nativeVoice,
            provider: "twilio_xai_sip",
            xai_call_id: `xai:${input.callId}`,
            state: "connected",
            xai_attached_at: now.toISOString(),
            updated_at: now.toISOString(),
          },
        },
      })
      .where(
        and(
          eq(schema.outboundLeads.id, lead.id),
          eq(schema.outboundLeads.userId, lead.userId),
          inArray(schema.outboundLeads.status, OUTBOUND_ATTACHABLE_STATUSES),
        ),
      )
      .returning({ id: schema.outboundLeads.id });
    if (!attached) throw AppError.conflict("The outbound call attachment lost its lease.");

    return {
      callId: input.callId,
      userId: input.binding.userId,
      agentId: input.binding.agentId,
      callerNumber: customerNumber,
      calledNumber: input.binding.phoneNumber,
      direction: "outbound",
      leadId: lead.id,
      customerName: lead.customerName,
      context: lead.context,
      callPurpose: outboundPurpose(nativeVoice.call_purpose),
      businessName: input.agentContext.businessName,
      complianceMode: input.agentContext.complianceMode,
    };
  });
}

router.post(
  "/api/webhooks/xai/voice",
  webhookLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const body = rawBody(req);
    if (!body) throw AppError.badRequest("A raw xAI webhook body is required.");
    const payload = parseWebhook(body);
    if (!payload) throw AppError.badRequest("The xAI webhook body is invalid JSON.");

    // Unknown future event types are acknowledged without side effects. xAI
    // retries non-2xx deliveries, so rejecting an event Wireline does not own
    // would create a provider retry storm.
    if (payload.type !== "realtime.call.incoming") {
      res.status(202).json({ received: true, handled: false });
      return;
    }

    const callId = typeof payload.data?.call_id === "string" ? payload.data.call_id.trim() : "";
    const calledNumber = phoneFromSipValue(sipHeader(payload, "To"));
    const callerNumber = phoneFromSipValue(sipHeader(payload, "From"));
    if (!callId || callId.length > 200 || !calledNumber) {
      throw AppError.badRequest("The incoming call event is missing a valid call or dialed number.");
    }

    const [binding] = await drizzle
      .select()
      .from(xaiPhoneBindings)
      .where(
        and(
          eq(xaiPhoneBindings.phoneNumber, calledNumber),
          eq(xaiPhoneBindings.status, "active"),
        ),
      )
      .limit(1);
    if (!binding?.webhookSecretEncrypted || !binding.xaiWebhookId) {
      log.warn("xAI incoming call rejected: no active native phone binding", {
        calledSuffix: phoneSuffixForLog(calledNumber),
      });
      throw AppError.forbidden("This phone line is not active for native voice.");
    }

    let signingSecret: string;
    try {
      signingSecret = decryptSecret(binding.webhookSecretEncrypted);
    } catch {
      log.error("xAI incoming call rejected: binding secret could not be decrypted", {
        bindingId: binding.id,
        calledSuffix: phoneSuffixForLog(calledNumber),
      });
      throw AppError.serviceUnavailable("Native voice verification is unavailable.");
    }

    const verification = verifyXAIWebhook({
      rawBody: body,
      headers: {
        webhookId: String(req.get("webhook-id") || ""),
        webhookTimestamp: String(req.get("webhook-timestamp") || ""),
        webhookSignature: String(req.get("webhook-signature") || ""),
      },
      signingSecret,
    });
    if (!verification.ok || verification.webhookId !== binding.xaiWebhookId) {
      log.warn("xAI incoming call signature rejected", {
        bindingId: binding.id,
        reason: verification.ok ? "webhook_id_mismatch" : verification.reason,
        calledSuffix: phoneSuffixForLog(calledNumber),
      });
      throw AppError.unauthorized("Invalid xAI webhook signature.");
    }

    const agentContext = await resolveAgentContext(binding);
    const outboundToken = sipHeader(payload, XAI_OUTBOUND_SIP_TOKEN_HEADER);
    const sessionInput = outboundToken
      ? await resolveOutboundSession({
          token: outboundToken,
          callId,
          binding,
          agentContext,
        })
      : {
          callId,
          userId: binding.userId,
          agentId: binding.agentId,
          callerNumber,
          calledNumber,
          direction: "inbound" as const,
          businessName: agentContext.businessName,
          complianceMode: agentContext.complianceMode,
        };

    runInBackground("xai-sip-call-session", () => runXAISipCallSession(sessionInput));
    res.status(202).json({ received: true, handled: true });
  }),
);

router.get(
  "/api/voice/native/phone/status",
  authenticateUser,
  statusLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const agentId = typeof req.query.agentId === "string" ? req.query.agentId.trim() : "";
    const status = await getNativeXAIPhoneStatus(req.user.id, agentId || undefined);
    res.setHeader("Cache-Control", "no-store");
    res.json(status);
  }),
);

router.post(
  "/api/voice/native/phone/provision",
  authenticateUser,
  provisioningLimiter,
  enforceLaunchHardGate,
  validateBody(provisionSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await provisionNativeXAIPhone({
      userId: req.user.id,
      agentId: req.body.agentId,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(result);
  }),
);

export default router;
