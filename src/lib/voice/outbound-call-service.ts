import { and, desc, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { xaiPhoneBindings } from "../../db/xai-voice-schema";
import { isDncBlocked } from "../compliance";
import type { OutboundCallPurpose } from "../outbound-call-purpose";
import { drizzle, log } from "../server-context";
import { getTwilioClient } from "../twilio-service";
import { issueXAIOutboundToken, xaiOutboundTokenReady } from "./xai-outbound-token";
import {
  claimNativeOutboundPlacement,
  markNativeOutboundPlacementAccepted,
  markNativeOutboundPlacementFailure,
} from "./xai-outbound-placement";
import {
  normalizeXAIPhoneNumber,
  twilioXAIOutboundBridgeUrl,
  twilioXAIOutboundStatusUrl,
} from "./xai-sip-config";

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
 * Native outbound call entrypoint.
 *
 * Twilio first rings the customer. Only after answer does Twilio request the
 * signed bridge TwiML and connect the answered leg to the tenant's registered
 * xAI SIP number. The placement claim is durable before the carrier request,
 * so overlapping campaign/cadence/callback workers cannot double-dial a lead.
 */
export async function placeOutboundCall(
  input: PlaceOutboundCallInput,
): Promise<PlaceCallResult> {
  const customerNumber = normalizeXAIPhoneNumber(input.customerNumber);
  if (!customerNumber) {
    return { ok: false, status: 400, error: "Invalid phone number. Use E.164 format." };
  }
  if (!xaiOutboundTokenReady()) {
    return { ok: false, status: 503, error: "Native outbound calling is not configured." };
  }
  const twilio = getTwilioClient();
  if (!twilio) {
    return { ok: false, status: 503, error: "Twilio voice is not configured." };
  }

  const [[settings], [agent], [binding]] = await Promise.all([
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
      .select()
      .from(xaiPhoneBindings)
      .where(
        and(
          eq(xaiPhoneBindings.userId, input.userId),
          eq(xaiPhoneBindings.agentId, input.agentId),
          eq(xaiPhoneBindings.status, "active"),
        ),
      )
      .orderBy(desc(xaiPhoneBindings.updatedAt))
      .limit(1),
  ]);

  if (settings?.subscriptionStatus !== "active") {
    return { ok: false, status: 403, error: "Upgrade your billing plan to place outbound calls." };
  }
  if (!agent) return { ok: false, status: 404, error: "Agent not found." };
  const fromNumber = normalizeXAIPhoneNumber(binding?.phoneNumber);
  if (
    !binding?.xaiPhoneNumberId ||
    !binding.xaiWebhookId ||
    !binding.webhookSecretEncrypted ||
    !fromNumber
  ) {
    return {
      ok: false,
      status: 409,
      error: "Activate this agent's native Twilio and realtime voice line before dialing.",
    };
  }
  if (await isDncBlocked(input.userId, customerNumber)) {
    return { ok: false, status: 403, error: "This number is on the Do Not Call list." };
  }

  const claim = await claimNativeOutboundPlacement({ ...input, customerNumber });
  if (!claim.ok) return claim;
  const { lead, created, placementId } = claim;
  const { token } = issueXAIOutboundToken({ leadId: lead.id });

  try {
    const call = await twilio.calls.create({
      to: customerNumber,
      from: fromNumber,
      url: twilioXAIOutboundBridgeUrl(token),
      method: "POST",
      statusCallback: twilioXAIOutboundStatusUrl(token),
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      timeout: 30,
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
      log.error("Native outbound call accepted but lead correlation was replaced", {
        userId: input.userId,
        agentId: input.agentId,
        leadId: String(lead.id),
        callSidSuffix: callSid.slice(-8),
      });
      return ambiguousResult(lead.id);
    }

    log.info("Native outbound call accepted by Twilio", {
      userId: input.userId,
      agentId: input.agentId,
      leadId: String(lead.id),
      callSidSuffix: callSid.slice(-8),
      customerSuffix: customerNumber.slice(-4),
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

    log.error("Native outbound call creation failed", {
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
