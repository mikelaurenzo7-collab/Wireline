import { Router, type Request, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { liveExternalActionPolicy } from "../lib/account-environment-policy";
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
import {
  verifyOpenAIOutboundToken,
  openAIOutboundPlacementMatches,
} from "../lib/voice/openai-outbound-token";
import {
  buildOpenAIOutboundSipUri,
  normalizeOpenAIPhoneNumber,
  resolveOpenAISipSessionMaxSeconds,
} from "../lib/voice/openai-sip-config";
import {
  persistOpenAIOutboundTwiMLReplay,
  resolveOpenAIOutboundTwiMLReplay,
} from "../lib/voice/openai-outbound-twiml-replay";
import { trackVoiceMinutes } from "../lib/voice-usage";

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

function bridgeTwiml(input: { callerId: string; sipUri: string }): string {
  const timeLimit = resolveOpenAISipSessionMaxSeconds();
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
  return (
    CARRIER_STATUS_RANK[
      String(status || "unknown")
        .trim()
        .toLowerCase()
    ] ?? 0
  );
}

function answeredByFromRequest(req: Request): string {
  return String(req.body?.AnsweredBy || "").trim();
}

function shouldMeterUnansweredNativeVoice(nativeVoice: Record<string, unknown>): boolean {
  const amdAction = String(nativeVoice.amd_action || "");
  return (
    amdAction === "drop" ||
    amdAction === "voicemail" ||
    String(nativeVoice.state || "") === "carrier_failed"
  );
}

async function meterNativeCarrierAttempt(userId: string, callSid: string): Promise<void> {
  if (!userId || !callSid) return;
  await trackVoiceMinutes({
    userId,
    durationSeconds: 0,
    vapiCallId: `twilio:${callSid}`,
  });
}

function neverBridgedNativeVoice(nativeVoice: Record<string, unknown>): boolean {
  const amdAction = String(nativeVoice.amd_action || "");
  const state = String(nativeVoice.state || "");
  return (
    !nativeVoice.openai_call_id &&
    amdAction !== "bridge" &&
    amdAction !== "voicemail" &&
    state !== "bridging" &&
    state !== "connected" &&
    state !== "transferred"
  );
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
  | { kind: "drop"; answeredBy: string; userId: string }
  | { kind: "hangup"; userId: string; accountEnvironment: string | null };

const AMD_ERROR_CLAIM_STATUSES = [LEAD_STATUS.ERROR] as const;

async function resolveBridgeContext(
  token: string,
  callSid: string,
  answeredBy: string,
): Promise<BridgeDecision> {
  const verification = verifyOpenAIOutboundToken(token);
  if (!verification.ok) throw AppError.unauthorized("Invalid outbound bridge token.");
  const leadId = BigInt(verification.claims.leadId);

  return drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(leadId)}`}))`,
    );
    const [lead] = await tx
      .select()
      .from(schema.outboundLeads)
      .where(eq(schema.outboundLeads.id, leadId))
      .limit(1);
    if (!lead) throw AppError.notFound("Outbound lead not found.");
    if (lead.callId && lead.callId !== callSid) {
      throw AppError.forbidden("Outbound bridge call identity does not match.");
    }
    const metadata = asRecord(lead.metadata);
    const nativeVoice = asRecord(metadata.native_voice);
    if (!openAIOutboundPlacementMatches(nativeVoice, verification.claims)) {
      throw AppError.conflict("This outbound bridge belongs to an earlier placement.");
    }
    const [workspace] = await tx
      .select({ accountEnvironment: schema.settings.accountEnvironment })
      .from(schema.settings)
      .where(eq(schema.settings.userId, lead.userId))
      .limit(1);
    const environmentPolicy = liveExternalActionPolicy(workspace?.accountEnvironment);
    if (!environmentPolicy.allowed) {
      // The signed status callback remains authoritative evidence, but a
      // workspace reclassified after carrier acceptance cannot replay a
      // persisted bridge/voicemail or create new TwiML state.
      return {
        kind: "hangup",
        userId: lead.userId,
        accountEnvironment: environmentPolicy.environment,
      };
    }
    const replay = resolveOpenAIOutboundTwiMLReplay({
      nativeVoice,
      leadCallSid: lead.callId,
      callbackCallSid: callSid,
      token,
    });
    if (replay?.kind === "drop") {
      return { ...replay, userId: lead.userId };
    }
    if (replay?.kind === "voicemail") {
      // Compatibility with durable decisions written before carrier synthesis
      // was retired. Preserve that stored decision as historical evidence, but
      // never replay its message through Twilio or rewrite what previously ran.
      return { kind: "drop", answeredBy: replay.answeredBy, userId: lead.userId };
    }
    if (replay?.kind === "bridge") {
      return { kind: "bridge", callerId: replay.callerId, sipUri: replay.sipUri };
    }
    if (!lead.agentId) throw AppError.notFound("Outbound lead not found.");
    const recoverableCompletedRace =
      lead.status === LEAD_STATUS.ERROR &&
      !nativeVoice.amd_action &&
      neverBridgedNativeVoice(nativeVoice);
    if (
      !(ACTIVE_LEAD_STATUSES as readonly string[]).includes(lead.status || "") &&
      !recoverableCompletedRace
    ) {
      throw AppError.conflict("This outbound call is no longer bridgeable.");
    }
    const amdClaimStatuses = recoverableCompletedRace
      ? AMD_ERROR_CLAIM_STATUSES
      : ACTIVE_LEAD_STATUSES;

    const outboundLineNumber = normalizeOpenAIPhoneNumber(nativeVoice.outbound_line_number);
    if (!outboundLineNumber) {
      throw AppError.conflict("This outbound placement is missing its originating line.");
    }
    const [binding] = await tx
      .select()
      .from(schema.phoneNumbers)
      .where(
        and(
          eq(schema.phoneNumbers.userId, lead.userId),
          eq(schema.phoneNumbers.agentId, lead.agentId),
          eq(schema.phoneNumbers.phoneNumber, outboundLineNumber),
        ),
      )
      .limit(1);
    const callerId = normalizeOpenAIPhoneNumber(binding?.phoneNumber);
    if (!callerId || callerId !== outboundLineNumber) {
      throw AppError.serviceUnavailable("The native voice line is not active.");
    }

    const now = new Date();
    const callPurpose = nativeCallPurposeFromMetadata(nativeVoice.call_purpose);
    const telemarketing = isMarketingCallPurpose(callPurpose);
    const amdAction = resolveNativeAmdBridgeAction({ answeredBy, callPurpose });
    const effectiveAmdAction = amdAction === "voicemail" ? "drop" : amdAction;

    const amdNativeVoice: Record<string, unknown> = {
      ...nativeVoice,
      provider: "twilio_openai_realtime_sip",
      twilio_call_sid: callSid,
      call_purpose: callPurpose,
      answered_by: answeredBy || "unknown",
      amd_detected_action: amdAction,
      amd_action: effectiveAmdAction,
      updated_at: now.toISOString(),
    };

    if (amdAction === "drop" || amdAction === "voicemail") {
      amdNativeVoice.state = "amd_no_message";
      amdNativeVoice.amd_completed_at = now.toISOString();
      amdNativeVoice.twiml_replay = persistOpenAIOutboundTwiMLReplay({
        callSid,
        decision: { kind: "drop", answeredBy },
      });
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
          lastContactSummary:
            amdAction === "voicemail"
              ? "Answering machine detected; no voicemail was left because no approved OpenAI-generated fallback audio is deployed."
              : telemarketing
                ? "Answering machine detected; no marketing voicemail was left (47 CFR 64.1200(b)(3))."
                : "Fax or machine detected; the native voice bridge was not started.",
          metadata: { ...metadata, native_voice: amdNativeVoice },
        })
        .where(
          and(
            eq(schema.outboundLeads.id, lead.id),
            eq(schema.outboundLeads.userId, lead.userId),
            inArray(schema.outboundLeads.status, amdClaimStatuses),
          ),
        )
        .returning({ id: schema.outboundLeads.id });
      if (!dropped) throw AppError.conflict("Outbound bridge could not claim this lead.");
      return { kind: "drop", answeredBy, userId: lead.userId };
    }

    amdNativeVoice.state = "bridging";
    amdNativeVoice.bridge_served_at = now.toISOString();
    amdNativeVoice.twiml_replay = persistOpenAIOutboundTwiMLReplay({
      callSid,
      decision: { kind: "bridge", answeredBy, callerId },
    });
    const [claimed] = await tx
      .update(schema.outboundLeads)
      .set({
        callId: callSid,
        // Serving TwiML starts the SIP bridge; only the durable OpenAI call
        // claim proves that a live conversation exists.
        status: LEAD_STATUS.DIALING,
        lastCalledAt: now,
        metadata: { ...metadata, native_voice: amdNativeVoice },
      })
      .where(
        and(
          eq(schema.outboundLeads.id, lead.id),
          eq(schema.outboundLeads.userId, lead.userId),
          inArray(schema.outboundLeads.status, amdClaimStatuses),
        ),
      )
      .returning({ id: schema.outboundLeads.id });
    if (!claimed) throw AppError.conflict("Outbound bridge could not claim this lead.");

    return {
      kind: "bridge",
      callerId,
      sipUri: buildOpenAIOutboundSipUri(token),
    };
  });
}

router.post(
  "/api/twilio-webhook/openai-outbound-bridge",
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
      if (decision.kind === "hangup") {
        // Twilio has already accepted this carrier attempt even though a
        // reclassification now forbids any OpenAI bridge work. Preserve the
        // incurred minimum minute through the same per-CallSid idempotent
        // ledger used by AMD drop/voicemail and status reconciliation.
        await meterNativeCarrierAttempt(decision.userId, callSid);
        log.warn("Native outbound bridge hard-hung up by account environment", {
          callSidSuffix: callSid.slice(-8),
          accountEnvironment: decision.accountEnvironment ?? "missing",
        });
        res.status(200).send(emptyTwiml());
        return;
      }
      if (decision.kind === "drop") {
        await meterNativeCarrierAttempt(decision.userId, callSid);
        log.info("Native outbound AMD dropped without a message", {
          callSidSuffix: callSid.slice(-8),
          answeredBy: decision.answeredBy || "unknown",
        });
        res.status(200).send(emptyTwiml());
        return;
      }
      res.status(200).send(bridgeTwiml({ callerId: decision.callerId, sipUri: decision.sipUri }));
    } catch (error) {
      const verification = verifyOpenAIOutboundToken(token);
      if (verification.ok && error instanceof AppError && error.status === 409) {
        const leadId = BigInt(verification.claims.leadId);
        const meterOwner = await drizzle.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(leadId)}`}))`,
          );
          const [lead] = await tx
            .select({
              userId: schema.outboundLeads.userId,
              metadata: schema.outboundLeads.metadata,
            })
            .from(schema.outboundLeads)
            .where(eq(schema.outboundLeads.id, leadId))
            .limit(1);
          const nativeVoice = asRecord(asRecord(lead?.metadata).native_voice);
          return lead &&
            openAIOutboundPlacementMatches(nativeVoice, verification.claims) &&
            shouldMeterUnansweredNativeVoice(nativeVoice)
            ? lead.userId
            : null;
        });
        if (meterOwner) await meterNativeCarrierAttempt(meterOwner, callSid);
      }
      log.warn("Native outbound bridge refused", {
        callSidSuffix: callSid.slice(-8),
        errorClass: error instanceof Error ? error.name : typeof error,
      });
      res.status(error instanceof AppError ? error.status : 503).send(emptyTwiml());
    }
  }),
);

/**
 * Static, provider-authenticated last resort when the primary TwiML callback
 * cannot be served after its bounded retry budget. A fallback must never
 * create fresh customer-facing speech after the tenant's environment can no
 * longer be resolved, so every valid invocation is Hangup-only.
 */
router.post("/api/twilio-webhook/openai-outbound-fallback", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/xml");
  if (!evaluateTwilioWebhookAuth(req).ok) {
    return res.status(403).send(emptyTwiml());
  }
  const verification = verifyOpenAIOutboundToken(tokenFromRequest(req));
  if (!verification.ok || !callSidFromRequest(req)) {
    return res.status(400).send(emptyTwiml());
  }
  return res.status(200).send(emptyTwiml());
});

router.post(
  "/api/twilio-webhook/openai-outbound-status",
  asyncHandler(async (req: Request, res: Response) => {
    if (!evaluateTwilioWebhookAuth(req).ok) {
      res.status(403).end();
      return;
    }
    const token = tokenFromRequest(req);
    const callSid = callSidFromRequest(req);
    const verification = verifyOpenAIOutboundToken(token);
    if (!verification.ok || !callSid) {
      res.status(400).end();
      return;
    }

    const leadId = BigInt(verification.claims.leadId);
    const carrierStatus = String(req.body?.CallStatus || "unknown")
      .trim()
      .toLowerCase();
    const meter = await drizzle.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(leadId)}`}))`,
      );
      const [lead] = await tx
        .select()
        .from(schema.outboundLeads)
        .where(eq(schema.outboundLeads.id, leadId))
        .limit(1);
      if (!lead) return null;
      const metadata = asRecord(lead.metadata);
      const nativeVoice = asRecord(metadata.native_voice);
      if (
        !openAIOutboundPlacementMatches(nativeVoice, verification.claims) ||
        (lead.callId && lead.callId !== callSid)
      ) {
        return null;
      }
      if (!(IN_FLIGHT_LEAD_STATUSES as readonly string[]).includes(lead.status || "")) {
        return shouldMeterUnansweredNativeVoice(nativeVoice)
          ? { userId: lead.userId, callSid }
          : null;
      }

      const now = new Date();
      const previousCarrierStatus = String(nativeVoice.carrier_status || "unknown").toLowerCase();
      const isMonotonic = carrierRank(carrierStatus) >= carrierRank(previousCarrierStatus);
      const nextNativeVoice: Record<string, unknown> = {
        ...nativeVoice,
        provider: "twilio_openai_realtime_sip",
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
      let meterUnanswered = false;

      if (isMonotonic && (carrierStatus === "initiated" || carrierStatus === "ringing")) {
        if (lead.status !== LEAD_STATUS.CONNECTED) patch.status = LEAD_STATUS.DIALING;
      } else if (isMonotonic && (carrierStatus === "in-progress" || carrierStatus === "answered")) {
        // Customer answer is not yet a live conversation: synchronous AMD may
        // still be classifying the called party. CONNECTED is reserved for the
        // SIP bridge (human/unknown) or later OpenAI attachment.
        if (lead.status !== LEAD_STATUS.CONNECTED) patch.status = LEAD_STATUS.DIALING;
        const answeredBy = String(req.body?.AnsweredBy || "").trim();
        if (answeredBy) nextNativeVoice.answered_by = answeredBy;
        if (!nativeVoice.openai_call_id && nativeVoice.state !== "bridging") {
          nextNativeVoice.state = "customer_answered";
        }
      } else if (isMonotonic && TERMINAL_CARRIER_FAILURES.has(carrierStatus)) {
        nextNativeVoice.carrier_completed_at = now.toISOString();
        if (lead.status === LEAD_STATUS.CONNECTED || nativeVoice.openai_call_id) {
          // Twilio may emit a terminal customer-leg status after the call was
          // already bridged into OpenAI SIP. That callback closes the carrier leg;
          // it must not demote the live/finished conversation or create a second
          // `twilio:CallSid` usage entry beside the authoritative OpenAI call id.
          nextNativeVoice.carrier_terminal_after_bridge = carrierStatus;
        } else if (nativeVoice.state === "bridging" || nativeVoice.bridge_served_at) {
          // A terminal carrier callback can race the signed OpenAI incoming-call
          // event after TwiML is served. Preserve the placement for that late
          // attachment instead of prematurely re-queuing it.
          patch.status = LEAD_STATUS.ERROR;
          patch.lastContactSummary = "The customer leg ended before native voice was confirmed.";
          nextNativeVoice.state = "carrier_completed_without_openai_confirmation";
        } else {
          const maxAttempts = await loadCampaignMaxAttempts(tx, lead.campaignId);
          patch.status = resolveRetryableLeadStatus(lead.attempts, maxAttempts);
          patch.lastContactSummary = `Carrier outcome: ${carrierStatus}.`;
          nextNativeVoice.state = "carrier_failed";
          meterUnanswered = true;
        }
      } else if (isMonotonic && carrierStatus === "completed") {
        nextNativeVoice.carrier_completed_at = now.toISOString();
        if (!nativeVoice.openai_call_id) {
          const amdAction = String(nativeVoice.amd_action || "");
          if (amdAction === "drop") {
            // AMD already applied Retrying/Failed/Max-Attempts. Do not stamp Error.
          } else if (neverBridgedNativeVoice(nativeVoice)) {
            const maxAttempts = await loadCampaignMaxAttempts(tx, lead.campaignId);
            patch.status = resolveRetryableLeadStatus(lead.attempts, maxAttempts);
            patch.lastContactSummary = "The customer leg ended before native voice was confirmed.";
            nextNativeVoice.state = "carrier_completed_without_openai_confirmation";
          } else {
            // Bridged or identity-voicemail: keep a recoverable Error so a late
            // OpenAI attachment can still claim a live conversation.
            patch.status = LEAD_STATUS.ERROR;
            patch.lastContactSummary = "The customer leg ended before native voice was confirmed.";
            nextNativeVoice.state = "carrier_completed_without_openai_confirmation";
          }
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
      return meterUnanswered || shouldMeterUnansweredNativeVoice(nextNativeVoice)
        ? { userId: lead.userId, callSid }
        : null;
    });
    if (meter) await meterNativeCarrierAttempt(meter.userId, meter.callSid);
    res.status(204).end();
  }),
);

export default router;
