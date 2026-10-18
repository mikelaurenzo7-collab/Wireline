import { and, eq, or, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { AppError } from "../api-error";
import { enqueue } from "../job-queue";
import type { OutboundCallPurpose } from "../outbound-call-purpose";
import {
  DEFAULT_LEAD_MAX_ATTEMPTS,
  LEAD_STATUS,
  resolveRetryableLeadStatus,
} from "../outbound-status";
import {
  assertOutboundRecipientPermission,
  assertOutboundRecipientPermissionInTransaction,
} from "../recipient-voice-permission-store";
import { drizzle, tenantStore } from "../server-context";
import { getTwilioClient } from "../twilio-service";
import {
  getVoiceCallFundingInTransaction,
  releaseVoiceCallFundingInTransaction,
  reserveVoiceCallFunding,
  type VoiceCallFunding,
} from "../voice-call-funding";
import {
  appendVoiceIdentityReceipt,
  bindVoiceFundingAlias,
  PHONE_TEST_ID,
  phoneTestFundingId,
  readVoiceIdentityReceipt,
  voicePhoneFingerprint,
  type VoiceIdentityTransaction,
} from "../voice-call-identity";
import { trackVoiceMinutes } from "../voice-usage";
import { normalizeOpenAIPhoneNumber, resolveOpenAISipSessionMaxSeconds } from "./openai-sip-config";

const TERMINAL = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);
const CALL_SID = /^CA[a-f0-9]{32}$/i;
type Lead = typeof schema.outboundLeads.$inferSelect;
type Reader = Pick<typeof drizzle, "select">;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const native = (lead: Lead) => record(record(lead.metadata).native_voice);

export type OutboundPlacementAdmission = {
  canonicalCallId: string;
  maxSeconds: number;
  deadlineAtMs: number;
  funding: VoiceCallFunding | null;
};

async function lockOutboundAttempt(tx: VoiceIdentityTransaction, userId: string, leadId: bigint) {
  // Same ordering as self-phone admission: wallet, then lead. Never budget-after-wallet.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(leadId)}`}))`,
  );
  const [lead] = await tx
    .select()
    .from(schema.outboundLeads)
    .where(and(eq(schema.outboundLeads.userId, userId), eq(schema.outboundLeads.id, leadId)))
    .limit(1);
  if (!lead) throw AppError.notFound("Outbound placement not found.");
  return lead;
}

async function attemptReceipt(reader: Reader, userId: string, placementId: string) {
  const canonical = phoneTestFundingId(placementId);
  const receipt = await readVoiceIdentityReceipt(
    reader,
    userId,
    `voice_outbound_attempt:${canonical}`,
  );
  if (!receipt) return null;
  const scope = record(receipt.metadata);
  if (
    receipt.refType !== "voice_outbound_attempt" ||
    Number(receipt.deltaUsd) !== 0 ||
    scope.version !== 1 ||
    scope.canonical_call_id !== canonical ||
    !Number.isSafeInteger(scope.deadline_at_ms) ||
    Number(scope.deadline_at_ms) <= 0 ||
    !Number.isSafeInteger(scope.max_seconds) ||
    Number(scope.max_seconds) <= 0 ||
    typeof scope.agent_id !== "string" ||
    !/^\d+$/.test(String(scope.lead_id))
  )
    throw AppError.conflict("Outbound admission evidence could not be verified.");
  return scope;
}

/** A timestamp lease cannot erase a carrier attempt whose outcome is still unknown. */
export async function assertOutboundPlacementResolved(
  reader: Reader,
  userId: string,
  placementId: unknown,
): Promise<void> {
  if (typeof placementId !== "string" || !PHONE_TEST_ID.test(placementId)) return;
  const attempt = await attemptReceipt(reader, userId, placementId);
  if (attempt) {
    const canonical = phoneTestFundingId(placementId);
    const terminal = await readVoiceIdentityReceipt(
      reader,
      userId,
      `voice_outbound_terminal:${canonical}`,
    );
    const admission = await readVoiceIdentityReceipt(
      reader,
      userId,
      `voice_admission:${canonical}`,
    );
    if (
      !terminal ||
      (admission &&
        !(await readVoiceIdentityReceipt(reader, userId, `voice_completion:${canonical}`)) &&
        !(await readVoiceIdentityReceipt(reader, userId, `voice_admission_release:${canonical}`)))
    )
      throw AppError.conflict("This call is still active or awaiting carrier reconciliation.");
  }
}

/** Permission is server-resolved immediately before admission, never a lead/client boolean. */
export async function prepareOutboundPlacementFunding(input: {
  userId: string;
  agentId: string;
  leadId: bigint;
  placementId: string;
  phone: string;
  from: string;
  callPurpose: OutboundCallPurpose;
  permissionAttemptId: string;
  permission: { artifactId: string; grantHash: string; expiresAt: string };
}): Promise<OutboundPlacementAdmission> {
  return drizzle.transaction(async (tx) => {
    const lead = await lockOutboundAttempt(tx, input.userId, input.leadId);
    if (
      lead.source === "phone_test" ||
      lead.agentId !== input.agentId ||
      native(lead).placement_id !== input.placementId ||
      normalizeOpenAIPhoneNumber(lead.customerNumber || lead.phoneNumber) !== input.phone ||
      native(lead).outbound_line_number !== input.from ||
      Date.parse(input.permission.expiresAt) <= Date.now() ||
      !Number.isFinite(Date.parse(input.permission.expiresAt))
    )
      throw AppError.conflict("Outbound admission no longer matches this request.");
    const canonicalCallId = phoneTestFundingId(input.placementId);
    if (
      (await attemptReceipt(tx, input.userId, input.placementId)) ||
      (await readVoiceIdentityReceipt(tx, input.userId, `voice_admission:${canonicalCallId}`)) ||
      (await readVoiceIdentityReceipt(
        tx,
        input.userId,
        `voice_outbound_terminal:${canonicalCallId}`,
      ))
    )
      throw AppError.conflict("This outbound placement has already been admitted.");
    const funding = await reserveVoiceCallFunding(tx, {
      userId: input.userId,
      providerCallId: canonicalCallId,
      maxSeconds: resolveOpenAISipSessionMaxSeconds(),
      outboundPlacement: {
        agentId: input.agentId,
        leadId: String(input.leadId),
        phone: input.phone,
        from: input.from,
      },
    });
    const maxSeconds = funding?.maxSeconds ?? resolveOpenAISipSessionMaxSeconds();
    const deadlineAtMs = funding?.deadlineAtMs ?? Date.now() + maxSeconds * 1000;
    await appendVoiceIdentityReceipt(tx, {
      userId: input.userId,
      key: `voice_outbound_attempt:${canonicalCallId}`,
      type: "voice_outbound_attempt",
      refId: canonicalCallId,
      metadata: {
        version: 1,
        canonical_call_id: canonicalCallId,
        agent_id: input.agentId,
        lead_id: String(input.leadId),
        phone_fingerprint: voicePhoneFingerprint(input.phone),
        from_fingerprint: voicePhoneFingerprint(input.from),
        call_purpose: input.callPurpose,
        permission_artifact_id: input.permission.artifactId,
        permission_attempt_id: input.permissionAttemptId,
        permission_grant_hash: input.permission.grantHash,
        max_seconds: maxSeconds,
        deadline_at_ms: deadlineAtMs,
      },
    });
    const recovery = await enqueue(tx, {
      userId: input.userId,
      type: "outbound_placement_reconcile",
      payload: { placementId: input.placementId, leadId: String(input.leadId) },
      runAt: new Date(deadlineAtMs + 5000),
      maxAttempts: 12,
    });
    if (!recovery.ok)
      throw AppError.serviceUnavailable("Outbound recovery could not be scheduled.");
    return { canonicalCallId, maxSeconds, deadlineAtMs, funding };
  });
}

/** Commits before Calls.create. No retry worker is allowed to dial this identity again. */
export async function markOutboundProviderAttempted(
  userId: string,
  leadId: bigint,
  placementId: string,
  carrierMaxSeconds: number,
) {
  await tenantStore.run(userId, () =>
    drizzle.transaction(async (tx) => {
      const lead = await lockOutboundAttempt(tx, userId, leadId);
      const attempt = await attemptReceipt(tx, userId, placementId);
      const canonical = phoneTestFundingId(placementId);
      if (
        !attempt ||
        native(lead).placement_id !== placementId ||
        Number(attempt.deadline_at_ms) <= Date.now() ||
        !Number.isSafeInteger(carrierMaxSeconds) ||
        carrierMaxSeconds <= 0 ||
        carrierMaxSeconds > Math.floor((Number(attempt.deadline_at_ms) - Date.now()) / 1000) - 35 ||
        (await readVoiceIdentityReceipt(tx, userId, `voice_outbound_dispatched:${canonical}`)) ||
        (await readVoiceIdentityReceipt(tx, userId, `voice_outbound_terminal:${canonical}`))
      )
        throw AppError.conflict("This outbound placement cannot be dispatched again.");
      if (await readVoiceIdentityReceipt(tx, userId, `voice_outbound_cancel:${canonical}`))
        throw AppError.conflict("This outbound permission was withdrawn before dispatch.");
      const permission = await assertOutboundRecipientPermissionInTransaction(tx, {
        userId,
        agentId: String(attempt.agent_id),
        leadId,
        phone: lead.customerNumber || lead.phoneNumber || "",
        callPurpose: attempt.call_purpose as OutboundCallPurpose,
        artifactId: String(attempt.permission_artifact_id),
        attemptId: String(attempt.permission_attempt_id),
      });
      if (
        permission.grantHash !== attempt.permission_grant_hash ||
        permission.effectiveCallPurpose !== attempt.call_purpose
      )
        throw AppError.conflict("The outbound permission receipt changed before dispatch.");
      await appendVoiceIdentityReceipt(tx, {
        userId,
        key: `voice_outbound_permission:${canonical}`,
        type: "voice_outbound_permission",
        refId: canonical,
        metadata: {
          version: 1,
          permission_artifact_id: permission.artifactId,
          permission_receipt_id: permission.receiptId,
          permission_receipt_hash: permission.receiptHash,
          permission_grant_hash: permission.grantHash,
        },
      });
      await appendVoiceIdentityReceipt(tx, {
        userId,
        key: `voice_outbound_dispatched:${canonical}`,
        type: "voice_outbound_dispatched",
        refId: canonical,
        metadata: {
          version: 1,
          attempted_at: new Date().toISOString(),
          carrier_max_seconds: carrierMaxSeconds,
        },
      });
    }),
  );
}

/** Exact accepted SID survives accounting failure and callback-before-SDK races. */
export async function bindOutboundCarrierCall(input: {
  userId: string;
  leadId: bigint;
  placementId: string;
  callSid: string;
  to?: string;
  from?: string;
}): Promise<boolean> {
  return drizzle.transaction(async (tx) => {
    const lead = await lockOutboundAttempt(tx, input.userId, input.leadId);
    const attempt = await attemptReceipt(tx, input.userId, input.placementId);
    if (!attempt) return false; // Historical placements retain their original callback path.
    const canonical = phoneTestFundingId(input.placementId);
    if (
      !CALL_SID.test(input.callSid) ||
      native(lead).placement_id !== input.placementId ||
      attempt.lead_id !== String(lead.id) ||
      attempt.agent_id !== lead.agentId ||
      attempt.phone_fingerprint !==
        voicePhoneFingerprint(
          normalizeOpenAIPhoneNumber(lead.customerNumber || lead.phoneNumber) || "",
        ) ||
      attempt.from_fingerprint !==
        voicePhoneFingerprint(String(native(lead).outbound_line_number || "")) ||
      (lead.callId && lead.callId !== input.callSid) ||
      (input.to !== undefined && attempt.phone_fingerprint !== voicePhoneFingerprint(input.to)) ||
      (input.from !== undefined &&
        attempt.from_fingerprint !== voicePhoneFingerprint(input.from)) ||
      !(await readVoiceIdentityReceipt(tx, input.userId, `voice_outbound_dispatched:${canonical}`))
    )
      throw AppError.conflict("The carrier call does not match its admitted placement.");
    await bindVoiceFundingAlias(tx, {
      userId: input.userId,
      canonicalCallId: canonical,
      providerCallId: `twilio:${input.callSid}`,
      phase: "carrier",
    });
    await tx
      .update(schema.outboundLeads)
      .set({
        callId: input.callSid,
        metadata: {
          ...record(lead.metadata),
          native_voice: { ...native(lead), twilio_call_sid: input.callSid },
        },
      })
      .where(
        and(
          eq(schema.outboundLeads.userId, input.userId),
          eq(schema.outboundLeads.id, input.leadId),
        ),
      );
    return true;
  });
}

export async function failOutboundBeforeAcceptance(
  userId: string,
  leadId: bigint,
  placementId: string,
) {
  await drizzle.transaction(async (tx) => {
    const lead = await lockOutboundAttempt(tx, userId, leadId);
    const canonical = phoneTestFundingId(placementId);
    if (native(lead).placement_id !== placementId)
      throw AppError.conflict("The outbound placement identity changed.");
    if (
      lead.callId ||
      (await readVoiceIdentityReceipt(tx, userId, `voice_funding_phase:${canonical}:carrier`))
    )
      return;
    if (!(await readVoiceIdentityReceipt(tx, userId, `voice_outbound_terminal:${canonical}`)))
      await appendVoiceIdentityReceipt(tx, {
        userId,
        key: `voice_outbound_terminal:${canonical}`,
        type: "voice_outbound_terminal",
        refId: canonical,
        metadata: { version: 1, carrier_status: "not_placed", duration_seconds: 0 },
      });
    await releaseVoiceCallFundingInTransaction(tx, {
      userId,
      providerCallId: canonical,
      disposition: "definite_preaccept",
    });
  });
}

/** All parent costs and SIP usage consume the SAME admitted identity and hold. */
export async function adoptOutboundPlacementSipFunding(
  tx: VoiceIdentityTransaction,
  input: {
    userId: string;
    agentId: string;
    callId: string;
    direction?: "inbound" | "outbound";
    leadId?: bigint;
    outboundPlacementId?: string;
    callerNumber: string | null;
    calledNumber: string;
    phoneTest?: true;
  },
): Promise<VoiceCallFunding | null> {
  if (
    input.direction !== "outbound" ||
    input.phoneTest ||
    !input.leadId ||
    !input.outboundPlacementId
  )
    return null;
  const lead = await lockOutboundAttempt(tx, input.userId, input.leadId);
  const attempt = await attemptReceipt(tx, input.userId, input.outboundPlacementId);
  if (!attempt) return null;
  const canonical = phoneTestFundingId(input.outboundPlacementId);
  const phase = await readVoiceIdentityReceipt(
    tx,
    input.userId,
    `voice_funding_phase:${canonical}:carrier`,
  );
  if (
    lead.source === "phone_test" ||
    lead.agentId !== input.agentId ||
    native(lead).placement_id !== input.outboundPlacementId ||
    attempt.agent_id !== input.agentId ||
    attempt.lead_id !== String(lead.id) ||
    attempt.phone_fingerprint !== voicePhoneFingerprint(input.callerNumber || "") ||
    attempt.from_fingerprint !== voicePhoneFingerprint(input.calledNumber) ||
    record(phase?.metadata).provider_call_id !== `twilio:${lead.callId}` ||
    Number(attempt.deadline_at_ms) <= Date.now() ||
    (await readVoiceIdentityReceipt(tx, input.userId, `voice_outbound_cancel:${canonical}`)) ||
    (await readVoiceIdentityReceipt(tx, input.userId, `voice_outbound_terminal:${canonical}`))
  )
    throw AppError.conflict("The outbound carrier admission is no longer active.");
  await bindVoiceFundingAlias(tx, {
    userId: input.userId,
    canonicalCallId: canonical,
    providerCallId: `openai:${input.callId}`,
    phase: "sip",
  });
  // Legacy plans have no channel hold. Do not create a second admission for either path.
  return getVoiceCallFundingInTransaction(tx, { userId: input.userId, providerCallId: canonical });
}

/** Signed callbacks only; route validates signature/token before entering this helper. */
export async function handleFundedOutboundCarrierEvent(input: {
  userId: string;
  leadId: bigint;
  placementId: string;
  callSid: string;
  to: string;
  from: string;
  status: string;
  duration?: string;
  answeredBy?: string;
}): Promise<boolean> {
  if (!(await bindOutboundCarrierCall(input))) return false;
  const canonical = phoneTestFundingId(input.placementId);
  const terminal = TERMINAL.has(input.status);
  const seconds =
    input.duration !== undefined && /^\d+$/.test(input.duration) ? Number(input.duration) : NaN;
  if (terminal && (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 86_400))
    throw AppError.serviceUnavailable("The carrier's terminal duration is awaiting confirmation.");
  await drizzle.transaction(async (tx) => {
    const lead = await lockOutboundAttempt(tx, input.userId, input.leadId);
    if (native(lead).placement_id !== input.placementId || lead.callId !== input.callSid)
      throw AppError.conflict("The outbound carrier identity changed.");
    const answerKey = `voice_outbound_answered:${canonical}`;
    if (
      !terminal &&
      (await readVoiceIdentityReceipt(tx, input.userId, `voice_outbound_terminal:${canonical}`))
    )
      return;
    if (
      (["answered", "in-progress"].includes(input.status) || input.answeredBy) &&
      !(await readVoiceIdentityReceipt(tx, input.userId, answerKey))
    )
      await appendVoiceIdentityReceipt(tx, {
        userId: input.userId,
        key: answerKey,
        type: "voice_outbound_answered",
        refId: canonical,
        metadata: { version: 1, call_sid: input.callSid },
      });
    if (!terminal) return;
    const sipPhase = await readVoiceIdentityReceipt(
      tx,
      input.userId,
      `voice_funding_phase:${canonical}:sip`,
    );
    const answered = Boolean(
      (await readVoiceIdentityReceipt(tx, input.userId, answerKey)) ||
      sipPhase ||
      native(lead).openai_call_id ||
      native(lead).bridge_served_at ||
      native(lead).amd_action ||
      ["bridging", "connected", "customer_answered", "transferred"].includes(
        String(native(lead).state),
      ),
    );
    const unanswered = input.status !== "completed" && seconds === 0 && !answered;
    if (input.status !== "completed" && (!unanswered || seconds !== 0))
      throw AppError.conflict("The carrier's unanswered result conflicts with answer evidence.");
    const terminalKey = `voice_outbound_terminal:${canonical}`;
    const previous = await readVoiceIdentityReceipt(tx, input.userId, terminalKey);
    if (previous) {
      const prior = record(previous.metadata);
      if (
        prior.call_sid !== input.callSid ||
        prior.carrier_status !== input.status ||
        prior.duration_seconds !== seconds
      )
        throw AppError.conflict("The carrier returned conflicting terminal evidence.");
    } else
      await appendVoiceIdentityReceipt(tx, {
        userId: input.userId,
        key: terminalKey,
        type: "voice_outbound_terminal",
        refId: canonical,
        metadata: {
          version: 1,
          call_sid: input.callSid,
          carrier_status: input.status,
          duration_seconds: seconds,
          ...(unanswered ? { unanswered_confirmed: true } : {}),
        },
      });
    if (!sipPhase && !native(lead).openai_call_id)
      await tx
        .insert(schema.callLogs)
        .values({
          userId: input.userId,
          agentId: lead.agentId,
          vapiCallId: `twilio:${input.callSid}`,
          direction: "outbound",
          customerNumber: lead.customerNumber,
          durationSeconds: seconds,
          endedReason: `carrier-${input.status}`,
          outcomeTag: "unreachable",
          recordingUrl: null,
          transcript: null,
          summary: unanswered
            ? `Call was not answered (${input.status}).`
            : "The carrier call ended before a bot conversation connected.",
        })
        .onConflictDoNothing({ target: schema.callLogs.vapiCallId });
    const voice = native(lead);
    const hasConversation = Boolean(sipPhase || voice.openai_call_id);
    const bridgePending = Boolean(
      voice.bridge_served_at ||
      ["bridging", "connected", "transferred"].includes(String(voice.state)) ||
      ["bridge", "voicemail"].includes(String(voice.amd_action)),
    );
    let nextStatus = lead.status;
    let nextState = voice.state;
    if (!hasConversation) {
      if (voice.amd_action === "drop") {
        // The AMD branch already applied its retry budget or terminal fax status.
      } else if (!bridgePending) {
        let maxAttempts = DEFAULT_LEAD_MAX_ATTEMPTS;
        if (lead.campaignId) {
          const [campaign] = await tx
            .select({ maxAttempts: schema.outboundCampaigns.maxAttempts })
            .from(schema.outboundCampaigns)
            .where(
              and(
                eq(schema.outboundCampaigns.userId, input.userId),
                eq(schema.outboundCampaigns.id, lead.campaignId),
              ),
            )
            .limit(1);
          if (
            typeof campaign?.maxAttempts === "number" &&
            Number.isInteger(campaign.maxAttempts) &&
            campaign.maxAttempts > 0
          )
            maxAttempts = campaign.maxAttempts;
        }
        nextStatus = resolveRetryableLeadStatus(lead.attempts, maxAttempts);
        nextState =
          input.status === "completed"
            ? "carrier_completed_without_openai_confirmation"
            : "carrier_failed";
      } else {
        // TwiML may already be in flight to OpenAI. A late SIP attachment owns
        // that conversation; do not queue a replacement call beside it.
        nextStatus = LEAD_STATUS.ERROR;
        nextState = "carrier_completed_without_openai_confirmation";
      }
    }
    await tx
      .update(schema.outboundLeads)
      .set({
        ...(hasConversation ? {} : { status: nextStatus }),
        metadata: {
          ...record(lead.metadata),
          native_voice: {
            ...voice,
            state: nextState,
            carrier_status: input.status,
            carrier_completed_at: new Date().toISOString(),
            // A new attempt still requires fresh permission/funding. Only an
            // authoritative terminal result can restore the existing dialer policy.
            do_not_retry: hasConversation || nextStatus !== LEAD_STATUS.RETRYING,
          },
        },
      })
      .where(
        and(
          eq(schema.outboundLeads.userId, input.userId),
          eq(schema.outboundLeads.id, input.leadId),
        ),
      );
    if (unanswered)
      await releaseVoiceCallFundingInTransaction(tx, {
        userId: input.userId,
        providerCallId: canonical,
        disposition: "confirmed_unanswered",
      });
  });
  if (terminal)
    await trackVoiceMinutes({
      userId: input.userId,
      vapiCallId: canonical,
      durationSeconds: seconds,
    });
  return true;
}

export async function outboundPlacementRemainingSeconds(
  userId: string,
  placementId: string,
): Promise<number | null> {
  const attempt = await attemptReceipt(drizzle, userId, placementId);
  if (!attempt) return null;
  const remaining = Math.floor((Number(attempt.deadline_at_ms) - Date.now()) / 1000);
  if (
    remaining <= 0 ||
    (await readVoiceIdentityReceipt(
      drizzle,
      userId,
      `voice_outbound_terminal:${phoneTestFundingId(placementId)}`,
    ))
  )
    throw AppError.conflict("The admitted outbound duration has ended.");
  return remaining;
}

/** Fresh grant/revocation check before serving signed SIP bridge TwiML. */
export async function assertOutboundBridgePermission(
  userId: string,
  leadId: bigint,
  placementId: string,
) {
  const attempt = await attemptReceipt(drizzle, userId, placementId);
  if (!attempt) return;
  if (
    await readVoiceIdentityReceipt(
      drizzle,
      userId,
      `voice_outbound_cancel:${phoneTestFundingId(placementId)}`,
    )
  )
    throw AppError.forbidden("This outbound permission was withdrawn.");
  const [lead] = await drizzle
    .select()
    .from(schema.outboundLeads)
    .where(and(eq(schema.outboundLeads.userId, userId), eq(schema.outboundLeads.id, leadId)))
    .limit(1);
  if (
    !lead ||
    typeof attempt.permission_artifact_id !== "string" ||
    typeof attempt.permission_attempt_id !== "string"
  )
    throw AppError.conflict("The outbound permission evidence could not be verified.");
  const proof = await assertOutboundRecipientPermission({
    userId,
    agentId: String(attempt.agent_id),
    leadId,
    phone: lead.customerNumber || lead.phoneNumber || "",
    callPurpose: attempt.call_purpose as OutboundCallPurpose,
    artifactId: attempt.permission_artifact_id,
    attemptId: attempt.permission_attempt_id,
  });
  const claim = await readVoiceIdentityReceipt(
    drizzle,
    userId,
    `voice_outbound_permission:${phoneTestFundingId(placementId)}`,
  );
  const claimed = record(claim?.metadata);
  if (
    !claim ||
    claim.refType !== "voice_outbound_permission" ||
    Number(claim.deltaUsd) !== 0 ||
    proof.receiptId !== claimed.permission_receipt_id ||
    proof.receiptHash !== claimed.permission_receipt_hash ||
    proof.grantHash !== attempt.permission_grant_hash
  )
    throw AppError.conflict("The outbound permission receipt changed.");
}

/** Revoke first, then stop only exact immutable carrier identities. No false stop acknowledgement. */
export async function endOutboundPlacementsForPermission(
  userId: string,
  artifactId: string,
  phone?: string,
): Promise<void> {
  const attempts = await drizzle
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, userId),
        eq(schema.creditLedger.refType, "voice_outbound_attempt"),
        or(
          sql`${schema.creditLedger.metadata}->>'permission_artifact_id' = ${artifactId}`,
          phone
            ? sql`${schema.creditLedger.metadata}->>'phone_fingerprint' = ${voicePhoneFingerprint(phone)}`
            : undefined,
        ),
      ),
    );
  const pending: Array<{ placementId: string; leadId: string }> = [];
  for (const row of attempts) {
    const attempt = record(row.metadata);
    const canonical = String(attempt.canonical_call_id || "");
    if (
      !canonical.startsWith("outbound:") ||
      !PHONE_TEST_ID.test(canonical.slice(9)) ||
      !/^\d+$/.test(String(attempt.lead_id))
    )
      throw AppError.conflict("The active outbound identity needs reconciliation.");
    const placementId = canonical.slice(9);
    await drizzle.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
      if (
        !(await readVoiceIdentityReceipt(tx, userId, `voice_outbound_terminal:${canonical}`)) &&
        !(await readVoiceIdentityReceipt(tx, userId, `voice_outbound_cancel:${canonical}`))
      )
        await appendVoiceIdentityReceipt(tx, {
          userId,
          key: `voice_outbound_cancel:${canonical}`,
          type: "voice_outbound_cancel",
          refId: canonical,
          metadata: { version: 1, reason: "recipient_permission_revoked" },
        });
    });
    pending.push({ placementId, leadId: String(attempt.lead_id) });
  }
  let failure: unknown;
  for (const payload of pending) {
    try {
      await reconcileOutboundPlacementJob({ userId, payload });
    } catch (error) {
      failure = error;
    }
  }
  if (failure) throw failure;
}

export async function endCancelledOutboundPlacement(
  userId: string,
  leadId: bigint,
  placementId: string,
) {
  if (
    await readVoiceIdentityReceipt(
      drizzle,
      userId,
      `voice_outbound_cancel:${phoneTestFundingId(placementId)}`,
    )
  )
    await reconcileOutboundPlacementJob({
      userId,
      payload: { placementId, leadId: String(leadId) },
    });
}

/** Exact immutable SID only; ambiguous create never searches by phone or redials. */
export async function reconcileOutboundPlacementJob(job: {
  userId?: string;
  user_id?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const userId = job.userId ?? job.user_id;
  const { placementId, leadId } = job.payload;
  if (
    !userId ||
    (job.userId && job.user_id && job.userId !== job.user_id) ||
    typeof placementId !== "string" ||
    !PHONE_TEST_ID.test(placementId) ||
    typeof leadId !== "string" ||
    !/^\d+$/.test(leadId)
  )
    throw new Error("Invalid outbound recovery identity.");
  await tenantStore.run(userId, async () => {
    if (job.payload.preAdmission === true) {
      await drizzle.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${leadId}`}))`,
        );
        if (await attemptReceipt(tx, userId, placementId)) return; // Its atomic deadline job now owns recovery.
        const canonical = phoneTestFundingId(placementId);
        if (await readVoiceIdentityReceipt(tx, userId, `voice_outbound_terminal:${canonical}`))
          return;
        if (
          (await readVoiceIdentityReceipt(tx, userId, `voice_outbound_dispatched:${canonical}`)) ||
          (await readVoiceIdentityReceipt(tx, userId, `voice_admission:${canonical}`)) ||
          (await readVoiceIdentityReceipt(tx, userId, `voice_funding_phase:${canonical}:carrier`))
        )
          throw AppError.conflict("The pre-admission call needs financial reconciliation.");
        const [lead] = await tx
          .select()
          .from(schema.outboundLeads)
          .where(
            and(
              eq(schema.outboundLeads.userId, userId),
              eq(schema.outboundLeads.id, BigInt(leadId)),
            ),
          )
          .limit(1);
        if (lead && native(lead).placement_id !== placementId) return;
        await appendVoiceIdentityReceipt(tx, {
          userId,
          key: `voice_outbound_terminal:${canonical}`,
          type: "voice_outbound_terminal",
          refId: canonical,
          metadata: { version: 1, carrier_status: "not_placed", duration_seconds: 0 },
        });
        if (lead)
          await tx
            .update(schema.outboundLeads)
            .set({
              status: "Error",
              metadata: {
                ...record(lead.metadata),
                native_voice: { ...native(lead), state: "rejected", do_not_retry: false },
              },
            })
            .where(
              and(
                eq(schema.outboundLeads.userId, userId),
                eq(schema.outboundLeads.id, BigInt(leadId)),
              ),
            );
      });
      return;
    }
    const attempt = await attemptReceipt(drizzle, userId, placementId);
    if (!attempt || attempt.lead_id !== leadId)
      throw AppError.conflict("Outbound recovery admission is missing.");
    const canonical = phoneTestFundingId(placementId);
    const terminal = await readVoiceIdentityReceipt(
      drizzle,
      userId,
      `voice_outbound_terminal:${canonical}`,
    );
    if (terminal) {
      if (record(terminal.metadata).carrier_status !== "not_placed")
        await trackVoiceMinutes({
          userId,
          vapiCallId: canonical,
          durationSeconds: Number(record(terminal.metadata).duration_seconds),
        });
      return;
    }
    const phase = await readVoiceIdentityReceipt(
      drizzle,
      userId,
      `voice_funding_phase:${canonical}:carrier`,
    );
    const providerId = record(phase?.metadata).provider_call_id;
    const sid =
      typeof providerId === "string" ? /^twilio:(CA[a-f0-9]{32})$/i.exec(providerId)?.[1] : null;
    if (!sid) {
      if (
        !(await readVoiceIdentityReceipt(drizzle, userId, `voice_outbound_dispatched:${canonical}`))
      ) {
        await failOutboundBeforeAcceptance(userId, BigInt(leadId), placementId);
        return;
      }
      throw AppError.serviceUnavailable(
        "The carrier outcome is uncertain; admission remains reserved and will not redial.",
      );
    }
    const client = getTwilioClient();
    if (!client) throw AppError.serviceUnavailable("Carrier recovery is temporarily unavailable.");
    const resource = client.calls(sid);
    let call = await resource.fetch();
    const matches = () =>
      call.sid === sid &&
      call.accountSid === client.accountSid &&
      call.direction === "outbound-api" &&
      voicePhoneFingerprint(call.to) === attempt.phone_fingerprint &&
      voicePhoneFingerprint(call.from) === attempt.from_fingerprint;
    if (!matches()) throw AppError.conflict("Carrier recovery returned a different call identity.");
    if (call.status === "in-progress")
      await handleFundedOutboundCarrierEvent({
        userId,
        leadId: BigInt(leadId),
        placementId,
        callSid: sid,
        to: call.to,
        from: call.from,
        status: "in-progress",
      });
    if (!TERMINAL.has(call.status)) {
      if (
        Number(attempt.deadline_at_ms) > Date.now() &&
        !(await readVoiceIdentityReceipt(drizzle, userId, `voice_outbound_cancel:${canonical}`))
      )
        throw AppError.serviceUnavailable("The outbound call is still active.");
      await resource.update({
        status: ["queued", "ringing"].includes(call.status) ? "canceled" : "completed",
      });
      call = await resource.fetch();
      if (!matches() || !TERMINAL.has(call.status))
        throw AppError.serviceUnavailable("Carrier termination is not confirmed.");
    }
    await handleFundedOutboundCarrierEvent({
      userId,
      leadId: BigInt(leadId),
      placementId,
      callSid: sid,
      to: call.to,
      from: call.from,
      status: call.status,
      // Twilio REST commonly omits duration for calls that never answered.
      // This is an exact account/SID/To/From-matched terminal lookup, not an
      // incomplete webhook. Sticky answer/SIP evidence still rejects a refund.
      duration:
        call.status !== "completed" && (call.duration === null || call.duration === "")
          ? "0"
          : call.duration,
    });
  });
}
