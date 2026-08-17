import { Router, type Request, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { xaiPhoneBindings } from "../db/xai-voice-schema";
import { AppError, asyncHandler } from "../lib/api-error";
import { LEAD_STATUS } from "../lib/outbound-status";
import { drizzle, log } from "../lib/server-context";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import { verifyXAIOutboundToken } from "../lib/voice/xai-outbound-token";
import {
  buildXAIOutboundSipUri,
  normalizeXAIPhoneNumber,
  resolveXAISipSessionMaxSeconds,
} from "../lib/voice/xai-sip-config";

const router = Router();
const ACTIVE_LEAD_STATUSES = [
  LEAD_STATUS.PENDING,
  LEAD_STATUS.QUEUED,
  LEAD_STATUS.RETRYING,
  LEAD_STATUS.DIALING,
  LEAD_STATUS.CONNECTED,
] as const;
const TERMINAL_CARRIER_FAILURES = new Set(["busy", "no-answer", "failed", "canceled"]);
const CARRIER_STATUS_RANK: Record<string, number> = {
  unknown: 0,
  queued: 0,
  initiated: 1,
  ringing: 2,
  answered: 3,
  "in-progress": 3,
  completed: 4,
  busy: 4,
  "no-answer": 4,
  failed: 4,
  canceled: 4,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function emptyTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
}

function bridgeTwiml(input: { callerId: string; sipUri: string }): string {
  const timeLimit = resolveXAISipSessionMaxSeconds();
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response><Dial answerOnBridge="true" timeout="30" timeLimit="' +
    String(timeLimit) +
    '" callerId="' +
    escapeXml(input.callerId) +
    '"><Sip>' +
    escapeXml(input.sipUri) +
    "</Sip></Dial><Hangup/></Response>"
  );
}

function tokenFromRequest(req: Request): string {
  return typeof req.query.token === "string" ? req.query.token.trim() : "";
}

function callSidFromRequest(req: Request): string {
  const value = String(req.body?.CallSid || "").trim();
  return /^CA[a-f0-9]{32}$/i.test(value) ? value : "";
}

function carrierRank(status: unknown): number {
  return CARRIER_STATUS_RANK[String(status || "unknown").trim().toLowerCase()] ?? 0;
}

async function resolveBridgeContext(token: string, callSid: string) {
  const verification = verifyXAIOutboundToken(token);
  if (!verification.ok) throw AppError.unauthorized("Invalid outbound bridge token.");
  const leadId = BigInt(verification.claims.leadId);

  return drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-outbound:${String(leadId)}`}))`,
    );
    const [lead] = await tx
      .select()
      .from(schema.outboundLeads)
      .where(eq(schema.outboundLeads.id, leadId))
      .limit(1);
    if (!lead?.agentId) throw AppError.notFound("Outbound lead not found.");
    if (!(ACTIVE_LEAD_STATUSES as readonly string[]).includes(lead.status || "")) {
      throw AppError.conflict("This outbound call is no longer bridgeable.");
    }
    if (lead.callId && lead.callId !== callSid) {
      throw AppError.forbidden("Outbound bridge call identity does not match.");
    }

    const now = new Date();
    const metadata = asRecord(lead.metadata);
    const nativeVoice = asRecord(metadata.native_voice);
    const [claimed] = await tx
      .update(schema.outboundLeads)
      .set({
        callId: callSid,
        status: LEAD_STATUS.CONNECTED,
        lastCalledAt: now,
        metadata: {
          ...metadata,
          native_voice: {
            ...nativeVoice,
            provider: "twilio_xai_sip",
            twilio_call_sid: callSid,
            state: "bridging",
            bridge_served_at: now.toISOString(),
            updated_at: now.toISOString(),
          },
        },
      })
      .where(
        and(
          eq(schema.outboundLeads.id, lead.id),
          eq(schema.outboundLeads.userId, lead.userId),
          inArray(schema.outboundLeads.status, ACTIVE_LEAD_STATUSES),
        ),
      )
      .returning({ id: schema.outboundLeads.id });
    if (!claimed) throw AppError.conflict("Outbound bridge could not claim this lead.");

    const [binding] = await tx
      .select()
      .from(xaiPhoneBindings)
      .where(
        and(
          eq(xaiPhoneBindings.userId, lead.userId),
          eq(xaiPhoneBindings.agentId, lead.agentId),
          eq(xaiPhoneBindings.status, "active"),
        ),
      )
      .limit(1);
    const callerId = normalizeXAIPhoneNumber(binding?.phoneNumber);
    if (!binding?.xaiPhoneNumberId || !callerId) {
      throw AppError.serviceUnavailable("The native voice line is not active.");
    }
    return { lead, binding, callerId };
  });
}

router.post(
  "/api/twilio-webhook/xai-outbound-bridge",
  asyncHandler(async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/xml");
    const auth = evaluateTwilioWebhookAuth(req);
    if (!auth.ok) {
      res.status(403).send(emptyTwiml());
      return;
    }
    const token = tokenFromRequest(req);
    const callSid = callSidFromRequest(req);
    if (!token || !callSid) {
      res.status(400).send(emptyTwiml());
      return;
    }

    try {
      const { callerId } = await resolveBridgeContext(token, callSid);
      const sipUri = buildXAIOutboundSipUri(callerId, token);
      res.status(200).send(bridgeTwiml({ callerId, sipUri }));
    } catch (error) {
      log.warn("Native outbound bridge refused", {
        callSidSuffix: callSid.slice(-8),
        errorClass: error instanceof Error ? error.name : typeof error,
      });
      res.status(error instanceof AppError ? error.status : 503).send(emptyTwiml());
    }
  }),
);

router.post(
  "/api/twilio-webhook/xai-outbound-status",
  asyncHandler(async (req: Request, res: Response) => {
    if (!evaluateTwilioWebhookAuth(req).ok) {
      res.status(403).end();
      return;
    }
    const token = tokenFromRequest(req);
    const callSid = callSidFromRequest(req);
    const verification = verifyXAIOutboundToken(token);
    if (!verification.ok || !callSid) {
      res.status(400).end();
      return;
    }

    const leadId = BigInt(verification.claims.leadId);
    const carrierStatus = String(req.body?.CallStatus || "unknown").trim().toLowerCase();
    await drizzle.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-outbound:${String(leadId)}`}))`,
      );
      const [lead] = await tx
        .select()
        .from(schema.outboundLeads)
        .where(eq(schema.outboundLeads.id, leadId))
        .limit(1);
      if (!lead || (lead.callId && lead.callId !== callSid)) return;
      if (!(ACTIVE_LEAD_STATUSES as readonly string[]).includes(lead.status || "")) return;

      const now = new Date();
      const metadata = asRecord(lead.metadata);
      const nativeVoice = asRecord(metadata.native_voice);
      const previousCarrierStatus = String(nativeVoice.carrier_status || "unknown").toLowerCase();
      const isMonotonic = carrierRank(carrierStatus) >= carrierRank(previousCarrierStatus);
      const nextNativeVoice: Record<string, unknown> = {
        ...nativeVoice,
        provider: "twilio_xai_sip",
        twilio_call_sid: callSid,
        carrier_status_last_seen: carrierStatus,
        updated_at: now.toISOString(),
      };
      if (isMonotonic) {
        nextNativeVoice.carrier_status = carrierStatus;
        nextNativeVoice.carrier_status_rank = carrierRank(carrierStatus);
      }

      const patch: Partial<typeof schema.outboundLeads.$inferInsert> = {
        ...(lead.callId ? {} : { callId: callSid }),
        metadata: {
          ...metadata,
          native_voice: nextNativeVoice,
        },
      };

      if (isMonotonic && (carrierStatus === "initiated" || carrierStatus === "ringing")) {
        if (lead.status !== LEAD_STATUS.CONNECTED) patch.status = LEAD_STATUS.DIALING;
      } else if (
        isMonotonic &&
        (carrierStatus === "in-progress" || carrierStatus === "answered")
      ) {
        patch.status = LEAD_STATUS.CONNECTED;
        nextNativeVoice.state = nativeVoice.xai_call_id ? "connected" : "customer_answered";
      } else if (isMonotonic && TERMINAL_CARRIER_FAILURES.has(carrierStatus)) {
        patch.status = LEAD_STATUS.FAILED;
        patch.lastContactSummary = `Carrier outcome: ${carrierStatus}.`;
        nextNativeVoice.state = "carrier_failed";
        nextNativeVoice.carrier_completed_at = now.toISOString();
      } else if (isMonotonic && carrierStatus === "completed") {
        nextNativeVoice.carrier_completed_at = now.toISOString();
        if (!nativeVoice.xai_call_id) {
          // Delivery order between Twilio and xAI webhooks is not guaranteed.
          // Mark this as a specifically recoverable error; the signed xAI SIP
          // webhook may still attach the exact lead and move it back to Connected.
          patch.status = LEAD_STATUS.ERROR;
          patch.lastContactSummary = "The customer leg ended before native voice was confirmed.";
          nextNativeVoice.state = "carrier_completed_without_xai_confirmation";
        }
      }

      await tx
        .update(schema.outboundLeads)
        .set(patch)
        .where(
          and(
            eq(schema.outboundLeads.id, lead.id),
            eq(schema.outboundLeads.userId, lead.userId),
            inArray(schema.outboundLeads.status, ACTIVE_LEAD_STATUSES),
          ),
        );
    });
    res.status(204).end();
  }),
);

export default router;
