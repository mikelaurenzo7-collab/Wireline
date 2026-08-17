import { and, desc, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { xaiPhoneBindings } from "../../db/xai-voice-schema";
import { isDncBlocked } from "../compliance";
import type { OutboundCallPurpose } from "../outbound-call-purpose";
import { LEAD_STATUS } from "../outbound-status";
import { drizzle, log } from "../server-context";
import { getTwilioClient } from "../twilio-service";
import {
  issueXAIOutboundToken,
  xaiOutboundTokenReady,
} from "./xai-outbound-token";
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numericLeadId(value: bigint | string | null | undefined): bigint | null {
  if (typeof value === "bigint") return value;
  const candidate = String(value || "").trim();
  return /^\d+$/.test(candidate) ? BigInt(candidate) : null;
}

function twilioStatus(error: unknown): number | null {
  const raw = Number((error as TwilioFailure | null)?.status);
  return Number.isInteger(raw) && raw >= 100 && raw <= 599 ? raw : null;
}

export function isAmbiguousTwilioCallCreateError(error: unknown): boolean {
  const status = twilioStatus(error);
  if (status === null) return true;
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function resolveOwnedLead(input: PlaceOutboundCallInput) {
  const requestedId = numericLeadId(input.leadId);
  if (input.leadId != null && requestedId === null) {
    return { ok: false as const, status: 400, error: "Invalid outbound lead." };
  }

  if (requestedId !== null) {
    const [lead] = await drizzle
      .select()
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.id, requestedId),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      )
      .limit(1);
    if (!lead) return { ok: false as const, status: 404, error: "Outbound lead not found." };
    if (lead.agentId && lead.agentId !== input.agentId) {
      return { ok: false as const, status: 409, error: "This lead belongs to another agent." };
    }
    const leadPhone = normalizeXAIPhoneNumber(lead.customerNumber || lead.phoneNumber);
    const requestedPhone = normalizeXAIPhoneNumber(input.customerNumber);
    if (!leadPhone || !requestedPhone || leadPhone !== requestedPhone) {
      return { ok: false as const, status: 409, error: "Lead phone number does not match." };
    }
    return { ok: true as const, lead, created: false };
  }

  const [lead] = await drizzle
    .insert(schema.outboundLeads)
    .values({
      userId: input.userId,
      agentId: input.agentId,
      customerName: input.customerName?.trim() || null,
      customerNumber: normalizeXAIPhoneNumber(input.customerNumber),
      context: input.context?.trim() || null,
      status: LEAD_STATUS.DIALING,
      attempts: 1,
      lastCalledAt: new Date(),
      metadata: {
        ...asRecord(input.leadMetadata),
        native_voice: {
          provider: "twilio_xai_sip",
          call_purpose: input.callPurpose,
          state: "creating",
          created_at: new Date().toISOString(),
        },
      },
    })
    .returning();
  if (!lead) return { ok: false as const, status: 500, error: "Outbound lead could not be created." };
  return { ok: true as const, lead, created: true };
}

async function markPlacementFailure(input: {
  userId: string;
  lead: typeof schema.outboundLeads.$inferSelect;
  created: boolean;
  ambiguous: boolean;
}) {
  const metadata = asRecord(input.lead.metadata);
  await drizzle
    .update(schema.outboundLeads)
    .set({
      ...(input.created ? { status: LEAD_STATUS.ERROR } : {}),
      ...(input.ambiguous ? { lastCalledAt: new Date() } : {}),
      metadata: {
        ...metadata,
        native_voice: {
          ...asRecord(metadata.native_voice),
          provider: "twilio_xai_sip",
          state: input.ambiguous ? "outcome_ambiguous" : "rejected",
          do_not_retry: input.ambiguous,
          updated_at: new Date().toISOString(),
        },
      },
    })
    .where(
      and(
        eq(schema.outboundLeads.id, input.lead.id),
        eq(schema.outboundLeads.userId, input.userId),
      ),
    );
}

/**
 * Provider-neutral outbound call entrypoint.
 *
 * Twilio first rings the customer. Only after the customer answers does Twilio
 * request Wireline's signed bridge TwiML and connect the answered leg to the
 * tenant's registered xAI SIP number. No Vapi assistant, number, key, or webhook
 * participates in this path.
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
  if (
    !binding?.xaiPhoneNumberId ||
    !binding.xaiWebhookId ||
    !binding.webhookSecretEncrypted ||
    !normalizeXAIPhoneNumber(binding.phoneNumber)
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

  const leadResolution = await resolveOwnedLead({ ...input, customerNumber });
  if (!leadResolution.ok) return leadResolution;
  const { lead, created } = leadResolution;
  const { token } = issueXAIOutboundToken({ leadId: lead.id });

  try {
    const call = await twilio.calls.create({
      to: customerNumber,
      from: binding.phoneNumber,
      url: twilioXAIOutboundBridgeUrl(token),
      method: "POST",
      statusCallback: twilioXAIOutboundStatusUrl(token),
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      timeout: 30,
    });
    const callSid = String(call.sid || "").trim();
    if (!/^CA[a-f0-9]{32}$/i.test(callSid)) {
      await markPlacementFailure({ userId: input.userId, lead, created, ambiguous: true });
      return {
        ok: false,
        status: 503,
        error: OUTBOUND_CALL_OUTCOME_UNCERTAIN,
        leadId: String(lead.id),
        providerOutcomeAmbiguous: true,
        doNotRetry: true,
      };
    }

    const metadata = asRecord(lead.metadata);
    await drizzle
      .update(schema.outboundLeads)
      .set({
        agentId: input.agentId,
        callId: callSid,
        status: LEAD_STATUS.DIALING,
        metadata: {
          ...metadata,
          native_voice: {
            ...asRecord(metadata.native_voice),
            provider: "twilio_xai_sip",
            twilio_call_sid: callSid,
            call_purpose: input.callPurpose,
            state: "accepted",
            do_not_retry: false,
            updated_at: new Date().toISOString(),
          },
        },
      })
      .where(
        and(eq(schema.outboundLeads.id, lead.id), eq(schema.outboundLeads.userId, input.userId)),
      );

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
    await markPlacementFailure({ userId: input.userId, lead, created, ambiguous });
    log.error("Native outbound call creation failed", {
      userId: input.userId,
      agentId: input.agentId,
      leadId: String(lead.id),
      ambiguous,
      providerStatus: twilioStatus(error),
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return ambiguous
      ? {
          ok: false,
          status: 503,
          error: OUTBOUND_CALL_OUTCOME_UNCERTAIN,
          leadId: String(lead.id),
          providerOutcomeAmbiguous: true,
          doNotRetry: true,
        }
      : {
          ok: false,
          status: twilioStatus(error) || 502,
          error: "The carrier rejected the outbound call request.",
          leadId: String(lead.id),
        };
  }
}
