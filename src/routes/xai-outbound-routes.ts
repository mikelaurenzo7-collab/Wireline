import { Router, type Request, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { xaiPhoneBindings } from "../db/xai-voice-schema";
import { formatCallbackNumberForSpeech } from "../lib/agent-runtime";
import { AppError, asyncHandler } from "../lib/api-error";
import { isMarketingCallPurpose } from "../lib/outbound-call-purpose";
import {
  DEFAULT_LEAD_MAX_ATTEMPTS,
  LEAD_STATUS,
  resolveRetryableLeadStatus,
} from "../lib/outbound-status";
import { drizzle, log } from "../lib/server-context";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import {
  nativeCallPurposeFromMetadata,
  resolveNativeAmdBridgeAction,
} from "../lib/voice/native-outbound-amd";
import { verifyXAIOutboundToken } from "../lib/voice/xai-outbound-token";
import {
  buildXAIOutboundSipUri,
  normalizeXAIPhoneNumber,
  resolveXAISipSessionMaxSeconds,
} from "../lib/voice/xai-sip-config";
import { buildOutboundVoicemailMessage } from "../lib/voice-agent-profile";

const router = Router();
const ACTIVE_LEAD_STATUSES = [
  LEAD_STATUS.PENDING,
  LEAD_STATUS.QUEUED,
  LEAD_STATUS.RETRYING,
  LEAD_STATUS.DIALING,
  LEAD_STATUS.CONNECTED,
] as const;
const IN_FLIGHT_LEAD_STATUSES = [LEAD_STATUS.DIALING, LEAD_STATUS.CONNECTED] as const;
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

function voicemailTwiml(message: string): string {
  const spoken = message.trim();
  if (!spoken) return emptyTwiml();
  return (
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say>' +
    escapeXml(spoken) +
    "</Say><Hangup/></Response>"
  );
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

function answeredByFromRequest(req: Request): string {
  return String(req.body?.AnsweredBy || "").trim();
}

async function loadCampaignMaxAttempts(
  tx: { select: typeof drizzle.select },
  campaignId: string | null | undefined,
): Promise<number> {
  if (!campaignId) return DEFAULT_LEAD_MAX_ATTEMPTS;
  const [camp] = await tx
    .select({ maxAttempts: schema.outboundCampaigns.maxAttempts })
    .from(schema.outboundCampaigns)
    .where(eq(schema.outboundCampaigns.id, campaignId))
    .limit(1);
  const value = camp?.maxAttempts;
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_LEAD_MAX_ATTEMPTS;
}

type BridgeDecision =
  | { kind: "bridge"; callerId: string; sipUri: string }
  | { kind: "drop"; answeredBy: string }
  | { kind: "voicemail"; answeredBy: string; message: string };

async function resolveBridgeContext(
  token: string,
  callSid: string,
  answeredBy: string,
): Promise<BridgeDecision> {
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

    const [agent] = await tx
      .select({ name: schema.agents.name })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, lead.agentId), eq(schema.agents.userId, lead.userId)))
      .limit(1);
    const [settings] = await tx
      .select({ businessName: schema.settings.businessName })
      .from(schema.settings)
      .where(eq(schema.settings.userId, lead.userId))
      .limit(1);

    const now = new Date();
    const metadata = asRecord(lead.metadata);
    const nativeVoice = asRecord(metadata.native_voice);
    const callPurpose = nativeCallPurposeFromMetadata(nativeVoice.call_purpose);
    const telemarketing = isMarketingCallPurpose(callPurpose);
    const amdAction = resolveNativeAmdBridgeAction({ answeredBy, callPurpose });
    const agentName = agent?.name?.trim() || "Wireline";
    const businessName = settings?.businessName?.trim() || null;
    const voicemailMessage = buildOutboundVoicemailMessage(
      agentName,
      businessName,
      formatCallbackNumberForSpeech(callerId),
      telemarketing,
    );

    const amdNativeVoice: Record<string, unknown> = {
      ...nativeVoice,
      provider: "twilio_xai_sip",
      twilio_call_sid: callSid,
      call_purpose: callPurpose,
      answered_by: answeredBy || "unknown",
      amd_action: amdAction,
      updated_at: now.toISOString(),
    };

    if (amdAction === "drop") {
      amdNativeVoice.state = "amd_no_message";
      amdNativeVoice.amd_completed_at = now.toISOString();
      const fax = answeredBy.trim().toLowerCase() === "fax";
      const maxAttempts = await loadCampaignMaxAttempts(tx, lead.campaignId);
      const dropStatus = fax
        ? LEAD_STATUS.FAILED
        : resolveRetryableLeadStatus(lead.attempts, maxAttempts);
      const [dropped] = await tx
        .update(schema.outboundLeads)
        .set({
          callId: callSid,
          status: dropStatus,
          lastCalledAt: now,
          lastContactSummary: telemarketing
            ? "Answering machine detected; no marketing voicemail was left (47 CFR 64.1200(b)(3))."
            : "Fax or machine detected; the native voice bridge was not started.",
          metadata: { ...metadata, native_voice: amdNativeVoice },
        })
        .where(
          and(
            eq(schema.outboundLeads.id, lead.id),
            eq(schema.outboundLeads.userId, lead.userId),
            inArray(schema.outboundLeads.status, ACTIVE_LEAD_STATUSES),
          ),
        )
        .returning({ id: schema.outboundLeads.id });
      if (!dropped) throw AppError.conflict("Outbound bridge could not claim this lead.");
      return { kind: "drop", answeredBy };
    }

    if (amdAction === "voicemail") {
      amdNativeVoice.state = "voicemail_left";
      amdNativeVoice.amd_completed_at = now.toISOString();
      const [left] = await tx
        .update(schema.outboundLeads)
        .set({
          callId: callSid,
          status: voicemailMessage ? LEAD_STATUS.VOICEMAIL_LEFT : LEAD_STATUS.FAILED,
          lastCalledAt: now,
          lastContactSummary: voicemailMessage
            ? "Left a deterministic identity and callback voicemail. No call context was disclosed."
            : "Answering machine detected; no voicemail was left.",
          metadata: { ...metadata, native_voice: amdNativeVoice },
        })
        .where(
          and(
            eq(schema.outboundLeads.id, lead.id),
            eq(schema.outboundLeads.userId, lead.userId),
            inArray(schema.outboundLeads.status, ACTIVE_LEAD_STATUSES),
          ),
        )
        .returning({ id: schema.outboundLeads.id });
      if (!left) throw AppError.conflict("Outbound bridge could not claim this lead.");
      return { kind: "voicemail", answeredBy, message: voicemailMessage };
    }

    amdNativeVoice.state = "bridging";
    amdNativeVoice.bridge_served_at = now.toISOString();
    const [claimed] = await tx
      .update(schema.outboundLeads)
      .set({
        callId: callSid,
        status: LEAD_STATUS.CONNECTED,
        lastCalledAt: now,
        metadata: { ...metadata, native_voice: amdNativeVoice },
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

    return {
      kind: "bridge",
      callerId,
      sipUri: buildXAIOutboundSipUri(callerId, token),
    };
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
    const answeredBy = answeredByFromRequest(req);
    if (!token || !callSid) {
      res.status(400).send(emptyTwiml());
      return;
    }

    try {
      const decision = await resolveBridgeContext(token, callSid, answeredBy);
      if (decision.kind === "drop") {
        log.info("Native outbound AMD dropped without a message", {
          callSidSuffix: callSid.slice(-8),
          answeredBy: decision.answeredBy || "unknown",
        });
        res.status(200).send(emptyTwiml());
        return;
      }
      if (decision.kind === "voicemail") {
        log.info("Native outbound AMD leaving identity voicemail", {
          callSidSuffix: callSid.slice(-8),
          answeredBy: decision.answeredBy || "unknown",
          messageChars: decision.message.length,
        });
        res.status(200).send(voicemailTwiml(decision.message));
        return;
      }
      res.status(200).send(bridgeTwiml({ callerId: decision.callerId, sipUri: decision.sipUri }));
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
      if (!(IN_FLIGHT_LEAD_STATUSES as readonly string[]).includes(lead.status || "")) return;

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
        // Customer answer is not yet a live conversation: synchronous AMD may
        // still be classifying the called party. CONNECTED is reserved for the
        // SIP bridge (human/unknown) or later xAI attachment.
        if (lead.status !== LEAD_STATUS.CONNECTED) patch.status = LEAD_STATUS.DIALING;
        const answeredBy = String(req.body?.AnsweredBy || "").trim();
        if (answeredBy) nextNativeVoice.answered_by = answeredBy;
        if (!nativeVoice.xai_call_id && nativeVoice.state !== "bridging") {
          nextNativeVoice.state = "customer_answered";
        }
      } else if (isMonotonic && TERMINAL_CARRIER_FAILURES.has(carrierStatus)) {
        const maxAttempts = await loadCampaignMaxAttempts(tx, lead.campaignId);
        patch.status = resolveRetryableLeadStatus(lead.attempts, maxAttempts);
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
            inArray(schema.outboundLeads.status, IN_FLIGHT_LEAD_STATUSES),
          ),
        );
    });
    res.status(204).end();
  }),
);

export default router;
