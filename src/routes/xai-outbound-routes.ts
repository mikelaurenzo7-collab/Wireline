import { Router, type Request, type Response } from "express";
import { and, eq, inArray } from "drizzle-orm";

import * as schema from "../db/schema";
import { xaiPhoneBindings } from "../db/xai-voice-schema";
import { AppError, asyncHandler } from "../lib/api-error";
import { LEAD_STATUS } from "../lib/outbound-status";
import { drizzle, log } from "../lib/server-context";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import {
  buildXAIOutboundSipUri,
  normalizeXAIPhoneNumber,
} from "../lib/voice/xai-sip-config";
import { verifyXAIOutboundToken } from "../lib/voice/xai-outbound-token";

const router = Router();
const ACTIVE_LEAD_STATUSES = [
  LEAD_STATUS.PENDING,
  LEAD_STATUS.QUEUED,
  LEAD_STATUS.RETRYING,
  LEAD_STATUS.DIALING,
  LEAD_STATUS.CONNECTED,
] as const;
const TERMINAL_CARRIER_FAILURES = new Set(["busy", "no-answer", "failed", "canceled"]);

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
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response><Dial answerOnBridge="true" timeout="30" callerId="' +
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

async function resolveBridgeContext(token: string, callSid: string) {
  const verification = verifyXAIOutboundToken(token);
  if (!verification.ok) throw AppError.unauthorized("Invalid outbound bridge token.");
  const leadId = BigInt(verification.claims.leadId);
  const [lead] = await drizzle
    .select()
    .from(schema.outboundLeads)
    .where(eq(schema.outboundLeads.id, leadId))
    .limit(1);
  if (!lead?.agentId) throw AppError.notFound("Outbound lead not found.");

  if (lead.callId && lead.callId !== callSid) {
    throw AppError.forbidden("Outbound bridge call identity does not match.");
  }
  if (!lead.callId) {
    const [claimed] = await drizzle
      .update(schema.outboundLeads)
      .set({ callId: callSid, status: LEAD_STATUS.DIALING })
      .where(
        and(
          eq(schema.outboundLeads.id, lead.id),
          eq(schema.outboundLeads.userId, lead.userId),
          inArray(schema.outboundLeads.status, ACTIVE_LEAD_STATUSES),
        ),
      )
      .returning({ id: schema.outboundLeads.id });
    if (!claimed) throw AppError.conflict("Outbound bridge could not claim this lead.");
  }

  const [binding] = await drizzle
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
    const [lead] = await drizzle
      .select()
      .from(schema.outboundLeads)
      .where(eq(schema.outboundLeads.id, leadId))
      .limit(1);
    if (!lead || (lead.callId && lead.callId !== callSid)) {
      res.status(204).end();
      return;
    }

    const carrierStatus = String(req.body?.CallStatus || "unknown").trim().toLowerCase();
    const metadata = asRecord(lead.metadata);
    const nativeVoice = asRecord(metadata.native_voice);
    const patch: Partial<typeof schema.outboundLeads.$inferInsert> = {
      ...(lead.callId ? {} : { callId: callSid }),
      metadata: {
        ...metadata,
        native_voice: {
          ...nativeVoice,
          twilio_call_sid: callSid,
          carrier_status: carrierStatus,
          updated_at: new Date().toISOString(),
        },
      },
    };

    if (carrierStatus === "initiated" || carrierStatus === "ringing") {
      patch.status = LEAD_STATUS.DIALING;
    } else if (carrierStatus === "in-progress" || carrierStatus === "answered") {
      patch.status = LEAD_STATUS.CONNECTED;
    } else if (TERMINAL_CARRIER_FAILURES.has(carrierStatus)) {
      patch.status = LEAD_STATUS.FAILED;
      patch.lastContactSummary = `Carrier outcome: ${carrierStatus}.`;
    } else if (carrierStatus === "completed" && !nativeVoice.xai_call_id) {
      // A completed Twilio customer leg without an xAI call webhook means the
      // SIP bridge never established. Do not report a successful conversation.
      patch.status = LEAD_STATUS.ERROR;
      patch.lastContactSummary = "The customer leg ended before native voice connected.";
    }

    await drizzle
      .update(schema.outboundLeads)
      .set(patch)
      .where(
        and(
          eq(schema.outboundLeads.id, lead.id),
          eq(schema.outboundLeads.userId, lead.userId),
          inArray(schema.outboundLeads.status, ACTIVE_LEAD_STATUSES),
        ),
      );
    res.status(204).end();
  }),
);

export default router;
