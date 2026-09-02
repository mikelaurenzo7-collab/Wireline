import { and, desc, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import {
  assertExternalEntityActionAllowed,
  assertLiveExternalActionAllowed,
} from "../account-environment-policy";
import { isDncBlocked } from "../compliance";
import { isMarketingCallPurpose, type OutboundCallPurpose } from "../outbound-call-purpose";
import { drizzle, log } from "../server-context";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import { getTwilioClient } from "../twilio-service";
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

export type PlaceCallResult = {
  ok: boolean;
  status: number;
  error?: string;
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
  const customerNumber = normalizeOpenAIPhoneNumber(input.customerNumber);
  if (!customerNumber) {
    return { ok: false, status: 400, error: "Invalid phone number. Use E.164 format." };
  }
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
  const { token } = issueOpenAIOutboundToken({ leadId: lead.id, placementId });
  const telemarketing = isMarketingCallPurpose(input.callPurpose);
  const amd = nativeOutboundAmdParams(input.callPurpose);

  try {
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
      machineDetection: amd.machineDetection,
      machineDetectionTimeout: amd.machineDetectionTimeout,
    });
    const callSid = String(call.sid || "").trim();
    if (!/^CA[a-f0-9]{32}$/i.test(callSid)) {
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
    const ambiguous = isAmbiguousTwilioCallCreateError(error);
    const reconciliation = await markNativeOutboundPlacementFailure({
      userId: input.userId,
      leadId: lead.id,
      placementId,
      created,
      ambiguous,
    });
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
          status: twilioStatus(error) || 502,
          error: "The carrier rejected the outbound call request.",
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
