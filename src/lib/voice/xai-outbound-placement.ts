import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import type { OutboundCallPurpose } from "../outbound-call-purpose";
import { LEAD_STATUS } from "../outbound-status";
import { drizzle } from "../server-context";
import { normalizeXAIPhoneNumber, resolveXAISipSessionMaxSeconds } from "./xai-sip-config";

const PLACEMENT_LEASE_GRACE_MS = 2 * 60 * 1_000;
const IN_FLIGHT_STATES = new Set([
  "creating",
  "accepted",
  "bridging",
  "customer_answered",
  "connected",
]);

export type NativeOutboundPlacementClaim = {
  ok: true;
  lead: typeof schema.outboundLeads.$inferSelect;
  created: boolean;
  placementId: string;
};

export type NativeOutboundPlacementFailure = {
  ok: false;
  status: number;
  error: string;
};

export type NativeOutboundPlacementResult = {
  accepted: boolean;
  callId: string | null;
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

function placementLeaseActive(nativeVoice: Record<string, unknown>, nowMs: number): boolean {
  const claimedAt = Date.parse(String(nativeVoice.placement_claimed_at || ""));
  const leaseMs = resolveXAISipSessionMaxSeconds() * 1_000 + PLACEMENT_LEASE_GRACE_MS;
  return (
    IN_FLIGHT_STATES.has(String(nativeVoice.state || "")) &&
    Number.isFinite(claimedAt) &&
    nowMs - claimedAt >= 0 &&
    nowMs - claimedAt < leaseMs
  );
}

export async function claimNativeOutboundPlacement(input: {
  userId: string;
  agentId: string;
  customerName?: string | null;
  customerNumber: string;
  context?: string | null;
  callPurpose: OutboundCallPurpose;
  leadId?: bigint | string | null;
  leadMetadata?: Record<string, unknown> | null;
}): Promise<NativeOutboundPlacementClaim | NativeOutboundPlacementFailure> {
  const requestedId = numericLeadId(input.leadId);
  if (input.leadId != null && requestedId === null) {
    return { ok: false, status: 400, error: "Invalid outbound lead." };
  }

  const placementId = randomUUID();
  const now = new Date();
  if (requestedId === null) {
    const [lead] = await drizzle
      .insert(schema.outboundLeads)
      .values({
        userId: input.userId,
        agentId: input.agentId,
        customerName: input.customerName?.trim() || null,
        customerNumber: input.customerNumber,
        context: input.context?.trim() || null,
        status: LEAD_STATUS.DIALING,
        attempts: 1,
        metadata: {
          ...asRecord(input.leadMetadata),
          native_voice: {
            provider: "twilio_xai_sip",
            call_purpose: input.callPurpose,
            placement_id: placementId,
            placement_claimed_at: now.toISOString(),
            state: "creating",
            created_at: now.toISOString(),
          },
        },
      })
      .returning();
    if (!lead) {
      return { ok: false, status: 500, error: "Outbound lead could not be created." };
    }
    return { ok: true, lead, created: true, placementId };
  }

  return drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-outbound:${String(requestedId)}`}))`,
    );
    const [lead] = await tx
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
    if (!leadPhone || leadPhone !== input.customerNumber) {
      return { ok: false as const, status: 409, error: "Lead phone number does not match." };
    }

    const metadata = asRecord(lead.metadata);
    const nativeVoice = asRecord(metadata.native_voice);
    if (placementLeaseActive(nativeVoice, now.getTime())) {
      return {
        ok: false as const,
        status: 409,
        error: "This lead already has a native voice call in progress.",
      };
    }

    const [claimed] = await tx
      .update(schema.outboundLeads)
      .set({
        agentId: input.agentId,
        customerName: input.customerName?.trim() || lead.customerName,
        context: input.context?.trim() || lead.context,
        callId: null,
        status: LEAD_STATUS.DIALING,
        metadata: {
          ...metadata,
          native_voice: {
            ...nativeVoice,
            provider: "twilio_xai_sip",
            call_purpose: input.callPurpose,
            placement_id: placementId,
            placement_claimed_at: now.toISOString(),
            state: "creating",
            do_not_retry: false,
            updated_at: now.toISOString(),
          },
        },
      })
      .where(
        and(
          eq(schema.outboundLeads.id, lead.id),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      )
      .returning();
    if (!claimed) {
      return { ok: false as const, status: 409, error: "Outbound lead claim was replaced." };
    }
    return { ok: true as const, lead: claimed, created: false, placementId };
  });
}

export async function markNativeOutboundPlacementAccepted(input: {
  userId: string;
  leadId: bigint;
  placementId: string;
  agentId: string;
  callPurpose: OutboundCallPurpose;
  callSid: string;
}): Promise<NativeOutboundPlacementResult> {
  return drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-outbound:${String(input.leadId)}`}))`,
    );
    const [lead] = await tx
      .select()
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.id, input.leadId),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      )
      .limit(1);
    if (!lead) return { accepted: false, callId: null };

    const metadata = asRecord(lead.metadata);
    const nativeVoice = asRecord(metadata.native_voice);
    if (nativeVoice.placement_id !== input.placementId) {
      return { accepted: false, callId: typeof lead.callId === "string" ? lead.callId : null };
    }
    if (lead.callId && lead.callId !== input.callSid) {
      return { accepted: false, callId: lead.callId };
    }

    const state = String(nativeVoice.state || "");
    const progressed = ["bridging", "customer_answered", "connected"].includes(state);
    const now = new Date();
    await tx
      .update(schema.outboundLeads)
      .set({
        agentId: input.agentId,
        callId: input.callSid,
        ...(lead.status === LEAD_STATUS.CONNECTED || lead.status === LEAD_STATUS.ERROR
          ? {}
          : { status: LEAD_STATUS.DIALING }),
        lastCalledAt: lead.lastCalledAt || now,
        metadata: {
          ...metadata,
          native_voice: {
            ...nativeVoice,
            provider: "twilio_xai_sip",
            twilio_call_sid: input.callSid,
            call_purpose: input.callPurpose,
            state: progressed ? state : "accepted",
            carrier_accepted_at: now.toISOString(),
            do_not_retry: false,
            updated_at: now.toISOString(),
          },
        },
      })
      .where(
        and(
          eq(schema.outboundLeads.id, lead.id),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      );
    return { accepted: true, callId: input.callSid };
  });
}

export async function markNativeOutboundPlacementFailure(input: {
  userId: string;
  leadId: bigint;
  placementId: string;
  created: boolean;
  ambiguous: boolean;
}): Promise<NativeOutboundPlacementResult> {
  return drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-outbound:${String(input.leadId)}`}))`,
    );
    const [lead] = await tx
      .select()
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.id, input.leadId),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      )
      .limit(1);
    if (!lead) return { accepted: false, callId: null };

    const metadata = asRecord(lead.metadata);
    const nativeVoice = asRecord(metadata.native_voice);
    if (nativeVoice.placement_id !== input.placementId) {
      return { accepted: false, callId: typeof lead.callId === "string" ? lead.callId : null };
    }
    const correlatedCallId =
      typeof lead.callId === "string" && /^CA[a-f0-9]{32}$/i.test(lead.callId)
        ? lead.callId
        : typeof nativeVoice.twilio_call_sid === "string" &&
            /^CA[a-f0-9]{32}$/i.test(nativeVoice.twilio_call_sid)
          ? nativeVoice.twilio_call_sid
          : null;
    if (correlatedCallId || nativeVoice.xai_call_id || nativeVoice.bridge_served_at) {
      return { accepted: true, callId: correlatedCallId };
    }

    const now = new Date();
    await tx
      .update(schema.outboundLeads)
      .set({
        ...(input.created || input.ambiguous ? { status: LEAD_STATUS.ERROR } : {}),
        ...(input.ambiguous ? { lastCalledAt: now } : {}),
        metadata: {
          ...metadata,
          native_voice: {
            ...nativeVoice,
            provider: "twilio_xai_sip",
            state: input.ambiguous ? "outcome_ambiguous" : "rejected",
            do_not_retry: input.ambiguous,
            updated_at: now.toISOString(),
          },
        },
      })
      .where(
        and(
          eq(schema.outboundLeads.id, lead.id),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      );
    return { accepted: false, callId: null };
  });
}
