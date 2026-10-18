import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import type { OutboundCallPurpose } from "../outbound-call-purpose";
import { LEAD_STATUS } from "../outbound-status";
import { drizzle } from "../server-context";
import { normalizeOpenAIPhoneNumber, resolveOpenAISipSessionMaxSeconds } from "./openai-sip-config";
import {
  appendVoiceIdentityReceipt,
  PHONE_TEST_ID,
  phoneTestFundingId,
  readVoiceIdentityReceipt,
} from "../voice-call-identity";
import { assertOutboundPlacementResolved } from "./outbound-placement-funding";
import { AppError } from "../api-error";
import { enqueue } from "../job-queue";

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
  replayed?: boolean;
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

type DirectRequest = {
  userId: string;
  requestKey?: string;
  agentId: string;
  customerNumber: string;
  customerName?: string | null;
  context?: string | null;
  callPurpose: OutboundCallPurpose;
  consentArtifactId?: string;
};
function outboundRequestHash(input: DirectRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        agent: input.agentId,
        phone: normalizeOpenAIPhoneNumber(input.customerNumber),
        name: input.customerName?.trim() || null,
        context: input.context?.trim() || null,
        purpose: input.callPurpose,
        consentArtifactId: input.consentArtifactId ?? null,
      }),
    )
    .digest("hex");
}

/** Read-only retrieval may bypass new-dial admission; it can never dispatch a call. */
export async function readNativeOutboundRequestReplay(input: DirectRequest) {
  if (!input.requestKey || !PHONE_TEST_ID.test(input.requestKey)) return null;
  const [lead] = await drizzle
    .select()
    .from(schema.outboundLeads)
    .where(
      and(
        eq(schema.outboundLeads.userId, input.userId),
        eq(
          schema.outboundLeads.idempotencyKey,
          `native-outbound:${input.requestKey.toLowerCase()}`,
        ),
      ),
    )
    .limit(1);
  if (!lead) {
    const cancelled = await readVoiceIdentityReceipt(
      drizzle,
      input.userId,
      `voice_outbound_request_cancel:${input.requestKey.toLowerCase()}`,
    );
    if (cancelled)
      return {
        ok: false as const,
        status: 409,
        error: "This request was canceled before dispatch. Start a new request.",
        doNotRetry: true,
      };
    const retained = await readVoiceIdentityReceipt(
      drizzle,
      input.userId,
      `voice_outbound_request:${input.requestKey.toLowerCase()}`,
    );
    if (retained)
      return {
        ok: false as const,
        status: 409,
        error: "This outbound request key was already used. Start a new request.",
        doNotRetry: true,
      };
    return null;
  }
  if (asRecord(asRecord(lead.metadata).native_voice).request_hash !== outboundRequestHash(input))
    return {
      ok: false as const,
      status: 409,
      error: "This outbound request key belongs to a different request.",
      doNotRetry: true,
    };
  if (lead.callId)
    return { ok: true as const, status: 200, callId: lead.callId, leadId: String(lead.id) };
  const rejected = asRecord(asRecord(lead.metadata).native_voice).state === "rejected";
  return {
    ok: false as const,
    status: rejected ? 409 : 202,
    error: rejected
      ? "This request was not placed. Start a new request."
      : "This outbound request is being reconciled. It will not redial.",
    leadId: String(lead.id),
    doNotRetry: true,
    providerOutcomeAmbiguous: !rejected,
  };
}

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
  const leaseMs = resolveOpenAISipSessionMaxSeconds() * 1_000 + PLACEMENT_LEASE_GRACE_MS;
  return (
    IN_FLIGHT_STATES.has(String(nativeVoice.state || "")) &&
    Number.isFinite(claimedAt) &&
    nowMs - claimedAt >= 0 &&
    nowMs - claimedAt < leaseMs
  );
}

/** Wallet serialization covers new keys, legacy plans and both direct adapters. */
async function assertOutboundDestinationAvailable(
  tx: Parameters<Parameters<typeof drizzle.transaction>[0]>[0],
  input: { userId: string; agentId: string; customerNumber: string },
  excludedLeadId?: bigint,
) {
  const leads = await tx
    .select()
    .from(schema.outboundLeads)
    .where(
      and(
        eq(schema.outboundLeads.userId, input.userId),
        eq(schema.outboundLeads.agentId, input.agentId),
        sql`regexp_replace(COALESCE(${schema.outboundLeads.customerNumber}, ${schema.outboundLeads.phoneNumber}, ''), '[^0-9]', '', 'g') = ${input.customerNumber.replace(/\D/g, "")}`,
      ),
    );
  for (const lead of leads) {
    if (excludedLeadId === lead.id) continue;
    const voice = asRecord(asRecord(lead.metadata).native_voice);
    await assertOutboundPlacementResolved(tx, input.userId, voice.placement_id);
    if (
      placementLeaseActive(voice, Date.now()) ||
      voice.state === "outcome_ambiguous" ||
      (voice.do_not_retry === true && !["rejected", "completed"].includes(String(voice.state)))
    ) {
      // A terminal receipt, rather than timestamp age, retires a new attempt.
      const terminal =
        typeof voice.placement_id === "string" && PHONE_TEST_ID.test(voice.placement_id)
          ? await readVoiceIdentityReceipt(
              tx,
              input.userId,
              `voice_outbound_terminal:${phoneTestFundingId(voice.placement_id)}`,
            )
          : null;
      if (!terminal)
        throw AppError.conflict("A call to this recipient is active or awaiting reconciliation.");
    }
  }
}

export async function readNativeOutboundRequestStatus(userId: string, requestKey: string) {
  if (!PHONE_TEST_ID.test(requestKey)) throw AppError.notFound("Outbound request not found.");
  const receipt = await readVoiceIdentityReceipt(
    drizzle,
    userId,
    `voice_outbound_request:${requestKey.toLowerCase()}`,
  );
  if (!receipt) {
    const cancelled = await readVoiceIdentityReceipt(
      drizzle,
      userId,
      `voice_outbound_request_cancel:${requestKey.toLowerCase()}`,
    );
    if (
      cancelled?.refType === "voice_outbound_request_cancel" &&
      Number(cancelled.deltaUsd) === 0 &&
      asRecord(cancelled.metadata).version === 1
    )
      return { requestKey: requestKey.toLowerCase(), status: "failed", terminal: true };
    throw AppError.notFound("Outbound request not found.");
  }
  const meta = asRecord(receipt.metadata);
  const placementId = meta.placement_id;
  if (
    receipt.refType !== "voice_outbound_request" ||
    Number(receipt.deltaUsd) !== 0 ||
    meta.version !== 1 ||
    typeof placementId !== "string" ||
    !PHONE_TEST_ID.test(placementId) ||
    !/^\d+$/.test(String(meta.lead_id)) ||
    typeof meta.agent_id !== "string"
  )
    throw AppError.serviceUnavailable("The outbound request needs reconciliation.");
  const canonical = phoneTestFundingId(placementId);
  const terminal = await readVoiceIdentityReceipt(
    drizzle,
    userId,
    `voice_outbound_terminal:${canonical}`,
  );
  const carrier = await readVoiceIdentityReceipt(
    drizzle,
    userId,
    `voice_funding_phase:${canonical}:carrier`,
  );
  const dispatched = await readVoiceIdentityReceipt(
    drizzle,
    userId,
    `voice_outbound_dispatched:${canonical}`,
  );
  const providerId = asRecord(carrier?.metadata).provider_call_id;
  const callId =
    typeof providerId === "string" && /^twilio:CA[a-f0-9]{32}$/i.test(providerId)
      ? providerId.slice(7)
      : undefined;
  const failed = asRecord(terminal?.metadata).carrier_status === "not_placed";
  return {
    requestKey: requestKey.toLowerCase(),
    agentId: meta.agent_id,
    status: terminal
      ? failed
        ? "failed"
        : "completed"
      : failed
        ? "failed"
        : callId
          ? "accepted"
          : dispatched
            ? "uncertain"
            : "preparing",
    terminal: Boolean(terminal || failed),
    ...(callId ? { callId } : {}),
    leadId: String(meta.lead_id),
  };
}

/** Cancel only a provably absent request, fencing a late POST under the same wallet lock as claim. */
export async function cancelMissingNativeOutboundRequest(userId: string, requestKey: string) {
  if (!PHONE_TEST_ID.test(requestKey)) throw AppError.notFound("Outbound request not found.");
  requestKey = requestKey.toLowerCase();
  await drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
    const request = await readVoiceIdentityReceipt(
      tx,
      userId,
      `voice_outbound_request:${requestKey}`,
    );
    const [lead] = await tx
      .select()
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.userId, userId),
          eq(schema.outboundLeads.idempotencyKey, `native-outbound:${requestKey}`),
        ),
      )
      .limit(1);
    if (request || lead)
      throw AppError.conflict(
        "This request already exists. Keep its current status open while it is reconciled.",
      );
    if (
      !(await readVoiceIdentityReceipt(tx, userId, `voice_outbound_request_cancel:${requestKey}`))
    )
      await appendVoiceIdentityReceipt(tx, {
        userId,
        key: `voice_outbound_request_cancel:${requestKey}`,
        type: "voice_outbound_request_cancel",
        refId: requestKey,
        metadata: { version: 1 },
      });
  });
  return readNativeOutboundRequestStatus(userId, requestKey);
}

/**
 * Start each carrier placement with a fresh attempt record. Lead-level metadata
 * survives, but no CallSid, OpenAI id, AMD outcome, bridge marker, or TwiML replay
 * from a prior attempt may be mistaken for acceptance of the new request.
 */
export function resetNativeOutboundPlacementMetadata(
  metadata: Record<string, unknown>,
  input: {
    callPurpose: OutboundCallPurpose;
    outboundLineNumber: string;
    placementId: string;
    claimedAt: Date;
    created: boolean;
  },
): Record<string, unknown> {
  const claimedAt = input.claimedAt.toISOString();
  return {
    ...metadata,
    native_voice: {
      provider: "twilio_openai_realtime_sip",
      call_purpose: input.callPurpose,
      outbound_line_number: input.outboundLineNumber,
      placement_id: input.placementId,
      placement_claimed_at: claimedAt,
      state: "creating",
      do_not_retry: false,
      ...(input.created ? { created_at: claimedAt } : {}),
      updated_at: claimedAt,
    },
  };
}

export async function claimNativeOutboundPlacement(input: {
  userId: string;
  agentId: string;
  customerName?: string | null;
  customerNumber: string;
  outboundLineNumber: string;
  context?: string | null;
  callPurpose: OutboundCallPurpose;
  leadId?: bigint | string | null;
  leadMetadata?: Record<string, unknown> | null;
  requestKey?: string;
  consentArtifactId?: string;
}): Promise<NativeOutboundPlacementClaim | NativeOutboundPlacementFailure> {
  const requestedId = numericLeadId(input.leadId);
  if (input.leadId != null && requestedId === null) {
    return { ok: false, status: 400, error: "Invalid outbound lead." };
  }

  if (input.requestKey !== undefined && !PHONE_TEST_ID.test(input.requestKey))
    return { ok: false, status: 400, error: "A valid outbound request key is required." };
  // Public request keys dedupe a tenant request; only the server selects the
  // globally unique SIP/funding placement namespace.
  const placementId = randomUUID();
  const now = new Date();
  if (requestedId === null) {
    return drizzle.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.userId}))`);
      const requestHash = outboundRequestHash(input);
      const idempotencyKey = `native-outbound:${input.requestKey?.toLowerCase() ?? placementId}`;
      const requestReceiptKey = `voice_outbound_request:${input.requestKey?.toLowerCase() ?? placementId}`;
      if (
        await readVoiceIdentityReceipt(
          tx,
          input.userId,
          `voice_outbound_request_cancel:${input.requestKey?.toLowerCase() ?? placementId}`,
        )
      )
        return {
          ok: false as const,
          status: 409,
          error: "This request was canceled before dispatch. Start a new request.",
        };
      const [prior] = await tx
        .select()
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.userId, input.userId),
            eq(schema.outboundLeads.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (prior) {
        if (asRecord(asRecord(prior.metadata).native_voice).request_hash !== requestHash)
          return {
            ok: false as const,
            status: 409,
            error: "This outbound request key belongs to a different request.",
          };
        return {
          ok: true as const,
          lead: prior,
          created: false,
          placementId: String(asRecord(asRecord(prior.metadata).native_voice).placement_id),
          replayed: true,
        };
      }
      if (
        await readVoiceIdentityReceipt(
          tx,
          input.userId,
          `voice_outbound_attempt:${phoneTestFundingId(placementId)}`,
        )
      )
        return {
          ok: false as const,
          status: 409,
          error: "This outbound request key was already used. Start a new request.",
        };
      if (await readVoiceIdentityReceipt(tx, input.userId, requestReceiptKey))
        return {
          ok: false as const,
          status: 409,
          error: "This outbound request key was already used. Start a new request.",
        };
      await assertOutboundDestinationAvailable(tx, input);
      const metadata = resetNativeOutboundPlacementMetadata(asRecord(input.leadMetadata), {
        callPurpose: input.callPurpose,
        outboundLineNumber: input.outboundLineNumber,
        placementId,
        claimedAt: now,
        created: true,
      });
      asRecord(metadata.native_voice).request_hash = requestHash;
      const [lead] = await tx
        .insert(schema.outboundLeads)
        .values({
          userId: input.userId,
          agentId: input.agentId,
          customerName: input.customerName?.trim() || null,
          customerNumber: input.customerNumber,
          context: input.context?.trim() || null,
          status: LEAD_STATUS.DIALING,
          attempts: 1,
          idempotencyKey,
          metadata,
        })
        .returning();
      if (!lead) {
        return { ok: false, status: 500, error: "Outbound lead could not be created." };
      }
      await appendVoiceIdentityReceipt(tx, {
        userId: input.userId,
        key: requestReceiptKey,
        type: "voice_outbound_request",
        refId: input.requestKey?.toLowerCase() ?? placementId,
        metadata: {
          version: 1,
          request_hash: requestHash,
          placement_id: placementId,
          lead_id: String(lead.id),
          agent_id: input.agentId,
        },
      });
      const cleanup = await enqueue(tx, {
        userId: input.userId,
        type: "outbound_placement_reconcile",
        payload: { placementId, leadId: String(lead.id), preAdmission: true },
        runAt: new Date(now.getTime() + 60_000),
        maxAttempts: 12,
      });
      if (!cleanup.ok)
        throw AppError.serviceUnavailable("Outbound request recovery could not be scheduled.");
      return { ok: true as const, lead, created: true, placementId };
    });
  }

  return drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.userId}))`);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(requestedId)}`}))`,
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
    if (lead.source === "phone_test")
      return {
        ok: false as const,
        status: 409,
        error:
          "Phone tests cannot be redialed as outbound leads. Start a new phone test in Studio.",
      };
    if (lead.agentId && lead.agentId !== input.agentId) {
      return { ok: false as const, status: 409, error: "This lead belongs to another agent." };
    }
    const leadPhone = normalizeOpenAIPhoneNumber(lead.customerNumber || lead.phoneNumber);
    if (!leadPhone || leadPhone !== input.customerNumber) {
      return { ok: false as const, status: 409, error: "Lead phone number does not match." };
    }

    const metadata = asRecord(lead.metadata);
    const nativeVoice = asRecord(metadata.native_voice);
    await assertOutboundPlacementResolved(tx, input.userId, nativeVoice.placement_id);
    await assertOutboundDestinationAvailable(tx, input, lead.id);
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
        metadata: resetNativeOutboundPlacementMetadata(metadata, {
          callPurpose: input.callPurpose,
          outboundLineNumber: input.outboundLineNumber,
          placementId,
          claimedAt: now,
          created: false,
        }),
      })
      .where(
        and(eq(schema.outboundLeads.id, lead.id), eq(schema.outboundLeads.userId, input.userId)),
      )
      .returning();
    if (!claimed) {
      return { ok: false as const, status: 409, error: "Outbound lead claim was replaced." };
    }
    const cleanup = await enqueue(tx, {
      userId: input.userId,
      type: "outbound_placement_reconcile",
      payload: { placementId, leadId: String(claimed.id), preAdmission: true },
      runAt: new Date(now.getTime() + 60_000),
      maxAttempts: 12,
    });
    if (!cleanup.ok)
      throw AppError.serviceUnavailable("Outbound request recovery could not be scheduled.");
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
      sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(input.leadId)}`}))`,
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
            provider: "twilio_openai_realtime_sip",
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
        and(eq(schema.outboundLeads.id, lead.id), eq(schema.outboundLeads.userId, input.userId)),
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
      sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(input.leadId)}`}))`,
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
    if (correlatedCallId || nativeVoice.openai_call_id || nativeVoice.bridge_served_at) {
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
            provider: "twilio_openai_realtime_sip",
            state: input.ambiguous ? "outcome_ambiguous" : "rejected",
            do_not_retry: input.ambiguous,
            updated_at: now.toISOString(),
          },
        },
      })
      .where(
        and(eq(schema.outboundLeads.id, lead.id), eq(schema.outboundLeads.userId, input.userId)),
      );
    return { accepted: false, callId: null };
  });
}
