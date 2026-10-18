import { and, desc, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import {
  assertExternalEntityActionAllowed,
  assertLiveExternalActionAllowed,
} from "../account-environment-policy";
import { isDncBlocked } from "../compliance";
import { isMarketingCallPurpose, type OutboundCallPurpose } from "../outbound-call-purpose";
import type { LEAD_PROCESSABLE_STATUSES } from "../outbound-status";
import { drizzle, log } from "../server-context";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import { getTwilioClient } from "../twilio-service";
import { requireTenantChannel } from "../channel-entitlements";
import { AppError } from "../api-error";
import { inferStateFromPhone } from "../tcpa-consent";
import { inspectOutboundRecipientPermission } from "../recipient-voice-permission-store";
import {
  commitPlatformCostReservation,
  markPlatformCostReservationAmbiguous,
  releasePlatformCostReservation,
  reservePlatformCostRecord,
  type PlatformCostReservation,
} from "../../middleware/audit-middleware";
import {
  bindOutboundCarrierCall,
  failOutboundBeforeAcceptance,
  markOutboundProviderAttempted,
  prepareOutboundPlacementFunding,
  endCancelledOutboundPlacement,
} from "./outbound-placement-funding";
import { nativeOutboundAmdParams } from "./native-outbound-amd";
import {
  claimNativeOutboundPlacement,
  markNativeOutboundPlacementAccepted,
  markNativeOutboundPlacementFailure,
} from "./openai-outbound-placement";
import { issueOpenAIOutboundToken, openAIOutboundTokenReady } from "./openai-outbound-token";
import {
  normalizeOpenAIPhoneNumber,
  openAISipConfigured,
  twilioOpenAIOutboundBridgeUrl,
  twilioOpenAIOutboundFallbackUrl,
  twilioOpenAIOutboundStatusUrl,
} from "./openai-sip-config";

export const OUTBOUND_CALL_OUTCOME_UNCERTAIN =
  "Voice carrier unavailable after retries: outbound call outcome is uncertain.";

const STANDARD_US_CARRIER_STATES = new Set(
  "AL AZ AR CA CO CT DE DC FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  ),
);
/** Tariff scope only. An area code never proves the recipient's jurisdiction. */
export function isSupportedOutboundCarrierDestination(phone: string): boolean {
  return (
    /^\+1\d{10}$/.test(phone) && STANDARD_US_CARRIER_STATES.has(inferStateFromPhone(phone) ?? "")
  );
}

export type PlaceCallResult = {
  ok: boolean;
  status: number;
  error?: string;
  code?: string;
  callId?: string;
  leadId?: string;
  providerOutcomeAmbiguous?: boolean;
  doNotRetry?: boolean;
};

export type PlaceOutboundCallInput = {
  userId: string;
  agentId: string;
  customerName?: string | null;
  customerNumber: string;
  context?: string | null;
  callPurpose: OutboundCallPurpose;
  /** Existing tenant-owned lead for campaign/cadence/callback paths. */
  leadId?: bigint | string | null;
  /** Optional server-owned consent/source metadata for a newly-created lead. */
  leadMetadata?: Record<string, unknown> | null;
  requestKey?: string;
  consentArtifactId?: string;
  /** Server campaign's prior queue state; HTTP routes must never supply this field. */
  priorLeadStatus?: (typeof LEAD_PROCESSABLE_STATUSES)[number];
};

type TwilioFailure = {
  status?: unknown;
  code?: unknown;
  name?: unknown;
};

function twilioStatus(error: unknown): number | null {
  const raw = Number((error as TwilioFailure | null)?.status);
  return Number.isInteger(raw) && raw >= 100 && raw <= 599 ? raw : null;
}

export function isAmbiguousTwilioCallCreateError(error: unknown): boolean {
  const status = twilioStatus(error);
  if (status === null) return true;
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function ambiguousResult(leadId: bigint): PlaceCallResult {
  return {
    ok: false,
    status: 503,
    error: OUTBOUND_CALL_OUTCOME_UNCERTAIN,
    leadId: String(leadId),
    providerOutcomeAmbiguous: true,
    doNotRetry: true,
  };
}

/**
 * Twilio first rings the customer. Only after answer and synchronous AMD does
 * Twilio request signed TwiML and bridge the answered leg to OpenAI Realtime
 * over TLS SIP. The durable placement claim prevents overlapping workers from
 * double-dialing the same lead.
 */
async function placeOutboundCallAfterDeletionFence(
  input: PlaceOutboundCallInput,
): Promise<PlaceCallResult> {
  if (process.env.BOTBOUND_GENERAL_OUTBOUND_ENABLED !== "true")
    return {
      ok: false,
      status: 503,
      code: "OUTBOUND_UNAVAILABLE",
      error: "Calling is temporarily unavailable. Please try again later.",
    };
  const customerNumber = normalizeOpenAIPhoneNumber(input.customerNumber);
  if (!customerNumber) {
    return { ok: false, status: 400, error: "Invalid phone number. Use E.164 format." };
  }
  if (!isSupportedOutboundCarrierDestination(customerNumber))
    return {
      ok: false,
      status: 422,
      code: "OUTBOUND_DESTINATION_UNSUPPORTED",
      error: "Calling to this destination is not supported.",
    };
  await requireTenantChannel(input.userId, "voice");
  if (!openAIOutboundTokenReady() || !openAISipConfigured()) {
    return { ok: false, status: 503, error: "BotBound calling is temporarily unavailable." };
  }
  const twilio = getTwilioClient();
  if (!twilio) {
    return { ok: false, status: 503, error: "BotBound calling is temporarily unavailable." };
  }

  const [[settings], [agent], [line]] = await Promise.all([
    drizzle
      .select({ subscriptionStatus: schema.settings.subscriptionStatus })
      .from(schema.settings)
      .where(eq(schema.settings.userId, input.userId))
      .limit(1),
    drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
      .limit(1),
    drizzle
      .select({
        phoneNumber: schema.phoneNumbers.phoneNumber,
        carrierNumberId: schema.phoneNumbers.vapiNumberId,
      })
      .from(schema.phoneNumbers)
      .where(
        and(
          eq(schema.phoneNumbers.userId, input.userId),
          eq(schema.phoneNumbers.agentId, input.agentId),
        ),
      )
      .orderBy(desc(schema.phoneNumbers.createdAt), desc(schema.phoneNumbers.id))
      .limit(1),
  ]);

  if (settings?.subscriptionStatus !== "active") {
    return { ok: false, status: 403, error: "Upgrade your billing plan to place outbound calls." };
  }
  if (!agent) return { ok: false, status: 404, error: "Bot not found." };
  const fromNumber = normalizeOpenAIPhoneNumber(line?.phoneNumber);
  // The legacy column is retained for append-only schema compatibility; an
  // OpenAI-native line must contain the Twilio IncomingPhoneNumber SID.
  if (!fromNumber || !/^PN[a-f0-9]{32}$/i.test(String(line?.carrierNumberId || ""))) {
    return {
      ok: false,
      status: 409,
      error: "Connect this Bot's Twilio voice line before dialing.",
    };
  }
  if (await isDncBlocked(input.userId, customerNumber)) {
    return { ok: false, status: 403, error: "This number is on the Do Not Call list." };
  }

  const claim = await claimNativeOutboundPlacement({
    ...input,
    customerNumber,
    outboundLineNumber: fromNumber,
  });
  if (!claim.ok) return claim;
  const { lead, created, placementId } = claim;
  if (claim.replayed) {
    if (lead.callId) return { ok: true, status: 200, callId: lead.callId, leadId: String(lead.id) };
    const state = (lead.metadata as { native_voice?: { state?: string } } | null)?.native_voice
      ?.state;
    return state === "rejected"
      ? {
          ok: false,
          status: 409,
          error: "This outbound request was not placed. Start a new request.",
          leadId: String(lead.id),
          doNotRetry: true,
        }
      : ambiguousResult(lead.id);
  }
  const { token } = issueOpenAIOutboundToken({ leadId: lead.id, placementId });
  const telemarketing = isMarketingCallPurpose(input.callPurpose);
  const amd = nativeOutboundAmdParams(input.callPurpose);

  let acceptedCallSid: string | null = null;
  let providerAttempted = false;
  let spend: PlatformCostReservation | undefined;
  try {
    const permission = await inspectOutboundRecipientPermission({
      userId: input.userId,
      agentId: input.agentId,
      phone: customerNumber,
      callPurpose: input.callPurpose,
      leadId: lead.id,
      artifactId: input.consentArtifactId,
      attemptId: input.requestKey ?? placementId,
    });
    const admission = await prepareOutboundPlacementFunding({
      userId: input.userId,
      agentId: input.agentId,
      leadId: lead.id,
      placementId,
      phone: customerNumber,
      from: fromNumber,
      callPurpose: input.callPurpose,
      permission,
      permissionAttemptId: input.requestKey ?? placementId,
    });
    if (permission.effectiveCallPurpose !== input.callPurpose)
      throw AppError.conflict("The permission purpose does not match this outbound request.");
    // Separate committed reservation: do not invert spend-budget and wallet locks.
    const reserved = await reservePlatformCostRecord({
      userId: input.userId,
      action: "voice.outbound.carrier",
      provider: "twilio",
      model: "bounded_us_outbound",
      costUsd: Math.ceil(admission.maxSeconds / 60) * 0.05,
      idempotencyKey: `outbound-carrier:${placementId}`,
      requestMeta: {
        surface: "native_outbound",
        funding_id: admission.canonicalCallId,
        maximum_seconds: admission.maxSeconds,
        estimate_only: true,
      },
    });
    if (!reserved.reserved) throw new Error("Outbound carrier budget could not be reserved.");
    spend = reserved.reservation;
    const remainingSeconds = Math.floor((admission.deadlineAtMs - Date.now()) / 1000);
    // The parent, not just the later SIP leg, owns the admitted duration. Reserve
    // ringing time separately so a late answer cannot restart the funding clock.
    if (remainingSeconds <= 36)
      throw new Error("Outbound admission expired before carrier dispatch.");
    await markOutboundProviderAttempted(input.userId, lead.id, placementId, remainingSeconds - 36);
    providerAttempted = true;
    const call = await twilio.calls.create({
      to: customerNumber,
      from: fromNumber,
      url: twilioOpenAIOutboundBridgeUrl(token),
      method: "POST",
      fallbackUrl: twilioOpenAIOutboundFallbackUrl(token),
      fallbackMethod: "POST",
      statusCallback: twilioOpenAIOutboundStatusUrl(token),
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      timeout: 30,
      timeLimit: remainingSeconds - 36,
      machineDetection: amd.machineDetection,
      machineDetectionTimeout: amd.machineDetectionTimeout,
    });
    const callSid = String(call.sid || "").trim();
    if (!/^CA[a-f0-9]{32}$/i.test(callSid)) {
      await markPlatformCostReservationAmbiguous(spend);
      const reconciliation = await markNativeOutboundPlacementFailure({
        userId: input.userId,
        leadId: lead.id,
        placementId,
        created,
        ambiguous: true,
      });
      if (reconciliation.accepted && reconciliation.callId) {
        return {
          ok: true,
          status: 200,
          callId: reconciliation.callId,
          leadId: String(lead.id),
        };
      }
      return ambiguousResult(lead.id);
    }
    acceptedCallSid = callSid;
    await bindOutboundCarrierCall({ userId: input.userId, leadId: lead.id, placementId, callSid });
    await commitPlatformCostReservation(spend);
    await endCancelledOutboundPlacement(input.userId, lead.id, placementId);

    const accepted = await markNativeOutboundPlacementAccepted({
      userId: input.userId,
      leadId: lead.id,
      placementId,
      agentId: input.agentId,
      callPurpose: input.callPurpose,
      callSid,
    });
    if (!accepted.accepted || (accepted.callId && accepted.callId !== callSid)) {
      log.error("OpenAI outbound call accepted but lead correlation was replaced", {
        userId: input.userId,
        agentId: input.agentId,
        leadId: String(lead.id),
        callSidSuffix: callSid.slice(-8),
      });
      return ambiguousResult(lead.id);
    }

    log.info("OpenAI outbound call accepted by Twilio", {
      userId: input.userId,
      agentId: input.agentId,
      leadId: String(lead.id),
      callSidSuffix: callSid.slice(-8),
      customerSuffix: customerNumber.slice(-4),
      telemarketing,
      machineDetection: amd.machineDetection,
    });
    return { ok: true, status: 200, callId: callSid, leadId: String(lead.id) };
  } catch (error) {
    let ambiguous =
      Boolean(acceptedCallSid) || (providerAttempted && isAmbiguousTwilioCallCreateError(error));
    if (acceptedCallSid)
      await bindOutboundCarrierCall({
        userId: input.userId,
        leadId: lead.id,
        placementId,
        callSid: acceptedCallSid,
      });
    const reconciliation = await markNativeOutboundPlacementFailure({
      userId: input.userId,
      leadId: lead.id,
      placementId,
      created,
      ambiguous,
    });
    ambiguous ||= reconciliation.accepted;
    if (spend) {
      if (ambiguous) await markPlatformCostReservationAmbiguous(spend);
      else await releasePlatformCostReservation(spend);
    }
    if (reconciliation.accepted && reconciliation.callId) {
      log.warn("Recovered accepted outbound call after ambiguous carrier response", {
        userId: input.userId,
        agentId: input.agentId,
        leadId: String(lead.id),
        callSidSuffix: reconciliation.callId.slice(-8),
      });
      return {
        ok: true,
        status: 200,
        callId: reconciliation.callId,
        leadId: String(lead.id),
      };
    }
    if (!ambiguous) await failOutboundBeforeAcceptance(input.userId, lead.id, placementId);

    log.error("OpenAI outbound call creation failed", {
      userId: input.userId,
      agentId: input.agentId,
      leadId: String(lead.id),
      ambiguous,
      providerStatus: twilioStatus(error),
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return ambiguous
      ? ambiguousResult(lead.id)
      : {
          ok: false,
          status: error instanceof AppError ? error.status : twilioStatus(error) || 502,
          error:
            error instanceof AppError
              ? error.message
              : "The carrier rejected the outbound call request.",
          leadId: String(lead.id),
        };
  }
}

/** Every Twilio call-create path crosses the durable account-deletion fence. */
export async function placeOutboundCall(input: PlaceOutboundCallInput): Promise<PlaceCallResult> {
  await assertLiveExternalActionAllowed(input.userId, "twilio_openai_outbound_call_create");
  await assertExternalEntityActionAllowed(input.userId, "twilio_openai_outbound_call_create", {
    phone: input.customerNumber,
    leadId: input.leadId,
  });
  const outcome = await runTenantProviderWorkWithDeletionFence({
    userId: input.userId,
    operation: "twilio_openai_outbound_call_create",
    ttlMs: 15 * 60_000,
    retainOnSuccess: (result) => Boolean(result.ok || result.providerOutcomeAmbiguous),
    perform: () => placeOutboundCallAfterDeletionFence(input),
  });
  return outcome.performed
    ? outcome.result
    : {
        ok: false,
        status: 409,
        error: "Outbound calling is unavailable while terminal account deletion is in progress.",
        doNotRetry: true,
      };
}
