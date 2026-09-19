import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { AppError } from "../api-error";
import type { ToolCallContext } from "../agent-tool-types";
import { dispatchAgentToolCall } from "../agent-tool-dispatch";
import { complianceFirstMessagePrefix, formatCallbackNumberForSpeech } from "../agent-runtime";
import {
  assertExternalEntityActionAllowed,
  assertLiveExternalActionAllowed,
} from "../account-environment-policy";
import { notifyInboundCall } from "../mobile-push";
import { isMarketingCallPurpose, type OutboundCallPurpose } from "../outbound-call-purpose";
import { LEAD_STATUS } from "../outbound-status";
import { enqueuePostCallDigest, type OpenAISipFinalizationContext } from "../post-call-digest";
import { reportError } from "../error-reporter";
import { drizzle, fetchWithTimeout, log, tenantStore } from "../server-context";
import {
  buildConsentLedgerRow,
  CONSENT_RULE_VERSION,
  detectOptOut,
  getConsentRuleForPhone,
} from "../tcpa-consent";
import { persistTranscriptDncSuppression } from "../call-dnc-suppression";
import { trackVoiceMinutes } from "../voice-usage";
import { reconcileOpenAISipDurationSpend } from "../realtime-spend-reservation";
import {
  extendCommittedPlatformCostReservation,
  type PlatformCostReservation,
} from "../../middleware/audit-middleware";
import {
  type NativeInboundAdmission,
  type NativeInboundAdmissionMode,
} from "./native-inbound-admission";
import { buildOpenAIRealtimeAgentRuntime } from "./openai-phone-agent-runtime";
import {
  OPENAI_REALTIME_CALLS_URL,
  buildOpenAISipRealtimeUrl,
  normalizeOpenAIPhoneNumber,
  resolveOpenAISipSessionMaxSeconds,
} from "./openai-sip-config";
import {
  AI_DISCLOSURE_EVENTS,
  classifyAiDisclosureEvidence,
  firstAgentTranscript,
} from "./ai-disclosure-evidence";

const WS_OPEN_TIMEOUT_MS = 15_000;
const PROVIDER_REQUEST_TIMEOUT_MS = 10_000;
const TOOL_CONFIRM_TIMEOUT_MS = 20_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const MAX_MISSED_PONGS = 2;
const MAX_TRANSCRIPT_CHARS = 120_000;
const MAX_TOOL_OUTPUT_CHARS = 8_000;
const FINALIZATION_RECOVERY_GRACE_MS = 120_000;
const PRE_SESSION_CLAIM_LEASE_MS = 2 * 60_000;
const RUNNING_CLAIM_LEASE_MS = 90_000;
const RUNNING_CLAIM_HEARTBEAT_MS = 30_000;
const RUNNING_CLAIM_LOCAL_FENCE_MS = RUNNING_CLAIM_LEASE_MS - 15_000;
const IN_PROGRESS_SUMMARY = "OpenAI Realtime voice call in progress.";
const RECOVERED_SUMMARY =
  "OpenAI Realtime voice call ended before its terminal state could be persisted.";
const ACTIVE_OUTBOUND_STATUSES: readonly string[] = [
  LEAD_STATUS.PENDING,
  LEAD_STATUS.QUEUED,
  LEAD_STATUS.RETRYING,
  LEAD_STATUS.DIALING,
  LEAD_STATUS.CONNECTED,
];
const OUTBOUND_ATTACHABLE_STATUSES: readonly string[] = [
  ...ACTIVE_OUTBOUND_STATUSES,
  LEAD_STATUS.ERROR,
];

export type OpenAISipIncomingCall = {
  callId: string;
  userId: string;
  agentId: string;
  callerNumber: string | null;
  calledNumber: string;
  direction?: "inbound" | "outbound";
  leadId?: bigint;
  inboundTwilioCallSid?: string;
  outboundPlacementId?: string;
  customerName?: string | null;
  context?: string | null;
  callPurpose?: OutboundCallPurpose;
  businessName?: string | null;
  complianceMode?: string | null;
  admission?: NativeInboundAdmission;
};

export type OpenAISipCallClaim = {
  callLogId: bigint;
  recoveryJobId: string;
  ownerToken: string;
  resumed: boolean;
};

export type OpenAISipPreSessionFailure =
  | "spend_reservation_failed"
  | "provider_accept_failed"
  | "spend_commit_failed"
  | "session_start_failed";

type OpenAISipTransaction = Parameters<Parameters<typeof drizzle.transaction>[0]>[0];

type SettleOutboundLeadInput = {
  call: OpenAISipIncomingCall;
  summary: string;
  endedReason: string;
  pipelineError: string | null;
};

type PendingToolCall = {
  callId: string;
  name: string;
  arguments: unknown;
};

type RealtimeRuntime = Awaited<ReturnType<typeof buildOpenAIRealtimeAgentRuntime>>;

type RealtimeSessionOutcome = {
  endedAt: number | null;
  transcript: string;
  endedReason: string;
  pipelineError: string | null;
  connectedAt: number | null;
  toolCallsTotal: number;
  toolCallsFailed: number;
  escalationAttempted: boolean;
  escalationSucceeded: boolean;
  openingPlaybackConfirmed: boolean;
  actualOpeningTranscript: string;
};

export type OpenAITranscriptLine = {
  role: "Caller" | "Agent";
  text: string;
};

function callDirection(input: OpenAISipIncomingCall): "inbound" | "outbound" {
  return input.direction === "outbound" ? "outbound" : "inbound";
}

function providerCallId(callId: string): string {
  return `openai:${callId}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sendJson(ws: WebSocket, value: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
}

function safeJsonParse(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function safeToolArguments(value: unknown): unknown {
  if (typeof value !== "string") return value && typeof value === "object" ? value : {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function boundedToolOutput(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized.length <= MAX_TOOL_OUTPUT_CHARS
    ? serialized
    : `${serialized.slice(0, MAX_TOOL_OUTPUT_CHARS - 1)}…`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function upsertOrderedCallerTranscript(
  lines: OpenAITranscriptLine[],
  indexes: Map<string, number>,
  itemId: string,
  transcript: string,
): void {
  const normalized = transcript.trim();
  if (!normalized) return;
  const existingIndex = indexes.get(itemId);
  if (existingIndex !== undefined) {
    const existing = lines[existingIndex];
    if (existing?.role === "Caller") existing.text = normalized;
    return;
  }
  indexes.set(itemId, lines.length);
  lines.push({ role: "Caller", text: normalized });
}

export function compactOpenAITranscript(lines: OpenAITranscriptLine[]): string {
  const full = lines
    .map((line) => `${line.role}: ${line.text.trim()}`)
    .filter((line) => !line.endsWith(": "))
    .join("\n");
  return full.length <= MAX_TRANSCRIPT_CHARS
    ? full
    : `${full.slice(0, MAX_TRANSCRIPT_CHARS / 2)}\n…\n${full.slice(-MAX_TRANSCRIPT_CHARS / 2)}`;
}

function deterministicSummary(transcript: string): string {
  const compact = transcript.replace(/\s+/g, " ").trim();
  if (!compact) return "Native voice call completed without a usable transcript.";
  return compact.length <= 600 ? compact : `${compact.slice(0, 597)}…`;
}

function buildInboundOpening(input: OpenAISipIncomingCall, runtime: RealtimeRuntime): string {
  const disclosure = complianceFirstMessagePrefix(
    input.complianceMode,
    input.businessName || runtime.agentName,
    {
      // Native PSTN is always an AI assistant. Inbound sales and support
      // callers still receive identity before the saved greeting.
      outboundAiCall: true,
      recordingEnabled: false,
    },
  );
  return `${disclosure}${runtime.greeting}`.trim();
}

function buildOutboundOpening(input: OpenAISipIncomingCall, runtime: RealtimeRuntime): string {
  const purpose = input.callPurpose || "service_or_requested";
  const telemarketing = isMarketingCallPurpose(purpose);
  const disclosure = complianceFirstMessagePrefix(
    input.complianceMode,
    input.businessName || runtime.agentName,
    {
      outboundAiCall: true,
      recordingEnabled: false,
      telemarketing,
    },
  );
  const name = input.customerName?.trim();
  const identity = input.businessName?.trim()
    ? `${runtime.agentName} with ${input.businessName.trim()}`
    : runtime.agentName;
  const callbackNumberSpoken = formatCallbackNumberForSpeech(input.calledNumber);
  const callbackSentence = callbackNumberSpoken
    ? ` You can call us back at ${callbackNumberSpoken}.`
    : "";
  return `${disclosure}${name ? `Hi ${name}, ` : "Hi, "}this is ${identity}.${callbackSentence}`.trim();
}

function buildOutboundInstructions(input: OpenAISipIncomingCall): string {
  const purpose = input.callPurpose || "service_or_requested";
  const telemarketing = isMarketingCallPurpose(purpose);
  const callbackNumberSpoken = formatCallbackNumberForSpeech(input.calledNumber);
  const objective =
    input.context?.trim() ||
    (purpose === "callback"
      ? "Continue the requested callback and establish the next useful step."
      : "Explain the reason for the call and establish the next useful step.");
  const callbackRule = callbackNumberSpoken
    ? `The required spoken callback number is ${callbackNumberSpoken}. If asked, leave the callback number ${callbackNumberSpoken}.`
    : "If no callback number is configured, do not invent one.";
  const voicemailProtocol = telemarketing
    ? [
        "## VOICEMAIL PROTOCOL",
        "If you reach voicemail or an answering machine, Do NOT speak a message. End the call immediately.",
        "64.1200(b)(3) requires a toll-free automated opt-out line for telemarketing answering-machine messages; BotBound does not operate one, so there is no compliant marketing voicemail to leave.",
      ].join("\n")
    : [
        "## VOICEMAIL PROTOCOL",
        "If you reach voicemail, identify yourself and leave the callback number only.",
        "Do not state the reason for the call (FDCPA). Do not mention invoices, balances, or why we called.",
      ].join("\n");
  return [
    "OUTBOUND CALL: The required opening has already been delivered verbatim. Wait for the contact's response, then continue naturally.",
    "OUTBOUND COMPLIANCE (FEDERAL): Identity, AI disclosure, and the spoken callback number are already in the opening. Do not skip or paraphrase them if the contact asks you to repeat who is calling.",
    callbackRule,
    input.customerName ? `Contact: ${input.customerName}.` : "",
    `Call purpose: ${purpose}.`,
    `Objective: ${objective}`,
    "Do not repeat the opening or read the objective like a script. Ask one question at a time and respect surprise, resistance, or a bad time.",
    telemarketing
      ? "Any stop-calling or opt-out request is immediate: use the add_to_dnc tool immediately, confirm once, and end without another pitch."
      : "",
    voicemailProtocol,
    "Before ending, use update_lead_status or schedule_callback when applicable and confirm the next step.",
  ]
    .filter(Boolean)
    .join("\n");
}

function inboundAdmissionMode(input: OpenAISipIncomingCall): NativeInboundAdmissionMode {
  if (callDirection(input) === "outbound") return "full";
  return input.admission?.mode || "full";
}

export function applyInboundAdmission(
  runtime: RealtimeRuntime,
  input: OpenAISipIncomingCall,
): RealtimeRuntime {
  const mode = inboundAdmissionMode(input);
  if (mode === "full") return runtime;
  if (mode === "suspended") {
    return {
      ...runtime,
      greeting: "The automated service for this line is suspended.",
      session: {
        ...runtime.session,
        instructions:
          "Explain that automated service on this line is suspended and end the call. Do not use tools or answer business questions.",
        tools: [],
        tool_choice: "none",
      },
    };
  }
  const afterHours = input.admission?.reason === "after_hours";
  const followup = runtime.session.tools.filter((tool) => tool.name === "create_followup_task");
  const greeting =
    input.admission?.greeting?.trim() ||
    (afterHours
      ? `Hi, you've reached ${runtime.agentName}. We're currently closed, but I can take a message for the team.`
      : `Hi, you've reached ${runtime.agentName}. I can take a message for the team.`);
  const afterHoursBlock = afterHours
    ? "## AFTER-HOURS MODE\nThe business is currently closed. Let the caller know and collect a complete message: name, number, reason for calling, and urgency. Do NOT commit to appointments, prices, or actions that require the business to be open.\n"
    : "";
  return {
    ...runtime,
    greeting,
    session: {
      ...runtime.session,
      instructions: followup.length
        ? `${afterHoursBlock}You are a courteous, concise message-taking assistant. Collect the caller's name, callback number, reason for calling, and urgency. Read the details back once. Then use create_followup_task. Say the message was recorded and promise follow-up only if the tool explicitly confirms creation. If the tool fails, times out, or remains uncertain, say the message was not confirmed and offer another contact channel. Do not answer business questions, quote prices, book appointments, or transfer.`
        : `${afterHoursBlock}You are a courteous, concise message-taking assistant, but message persistence is unavailable. Explain that you cannot safely record or promise delivery of a message right now, suggest the caller use the business's other contact channel, and end politely. Do not collect sensitive details, answer business questions, quote prices, book appointments, or promise follow-up.`,
      tools: followup,
      tool_choice: followup.length ? "auto" : "none",
    },
  };
}

async function openaiCallControl(
  callId: string,
  action: "refer" | "hangup",
  body?: Record<string, unknown>,
): Promise<void> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OpenAI_API_KEY is missing during call control.");
  const response = await fetchWithTimeout(
    `${OPENAI_REALTIME_CALLS_URL}/${encodeURIComponent(callId)}/${action}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    PROVIDER_REQUEST_TIMEOUT_MS,
  );
  if (!response.ok) {
    // Hangup is a desired-state operation. A provider-side missing or already
    // terminal call is equivalent to success, which keeps deletion cleanup and
    // watchdog retries idempotent. REFER remains strict for the same statuses.
    if (action === "hangup" && (response.status === 404 || response.status === 409)) return;
    throw new Error(`OpenAI ${action} returned HTTP ${response.status}.`);
  }
}

// The shared worker pool has five connections. Provider control is bounded
// to two transactions so slow REFERs cannot consume every lease/accounting slot.
let activeSipControlTransactions = 0;
const sipControlWaiters: Array<() => void> = [];

async function withOpenAISipControlLock<T>(
  userId: string,
  callId: string,
  operation: (tx: OpenAISipTransaction) => Promise<T>,
): Promise<T> {
  if (activeSipControlTransactions >= 2) {
    await new Promise<void>((resolve) => sipControlWaiters.push(resolve));
  } else {
    activeSipControlTransactions += 1;
  }
  try {
    return await drizzle.transaction(async (tx) => {
      await lockOpenAISipControl(tx, userId, callId);
      return operation(tx);
    });
  } finally {
    const next = sipControlWaiters.shift();
    if (next) next();
    else activeSipControlTransactions -= 1;
  }
}

async function lockOpenAISipControl(
  tx: OpenAISipTransaction,
  userId: string,
  callId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-sip-control:${userId}:${callId}`}))`,
  );
}

async function readOpenAISipTransferStatus(
  tx: OpenAISipTransaction,
  userId: string,
  callId: string,
): Promise<string | undefined> {
  const [presence] = await tx
    .select({ status: schema.signalPresence.status })
    .from(schema.signalPresence)
    .where(
      and(
        eq(schema.signalPresence.id, providerCallId(callId)),
        eq(schema.signalPresence.userId, userId),
      ),
    )
    .limit(1);
  return presence?.status ?? undefined;
}

export async function referOpenAISipCall(
  userId: string,
  callId: string,
  destination: string,
): Promise<void> {
  const phone = normalizeOpenAIPhoneNumber(destination);
  const targetUri = phone ? `tel:${phone}` : destination.trim();
  if (!targetUri || (!targetUri.startsWith("tel:") && !targetUri.startsWith("sip:"))) {
    throw new Error("A valid PSTN or SIP transfer destination is required.");
  }

  // A call may outlive an operator's environment reclassification. Re-check
  // the tenant after any call-control lock wait and immediately before REFER.
  // Control concurrency is capped below pool capacity, leaving connections for
  // these DB-backed guards and active-call leases. Hangup remains available
  // for safe cleanup in every environment.
  await withOpenAISipControlLock(userId, callId, async (tx) => {
    const status = await readOpenAISipTransferStatus(tx, userId, callId);
    if (status === "transferred") return;
    if (!status) throw AppError.conflict("That call is no longer active.");
    await assertExternalEntityActionAllowed(userId, "openai_sip_call_refer", {
      phone: phone || undefined,
    });
    await assertLiveExternalActionAllowed(userId, "openai_sip_call_refer");
    await openaiCallControl(callId, "refer", { target_uri: targetUri });
    // Publish only confirmed REFER success. The worker may be another process;
    // its heartbeat and terminal transition read this tenant-scoped signal.
    await tx
      .update(schema.signalPresence)
      .set({ status: "transferred" })
      .where(
        and(
          eq(schema.signalPresence.id, providerCallId(callId)),
          eq(schema.signalPresence.userId, userId),
        ),
      );
  });
}

export function hangupOpenAISipCall(callId: string): Promise<void> {
  return openaiCallControl(callId, "hangup");
}

const liveSipSessions = new Map<string, { notifyTransferred: () => void }>();

/** Local fast path only; referOpenAISipCall persists the signal for remote workers first. */
export function notifyOpenAISipCallTransferred(callId: string): void {
  liveSipSessions.get(callId)?.notifyTransferred();
}

async function claimOutboundLeadInTransaction(
  tx: OpenAISipTransaction,
  input: OpenAISipIncomingCall,
): Promise<void> {
  if (callDirection(input) !== "outbound") return;
  if (!input.leadId || !input.outboundPlacementId) {
    throw AppError.conflict("The outbound call is missing its placement claim.");
  }

  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(input.leadId)}`}))`,
  );
  const [lead] = await tx
    .select({
      id: schema.outboundLeads.id,
      userId: schema.outboundLeads.userId,
      agentId: schema.outboundLeads.agentId,
      status: schema.outboundLeads.status,
      lastCalledAt: schema.outboundLeads.lastCalledAt,
      customerNumber: schema.outboundLeads.customerNumber,
      phoneNumber: schema.outboundLeads.phoneNumber,
      metadata: schema.outboundLeads.metadata,
    })
    .from(schema.outboundLeads)
    .where(
      and(eq(schema.outboundLeads.id, input.leadId), eq(schema.outboundLeads.userId, input.userId)),
    )
    .limit(1);
  if (!lead || lead.agentId !== input.agentId) {
    throw AppError.conflict("The outbound call no longer matches its Bot.");
  }
  const customerNumber = normalizeOpenAIPhoneNumber(lead.customerNumber || lead.phoneNumber);
  if (!customerNumber || customerNumber !== input.callerNumber) {
    throw AppError.conflict("The outbound contact changed before the call could attach.");
  }
  const [line] = await tx
    .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
    .from(schema.phoneNumbers)
    .where(
      and(
        eq(schema.phoneNumbers.userId, input.userId),
        eq(schema.phoneNumbers.agentId, input.agentId),
        eq(schema.phoneNumbers.phoneNumber, input.calledNumber),
      ),
    )
    .limit(1);
  if (normalizeOpenAIPhoneNumber(line?.phoneNumber) !== input.calledNumber) {
    throw AppError.conflict("The outbound Bot line changed before the call could attach.");
  }

  const metadata = asRecord(lead.metadata);
  const nativeVoice = asRecord(metadata.native_voice);
  if (String(nativeVoice.placement_id || "").trim() !== input.outboundPlacementId) {
    throw AppError.conflict("This outbound voice token belongs to an earlier placement.");
  }
  const recoverableCarrierRace =
    lead.status === LEAD_STATUS.ERROR &&
    nativeVoice.state === "carrier_completed_without_openai_confirmation";
  if (!ACTIVE_OUTBOUND_STATUSES.includes(lead.status || "") && !recoverableCarrierRace) {
    throw AppError.conflict("This outbound call is no longer attachable.");
  }

  const providerId = providerCallId(input.callId);
  const currentCallId = String(nativeVoice.openai_call_id || "").trim();
  if (currentCallId && currentCallId !== providerId) {
    throw AppError.conflict("Another OpenAI call already owns this outbound lead.");
  }

  const now = new Date();
  const [attached] = await tx
    .update(schema.outboundLeads)
    .set({
      status: LEAD_STATUS.CONNECTED,
      lastCalledAt: lead.lastCalledAt || now,
      metadata: {
        ...metadata,
        native_voice: {
          ...nativeVoice,
          provider: "twilio_openai_realtime_sip",
          openai_call_id: providerId,
          state: "connected",
          openai_attached_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
      },
    })
    .where(
      and(
        eq(schema.outboundLeads.id, lead.id),
        eq(schema.outboundLeads.userId, input.userId),
        inArray(schema.outboundLeads.status, OUTBOUND_ATTACHABLE_STATUSES),
      ),
    )
    .returning({ id: schema.outboundLeads.id });
  if (!attached) throw AppError.conflict("The outbound call attachment lost its lease.");
}

async function claimCall(input: OpenAISipIncomingCall) {
  const id = providerCallId(input.callId);
  const sourceId =
    callDirection(input) === "outbound"
      ? input.outboundPlacementId
        ? `outbound:${input.outboundPlacementId}`
        : null
      : input.inboundTwilioCallSid
        ? `twilio:${input.inboundTwilioCallSid}`
        : null;
  if (!sourceId) throw AppError.conflict("The SIP call is missing its signed source identity.");
  return drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-sip:${sourceId}`}))`);
    const [existing] = await tx
      .select({
        id: schema.callLogs.id,
        userId: schema.callLogs.userId,
        agentId: schema.callLogs.agentId,
        providerCallId: schema.callLogs.vapiCallId,
        sourceId: schema.callLogs.openaiSipSourceId,
        phase: schema.callLogs.openaiSipPhase,
        ownerToken: schema.callLogs.openaiSipOwnerToken,
        leaseExpiresAt: schema.callLogs.openaiSipLeaseExpiresAt,
        leaseExpired: sql<boolean>`${schema.callLogs.openaiSipLeaseExpiresAt} <= now()`,
      })
      .from(schema.callLogs)
      .where(
        or(eq(schema.callLogs.vapiCallId, id), eq(schema.callLogs.openaiSipSourceId, sourceId)),
      )
      .limit(1)
      .for("update");

    const ownerToken = randomUUID();
    const leaseExpiresAt = sql<Date>`now() + (${PRE_SESSION_CLAIM_LEASE_MS} * interval '1 millisecond')`;
    if (existing) {
      if (
        existing.userId !== input.userId ||
        existing.agentId !== input.agentId ||
        existing.providerCallId !== id ||
        existing.sourceId !== sourceId
      ) {
        throw AppError.conflict("This signed SIP source is already bound to another call.");
      }
      const resumable =
        (existing.phase === "claimed" || existing.phase === "running") &&
        typeof existing.ownerToken === "string" &&
        existing.leaseExpiresAt instanceof Date &&
        existing.leaseExpired === true;
      if (!resumable) return existing.phase === "claimed" ? ("retry" as const) : null;
      const [reclaimed] = await tx
        .update(schema.callLogs)
        .set({
          openaiSipPhase: "claimed",
          openaiSipOwnerToken: ownerToken,
          openaiSipLeaseExpiresAt: leaseExpiresAt,
        })
        .where(
          and(
            eq(schema.callLogs.id, existing.id),
            eq(schema.callLogs.userId, input.userId),
            inArray(schema.callLogs.openaiSipPhase, ["claimed", "running"]),
            eq(schema.callLogs.openaiSipOwnerToken, existing.ownerToken!),
            sql`${schema.callLogs.openaiSipLeaseExpiresAt} <= now()`,
          ),
        )
        .returning({ id: schema.callLogs.id });
      if (!reclaimed) return null;
      const recovery = await enqueuePostCallDigest(
        {
          userId: input.userId,
          callLogId: existing.id,
          agentId: input.agentId,
          dialedNumber: input.calledNumber,
          customerNumber: input.callerNumber,
          customerName: input.customerName,
          agentName: input.businessName,
          direction: callDirection(input),
          vapiCallType:
            callDirection(input) === "outbound" ? "openai_sip_outbound" : "openai_sip_inbound",
          vapiCallId: id,
          finalization: {
            provider: "openai_sip",
            callId: input.callId,
            leadId: input.leadId ? String(input.leadId) : null,
            openingPlaybackConfirmed: false,
            terminalStateReady: false,
          },
        },
        tx,
        {
          runAt: new Date(
            Date.now() +
              resolveOpenAISipSessionMaxSeconds() * 1_000 +
              FINALIZATION_RECOVERY_GRACE_MS,
          ),
        },
      );
      await claimOutboundLeadInTransaction(tx, input);
      return {
        callLogId: existing.id,
        recoveryJobId: recovery.jobId,
        ownerToken,
        resumed: true,
      };
    }

    const [created] = await tx
      .insert(schema.callLogs)
      .values({
        userId: input.userId,
        vapiCallId: id,
        openaiSipSourceId: sourceId,
        openaiSipPhase: "claimed",
        openaiSipOwnerToken: ownerToken,
        openaiSipLeaseExpiresAt: leaseExpiresAt,
        agentId: input.agentId,
        direction: callDirection(input),
        customerNumber: input.callerNumber,
        summary: IN_PROGRESS_SUMMARY,
        endedReason: null,
        pipelineError: null,
      })
      .returning({ id: schema.callLogs.id });
    if (!created) throw new Error("OpenAI SIP claim insert returned no row.");

    const direction = callDirection(input);
    const recovery = await enqueuePostCallDigest(
      {
        userId: input.userId,
        callLogId: created.id,
        agentId: input.agentId,
        dialedNumber: input.calledNumber,
        customerNumber: input.callerNumber,
        customerName: input.customerName,
        agentName: input.businessName,
        direction,
        vapiCallType: direction === "outbound" ? "openai_sip_outbound" : "openai_sip_inbound",
        vapiCallId: id,
        finalization: {
          provider: "openai_sip",
          callId: input.callId,
          leadId: input.leadId ? String(input.leadId) : null,
          openingPlaybackConfirmed: false,
          terminalStateReady: false,
        },
      },
      tx,
      {
        runAt: new Date(
          Date.now() + resolveOpenAISipSessionMaxSeconds() * 1_000 + FINALIZATION_RECOVERY_GRACE_MS,
        ),
      },
    );
    await claimOutboundLeadInTransaction(tx, input);
    return {
      callLogId: created.id,
      recoveryJobId: recovery.jobId,
      ownerToken,
      resumed: false,
    };
  });
}

/** Fence session startup to the current durable claim owner. */
export function markOpenAISipCallRunning(input: {
  call: OpenAISipIncomingCall;
  claim: OpenAISipCallClaim;
}): Promise<void> {
  return tenantStore.run(input.call.userId, async () => {
    const [updated] = await drizzle
      .update(schema.callLogs)
      .set({
        openaiSipPhase: "running",
        openaiSipLeaseExpiresAt: sql<Date>`now() + (${RUNNING_CLAIM_LEASE_MS} * interval '1 millisecond')`,
      })
      .where(
        and(
          eq(schema.callLogs.id, input.claim.callLogId),
          eq(schema.callLogs.userId, input.call.userId),
          eq(schema.callLogs.openaiSipPhase, "claimed"),
          eq(schema.callLogs.openaiSipOwnerToken, input.claim.ownerToken),
        ),
      )
      .returning({ id: schema.callLogs.id });
    if (!updated) throw new Error("OpenAI SIP session startup lost its durable claim lease.");
  });
}

async function renewOpenAISipCallLease(input: {
  call: OpenAISipIncomingCall;
  claim: OpenAISipCallClaim;
}): Promise<boolean> {
  const [updated] = await drizzle
    .update(schema.callLogs)
    .set({
      openaiSipLeaseExpiresAt: sql<Date>`now() + (${RUNNING_CLAIM_LEASE_MS} * interval '1 millisecond')`,
    })
    .where(
      and(
        eq(schema.callLogs.id, input.claim.callLogId),
        eq(schema.callLogs.userId, input.call.userId),
        eq(schema.callLogs.openaiSipPhase, "running"),
        eq(schema.callLogs.openaiSipOwnerToken, input.claim.ownerToken),
      ),
    )
    .returning({ id: schema.callLogs.id });
  return Boolean(updated);
}

/** Make an ambiguous provider-accept attempt immediately reclaimable by a webhook retry. */
export function releaseOpenAISipClaimForRetry(input: {
  call: OpenAISipIncomingCall;
  claim: OpenAISipCallClaim;
}): Promise<void> {
  return tenantStore.run(input.call.userId, async () => {
    const [updated] = await drizzle
      .update(schema.callLogs)
      .set({ openaiSipLeaseExpiresAt: new Date(0) })
      .where(
        and(
          eq(schema.callLogs.id, input.claim.callLogId),
          eq(schema.callLogs.userId, input.call.userId),
          eq(schema.callLogs.openaiSipPhase, "claimed"),
          eq(schema.callLogs.openaiSipOwnerToken, input.claim.ownerToken),
        ),
      )
      .returning({ id: schema.callLogs.id });
    if (!updated) throw new Error("OpenAI SIP retry release lost its durable claim lease.");
  });
}

/**
 * Establish the durable, provider-call idempotency claim before any spend is
 * reserved or the SIP call is accepted. The route is outside tenantStore, so
 * keep the tenant context ownership here beside the claim implementation.
 */
export function claimOpenAISipCall(
  input: OpenAISipIncomingCall,
): Promise<OpenAISipCallClaim | "retry" | null> {
  return tenantStore.run(input.userId, () => claimCall(input));
}

/** Settle a durable claim when BotBound intentionally ends before a session starts. */
export function settleOpenAISipPreSessionFailure(input: {
  call: OpenAISipIncomingCall;
  claim: OpenAISipCallClaim;
  reason: OpenAISipPreSessionFailure;
}): Promise<boolean> {
  return tenantStore.run(input.call.userId, () =>
    drizzle.transaction(async (tx) => {
      const now = new Date();
      const [settledCall] = await tx
        .update(schema.callLogs)
        .set({
          durationSeconds: 0,
          summary: "BotBound rejected this call before an OpenAI SIP session started.",
          outcomeTag: "unreachable",
          endedReason: "pre-session-rejected",
          pipelineError: input.reason,
          openaiSipPhase: "terminal",
          openaiSipOwnerToken: null,
          openaiSipLeaseExpiresAt: null,
        })
        .where(
          and(
            eq(schema.callLogs.id, input.claim.callLogId),
            eq(schema.callLogs.userId, input.call.userId),
            eq(schema.callLogs.openaiSipPhase, "claimed"),
            eq(schema.callLogs.openaiSipOwnerToken, input.claim.ownerToken),
          ),
        )
        .returning({ id: schema.callLogs.id });
      if (!settledCall) return false;
      const [settledRecovery] = await tx
        .update(schema.jobs)
        .set({
          status: "done",
          result: { skipped: true, reason: input.reason },
          completedAt: now,
          finishedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.jobs.id, input.claim.recoveryJobId),
            eq(schema.jobs.userId, input.call.userId),
            eq(schema.jobs.type, "post_call_digest"),
          ),
        )
        .returning({ id: schema.jobs.id });
      if (!settledRecovery) {
        throw new Error("OpenAI SIP pre-session claim could not be settled atomically.");
      }
      await settleOutboundLeadInTransaction(tx, {
        call: input.call,
        summary: "BotBound rejected this call before an OpenAI SIP session started.",
        endedReason: "pre-session-rejected",
        pipelineError: input.reason,
      });
      return true;
    }),
  );
}

async function updatePresence(input: OpenAISipIncomingCall, agentName: string) {
  const direction = callDirection(input);
  const controlToken = providerCallId(input.callId);
  await drizzle
    .insert(schema.signalPresence)
    .values({
      id: controlToken,
      userId: input.userId,
      agentId: input.agentId,
      customerNumber: input.callerNumber,
      status: "connected",
      label: `${agentName} · ${direction === "outbound" ? "Outbound" : "Live"}`,
      type: "voice",
      controlUrl: controlToken,
      startedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.signalPresence.id,
      set: {
        userId: input.userId,
        agentId: input.agentId,
        customerNumber: input.callerNumber,
        status: "connected",
        label: `${agentName} · ${direction === "outbound" ? "Outbound" : "Live"}`,
        type: "voice",
        controlUrl: controlToken,
        startedAt: new Date(),
      },
    });
}

function toolContext(input: {
  call: OpenAISipIncomingCall;
  agentName: string;
  toolCallId: string;
  abortSignal?: AbortSignal;
}): ToolCallContext {
  const direction = callDirection(input.call);
  const call = {
    id: providerCallId(input.call.callId),
    type: direction === "outbound" ? "outboundPhoneCall" : "inboundPhoneCall",
    provider: "openai",
    customer: { number: input.call.callerNumber },
    phoneNumber: { number: input.call.calledNumber },
    ...(input.call.leadId ? { leadId: String(input.call.leadId) } : {}),
  };
  return {
    toolCallId: input.toolCallId,
    payload: { call },
    message: { type: "tool-calls", call },
    agent: { id: input.call.agentId, user_id: input.call.userId },
    webhookAgentId: input.call.agentId,
    agentVoiceName: input.agentName,
    abortSignal: input.abortSignal,
    drizzle,
    log,
  };
}

async function settleOutboundLeadInTransaction(
  tx: OpenAISipTransaction,
  input: SettleOutboundLeadInput,
): Promise<void> {
  if (callDirection(input.call) !== "outbound" || !input.call.leadId) return;

  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(input.call.leadId)}`}))`,
  );
  const [lead] = await tx
    .select({
      status: schema.outboundLeads.status,
      metadata: schema.outboundLeads.metadata,
      lastContactSummary: schema.outboundLeads.lastContactSummary,
    })
    .from(schema.outboundLeads)
    .where(
      and(
        eq(schema.outboundLeads.id, input.call.leadId),
        eq(schema.outboundLeads.userId, input.call.userId),
      ),
    )
    .limit(1);
  if (!lead) return;

  const metadata = asRecord(lead.metadata);
  const nativeVoice = asRecord(metadata.native_voice);
  const providerId = providerCallId(input.call.callId);
  const currentCallId = String(nativeVoice.openai_call_id || "").trim();
  const currentlyActive = ACTIVE_OUTBOUND_STATUSES.includes(lead.status || "");
  if (currentCallId !== providerId) {
    log.warn("OpenAI SIP lead settlement skipped because another call owns the lead", {
      userId: input.call.userId,
      leadId: String(input.call.leadId),
      callId: providerId,
      currentCallId: currentCallId || null,
    });
    return;
  }
  if (
    !currentlyActive &&
    ["completed", "runtime_error", "transferred", "caller_dnc"].includes(
      String(nativeVoice.state || ""),
    )
  ) {
    return;
  }

  const now = new Date();
  const nextState =
    input.endedReason === "transferred"
      ? "transferred"
      : input.endedReason === "caller-dnc"
        ? "caller_dnc"
        : input.pipelineError
          ? "runtime_error"
          : "completed";
  const nextStatus =
    input.endedReason === "caller-dnc"
      ? LEAD_STATUS.BLOCKED_DNC
      : input.pipelineError
        ? LEAD_STATUS.ERROR
        : LEAD_STATUS.COMPLETED;

  await tx
    .update(schema.outboundLeads)
    .set({
      ...(currentlyActive ? { status: nextStatus } : {}),
      lastContactSummary: currentlyActive
        ? input.summary
        : lead.lastContactSummary || input.summary,
      lastCalledAt: now,
      metadata: {
        ...metadata,
        native_voice: {
          ...nativeVoice,
          openai_call_id: providerId,
          state: nextState,
          ended_reason: input.endedReason,
          pipeline_error: input.pipelineError,
          completed_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
      },
    })
    .where(
      and(
        eq(schema.outboundLeads.id, input.call.leadId),
        eq(schema.outboundLeads.userId, input.call.userId),
      ),
    );
}

async function settleOutboundLead(input: SettleOutboundLeadInput): Promise<void> {
  if (callDirection(input.call) !== "outbound" || !input.call.leadId) return;
  await drizzle.transaction((tx) => settleOutboundLeadInTransaction(tx, input));
}

async function runFinalizerStep(
  name: string,
  input: OpenAISipIncomingCall,
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    log.error("OpenAI Realtime call finalizer step failed", {
      step: name,
      userId: input.userId,
      agentId: input.agentId,
      callId: providerCallId(input.callId),
      errorClass: error instanceof Error ? error.name : typeof error,
    });
  }
}

async function persistAiDisclosureEvidence(input: {
  call: OpenAISipIncomingCall;
  transcript: string;
  actualOpeningTranscript: string;
  durationSeconds: number;
  openingPlaybackConfirmed: boolean;
}): Promise<void> {
  if (callDirection(input.call) !== "outbound") return;

  const callId = providerCallId(input.call.callId);
  const [existing] = await drizzle
    .select({ id: schema.consentLog.id })
    .from(schema.consentLog)
    .where(
      and(
        eq(schema.consentLog.userId, input.call.userId),
        eq(schema.consentLog.callId, callId),
        inArray(schema.consentLog.event, AI_DISCLOSURE_EVENTS),
      ),
    )
    .limit(1);
  if (existing) return;

  const disclosure = classifyAiDisclosureEvidence({
    actualOpeningTranscript: input.actualOpeningTranscript,
    openingPlaybackConfirmed: input.openingPlaybackConfirmed,
  });
  const { event, delivery } = disclosure;
  const { rule, state } = getConsentRuleForPhone(input.call.callerNumber);
  const ledgerRow = buildConsentLedgerRow({
    user_id: input.call.userId,
    call_id: callId,
    customer_number: input.call.callerNumber || "unknown",
    event,
    rule_version: CONSENT_RULE_VERSION,
    rule,
    state,
    metadata: {
      delivery,
      disclosure_kind: "ai_identity",
      opening_playback_confirmed: input.openingPlaybackConfirmed,
      ...(disclosure.evidence ? { evidence: disclosure.evidence } : {}),
    },
  });

  const inserted = await drizzle
    .insert(schema.consentLog)
    .values({
      userId: ledgerRow.user_id,
      callId: ledgerRow.call_id,
      customerNumber: ledgerRow.customer_number,
      event: ledgerRow.event,
      ruleVersion: ledgerRow.rule_version,
      rule: ledgerRow.rule,
      state: ledgerRow.state,
      metadata: ledgerRow.metadata,
    })
    .onConflictDoNothing()
    .returning({ id: schema.consentLog.id });

  // A caller turn or non-zero duration makes an unverified opening actionable;
  // a call that never carried conversation is recorded without paging.
  const carriedConversation =
    input.durationSeconds > 0 ||
    input.transcript.split("\n").some((line) => line.startsWith("Caller:"));
  if (inserted.length > 0 && event !== "ai_disclosure_played" && carriedConversation) {
    log.warn("TCPA: AI-identity disclosure could not be verified on an outbound AI call", {
      userId: input.call.userId,
      callId,
      state,
      delivery,
    });
    reportError(new Error("TCPA AI-identity disclosure unverified on outbound AI call"), {
      userId: input.call.userId,
      callId,
      state,
      rule,
      delivery,
      tags: { compliance: "tcpa_ai_disclosure_unverified" },
    });
  }
}

async function persistFinishedCall(input: {
  call: OpenAISipIncomingCall;
  callLogId: bigint;
  agentName: string;
  connectedAt: number | null;
  endedAt: number | null;
  transcript: string;
  endedReason: string;
  pipelineError: string | null;
  toolCallsTotal: number;
  toolCallsFailed: number;
  escalationAttempted: boolean;
  escalationSucceeded: boolean;
  openingPlaybackConfirmed: boolean;
  actualOpeningTranscript: string;
  claim?: OpenAISipCallClaim;
}) {
  const durationSeconds = input.connectedAt
    ? Math.max(0, Math.round(((input.endedAt ?? Date.now()) - input.connectedAt) / 1_000))
    : 0;
  const summary = deterministicSummary(input.transcript);
  const direction = callDirection(input.call);
  let endedReason = input.endedReason;

  // The terminal call row and its unique post-call job commit together. The
  // inline steps below improve latency, but the queue is the durable owner and
  // re-drives every idempotent critical step after a crash or transient error.
  await withOpenAISipControlLock(input.call.userId, input.call.callId, async (tx) => {
    const transferStatus = await readOpenAISipTransferStatus(
      tx,
      input.call.userId,
      input.call.callId,
    );
    if (transferStatus === "transferred" && endedReason !== "caller-dnc") {
      endedReason = "transferred";
    }
    const [updated] = await tx
      .update(schema.callLogs)
      .set({
        durationSeconds,
        summary,
        transcript: input.transcript || null,
        endedReason,
        pipelineError: input.pipelineError,
        toolCallsTotal: input.toolCallsTotal,
        toolCallsFailed: input.toolCallsFailed,
        // Workflow escalations can persist a successful task/notification
        // before the SIP session finishes. Merge rather than clobbering that
        // durable outcome with the session-local REFER result.
        escalationAttempted: sql<boolean>`COALESCE(${schema.callLogs.escalationAttempted}, false) OR ${input.escalationAttempted}`,
        escalationSucceeded: sql<boolean>`COALESCE(${schema.callLogs.escalationSucceeded}, false) OR ${input.escalationSucceeded}`,
        openaiSipPhase: "terminal",
        openaiSipOwnerToken: null,
        openaiSipLeaseExpiresAt: null,
      })
      .where(
        and(
          eq(schema.callLogs.id, input.callLogId),
          eq(schema.callLogs.userId, input.call.userId),
          ...(input.claim ? [eq(schema.callLogs.openaiSipOwnerToken, input.claim.ownerToken)] : []),
        ),
      )
      .returning({ id: schema.callLogs.id });
    if (!updated) throw new Error("OpenAI SIP terminal call row could not be persisted.");

    // Retire control authority atomically with terminal state, under the same
    // lock as REFER. A late mobile request cannot revive a completed session.
    await tx
      .delete(schema.signalPresence)
      .where(
        and(
          eq(schema.signalPresence.id, providerCallId(input.call.callId)),
          eq(schema.signalPresence.userId, input.call.userId),
        ),
      );

    await enqueuePostCallDigest(
      {
        userId: input.call.userId,
        callLogId: input.callLogId,
        agentId: input.call.agentId,
        dialedNumber: input.call.calledNumber,
        customerNumber: input.call.callerNumber,
        customerName: input.call.customerName,
        agentName: input.agentName,
        direction,
        durationSeconds,
        summary,
        transcript: input.transcript,
        endedReason,
        pipelineError: input.pipelineError,
        vapiCallType: direction === "outbound" ? "openai_sip_outbound" : "openai_sip_inbound",
        vapiCallId: providerCallId(input.call.callId),
        finalization: {
          provider: "openai_sip",
          callId: input.call.callId,
          leadId: input.call.leadId ? String(input.call.leadId) : null,
          openingPlaybackConfirmed: input.openingPlaybackConfirmed,
          terminalStateReady: true,
        },
      },
      tx,
      { runAt: new Date(), refreshPending: true },
    );
  });

  await runFinalizerStep("ai_disclosure", input.call, () =>
    persistAiDisclosureEvidence({
      call: input.call,
      transcript: input.transcript,
      actualOpeningTranscript: input.actualOpeningTranscript,
      durationSeconds,
      openingPlaybackConfirmed: input.openingPlaybackConfirmed,
    }),
  );

  await runFinalizerStep("transcript_dnc", input.call, async () => {
    const optOut = detectOptOut(input.transcript || "");
    if (optOut.kind !== "dnc") return;
    await persistTranscriptDncSuppression({
      userId: input.call.userId,
      callId: providerCallId(input.call.callId),
      rawCallerNumber: input.call.callerNumber || "",
      matchedPattern: optOut.matched_pattern,
    });
  });

  await runFinalizerStep("presence", input.call, () =>
    drizzle
      .delete(schema.signalPresence)
      .where(
        and(
          eq(schema.signalPresence.id, providerCallId(input.call.callId)),
          eq(schema.signalPresence.userId, input.call.userId),
        ),
      ),
  );

  await runFinalizerStep("outbound_lead", input.call, () =>
    settleOutboundLead({
      call: input.call,
      summary,
      endedReason,
      pipelineError: input.pipelineError,
    }),
  );

  await runFinalizerStep("voice_usage", input.call, () =>
    trackVoiceMinutes({
      userId: input.call.userId,
      durationSeconds,
      vapiCallId: providerCallId(input.call.callId),
    }),
  );
  return endedReason;
}

/**
 * A recovery job is created before the realtime session starts. If the process
 * disappears before persistFinishedCall can activate it, make the placeholder
 * row terminal without inventing a transcript or charging an unknown duration.
 */
export async function recoverStaleOpenAISipCall(input: {
  userId: string;
  callLogId: bigint | number | string;
  finalization: OpenAISipFinalizationContext;
}): Promise<boolean> {
  const providerId = providerCallId(input.finalization.callId);
  const [recovered] = await drizzle
    .update(schema.callLogs)
    .set({
      durationSeconds: 0,
      summary: RECOVERED_SUMMARY,
      endedReason: "finalization-recovery",
      pipelineError: "finalization_recovery",
      openaiSipPhase: "terminal",
      openaiSipOwnerToken: null,
      openaiSipLeaseExpiresAt: null,
    })
    .where(
      and(
        eq(schema.callLogs.id, BigInt(String(input.callLogId))),
        eq(schema.callLogs.userId, input.userId),
        eq(schema.callLogs.vapiCallId, providerId),
        sql`${schema.callLogs.endedReason} IS NULL`,
      ),
    )
    .returning({ id: schema.callLogs.id });
  if (!recovered) return false;

  const error = new Error("OpenAI SIP call required stale finalization recovery");
  log.error(error.message, {
    userId: input.userId,
    callId: providerId,
    callLogId: String(input.callLogId),
  });
  reportError(error, {
    userId: input.userId,
    callId: providerId,
    tags: { voice: "openai_sip_finalization_recovery" },
  });
  return true;
}

/** Queue replay for the critical, provider-idempotent end-of-call effects. */
export async function replayOpenAISipPostCallFinalization(input: {
  userId: string;
  callLogId: bigint | number | string;
  agentId?: string | null;
  dialedNumber?: string | null;
  customerNumber?: string | null;
  direction?: string | null;
  durationSeconds?: number | null;
  summary?: string | null;
  transcript?: string | null;
  endedReason?: string | null;
  pipelineError?: string | null;
  finalization: OpenAISipFinalizationContext;
}): Promise<void> {
  const providerId = providerCallId(input.finalization.callId);
  const [authoritative] = await drizzle
    .select({ providerCallId: schema.callLogs.vapiCallId })
    .from(schema.callLogs)
    .where(
      and(
        eq(schema.callLogs.id, BigInt(String(input.callLogId))),
        eq(schema.callLogs.userId, input.userId),
      ),
    )
    .limit(1);
  if (!authoritative || authoritative.providerCallId !== providerId) {
    throw new Error("OpenAI SIP finalization metadata does not match the authoritative call row.");
  }
  if (!input.agentId) {
    throw new Error("OpenAI SIP finalization is missing the authoritative Bot identity.");
  }

  const call: OpenAISipIncomingCall = {
    callId: input.finalization.callId,
    userId: input.userId,
    agentId: input.agentId,
    callerNumber: input.customerNumber || null,
    calledNumber: input.dialedNumber || "",
    direction: input.direction === "outbound" ? "outbound" : "inbound",
    ...(input.finalization.leadId ? { leadId: BigInt(input.finalization.leadId) } : {}),
  };
  const transcript = input.transcript || "";
  const durationSeconds = Math.max(0, Number(input.durationSeconds || 0));

  await persistAiDisclosureEvidence({
    call,
    transcript,
    actualOpeningTranscript: firstAgentTranscript(transcript),
    durationSeconds,
    openingPlaybackConfirmed: input.finalization.openingPlaybackConfirmed,
  });

  const optOut = detectOptOut(transcript);
  if (optOut.kind === "dnc") {
    await persistTranscriptDncSuppression({
      userId: input.userId,
      callId: providerId,
      rawCallerNumber: input.customerNumber || "",
      matchedPattern: optOut.matched_pattern,
    });
  }

  await drizzle
    .delete(schema.signalPresence)
    .where(
      and(eq(schema.signalPresence.id, providerId), eq(schema.signalPresence.userId, input.userId)),
    );
  await settleOutboundLead({
    call,
    summary: input.summary || "Call completed.",
    endedReason: input.endedReason || "provider-disconnected",
    pipelineError: input.pipelineError || null,
  });
  await trackVoiceMinutes({
    userId: input.userId,
    durationSeconds,
    vapiCallId: providerId,
  });
  // Critical DNC, presence and customer usage settle before optional estimate
  // replay. Throwing here keeps the durable job retryable without blocking them.
  await reconcileOpenAISipDurationSpend(input.userId, input.finalization.callId, durationSeconds);
}

async function runRealtimeSession(
  input: OpenAISipIncomingCall,
  runtime: RealtimeRuntime,
  ownershipSignal?: AbortSignal,
  accountElapsed?: (seconds: number) => Promise<void>,
): Promise<RealtimeSessionOutcome> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OpenAI_API_KEY is missing during SIP session startup.");

  const callerTranscriptIndexes = new Map<string, number>();
  const transcriptLines: OpenAITranscriptLine[] = [];
  const pendingTools = new Map<string, PendingToolCall>();
  let assistantTurn = "";
  let endedReason = "provider-disconnected";
  let pipelineError: string | null = null;
  let connectedAt: number | null = null;
  let endedAt: number | null = null;
  let toolCallsTotal = 0;
  let toolCallsFailed = 0;
  let escalationAttempted = false;
  let escalationSucceeded = false;
  let openingPlaybackConfirmed = false;
  let actualOpeningTranscript = "";
  let sipPlaybackActive = false;
  let hangupAfterOpening = inboundAdmissionMode(input) === "suspended";
  let awaitingExactOpeningPlayback = false;
  let capturingOpeningTranscript = false;
  let toolContinuationPending = false;
  let callerDncHangupStarted = false;
  let eventChain = Promise.resolve();
  let maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  let durationWarningTimer: ReturnType<typeof setTimeout> | null = null;
  let accountingTimer: ReturnType<typeof setInterval> | null = null;
  let accountingWork = Promise.resolve();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let missedPongs = 0;

  const ws = new WebSocket(buildOpenAISipRealtimeUrl(input.callId), {
    headers: { Authorization: `Bearer ${apiKey}` },
    handshakeTimeout: WS_OPEN_TIMEOUT_MS,
  });

  const ownsSession = () => !ownershipSignal?.aborted;
  const abortForLostOwnership = () => {
    if (!pipelineError) pipelineError = "ownership";
    endedReason = "claim-lease-lost";
    pendingTools.clear();
    hangupAfterOpening = false;
    awaitingExactOpeningPlayback = false;
    capturingOpeningTranscript = false;
    toolContinuationPending = false;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }
  };
  if (ownershipSignal?.aborted) abortForLostOwnership();
  else ownershipSignal?.addEventListener("abort", abortForLostOwnership, { once: true });

  const notifyTransferred = () => {
    if (!ownsSession()) return;
    if (endedReason === "caller-dnc") return;
    endedReason = "transferred";
    hangupAfterOpening = false;
    awaitingExactOpeningPlayback = false;
    capturingOpeningTranscript = false;
    toolContinuationPending = false;
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer);
      maxDurationTimer = null;
    }
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, "BotBound transferred");
    }
  };
  const sessionHandle = { notifyTransferred };
  liveSipSessions.set(input.callId, sessionHandle);

  const flushAssistantTurn = () => {
    const text = assistantTurn.trim();
    if (text) transcriptLines.push({ role: "Agent", text });
    assistantTurn = "";
  };

  const finishExactOpeningIfNeeded = (delivered: boolean) => {
    if (!ownsSession()) return false;
    if (!awaitingExactOpeningPlayback) return false;
    awaitingExactOpeningPlayback = false;
    capturingOpeningTranscript = false;
    openingPlaybackConfirmed = delivered;
    if (!hangupAfterOpening || ws.readyState !== WebSocket.OPEN) return true;
    hangupAfterOpening = false;
    endedReason = "line-suspended";
    void hangupOpenAISipCall(input.callId).catch(() => {
      log.warn("Native suspended-line hangup could not be confirmed", {
        callId: providerCallId(input.callId),
      });
    });
    ws.close(1000, "BotBound line suspended");
    return true;
  };

  const requestToolContinuationWhenReady = () => {
    if (!ownsSession()) return;
    if (sipPlaybackActive || ws.readyState !== WebSocket.OPEN) return;
    if (awaitingExactOpeningPlayback || hangupAfterOpening) return;
    if (!toolContinuationPending || endedReason === "transferred" || endedReason === "caller-dnc") {
      return;
    }
    toolContinuationPending = false;
    sendJson(ws, { type: "response.create" });
  };

  const endForCallerDnc = async (matchedPattern: string | undefined) => {
    if (!ownsSession()) return;
    if (callerDncHangupStarted || endedReason === "transferred") return;
    callerDncHangupStarted = true;
    endedReason = "caller-dnc";
    hangupAfterOpening = false;
    awaitingExactOpeningPlayback = false;
    toolContinuationPending = false;
    await persistTranscriptDncSuppression({
      userId: input.userId,
      callId: providerCallId(input.callId),
      rawCallerNumber: input.callerNumber || "",
      matchedPattern,
    });
    try {
      await hangupOpenAISipCall(input.callId);
    } catch {
      log.warn("Native caller-DNC hangup could not be confirmed", {
        callId: providerCallId(input.callId),
      });
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "BotBound caller DNC");
    }
  };

  const executePendingTools = async () => {
    if (!ownsSession()) return;
    if (!pendingTools.size || ws.readyState !== WebSocket.OPEN) return;
    const calls = [...pendingTools.values()];
    pendingTools.clear();

    // Execute in provider order. Parallel side effects can otherwise race (for
    // example a stop-calling request and a follow-up send from the same turn).
    for (const call of calls) {
      if (!ownsSession()) break;
      const admissionMode = inboundAdmissionMode(input);
      const allowedTakeMessage =
        admissionMode !== "take_message" || call.name === "create_followup_task";
      if (admissionMode === "suspended" || !allowedTakeMessage) {
        toolCallsFailed += 1;
        sendJson(ws, {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.callId,
            output: boundedToolOutput({
              error: "This action is not available on this call. Continue without it.",
            }),
          },
        });
        continue;
      }
      toolCallsTotal += 1;
      if (call.name === "escalate_to_human") escalationAttempted = true;

      const operation = dispatchAgentToolCall(
        call.name,
        call.arguments,
        toolContext({
          call: input,
          agentName: runtime.agentName,
          toolCallId: call.callId,
          abortSignal: ownershipSignal,
        }),
      );
      const outcome = await Promise.race([
        operation.then(
          (result) => ({ kind: "completed" as const, result }),
          (error) => ({ kind: "failed" as const, error }),
        ),
        delay(TOOL_CONFIRM_TIMEOUT_MS).then(() => ({ kind: "timeout" as const })),
      ]);
      if (!ownsSession()) break;

      if (outcome.kind === "timeout") {
        toolCallsFailed += 1;
        log.warn("OpenAI Realtime tool confirmation timed out", {
          userId: input.userId,
          agentId: input.agentId,
          callId: providerCallId(input.callId),
          tool: call.name,
          toolCallId: call.callId,
        });
        void operation.then(
          async (result) => {
            if (!ownsSession()) return;
            log.info("OpenAI Realtime tool completed after caller-facing timeout", {
              userId: input.userId,
              agentId: input.agentId,
              callId: providerCallId(input.callId),
              tool: call.name,
              toolCallId: call.callId,
            });
            try {
              if (result.destination?.number && endedReason !== "caller-dnc") {
                await referOpenAISipCall(input.userId, input.callId, result.destination.number);
                if (call.name === "escalate_to_human") escalationSucceeded = true;
                notifyTransferred();
              }
              if (call.name === "add_to_dnc" && endedReason !== "transferred") {
                await endForCallerDnc(undefined);
              }
            } catch (error) {
              log.warn("OpenAI Realtime late tool side-effect failed", {
                userId: input.userId,
                agentId: input.agentId,
                callId: providerCallId(input.callId),
                tool: call.name,
                toolCallId: call.callId,
                errorClass: error instanceof Error ? error.name : typeof error,
              });
            }
          },
          (error) =>
            log.warn("OpenAI Realtime tool failed after caller-facing timeout", {
              userId: input.userId,
              agentId: input.agentId,
              callId: providerCallId(input.callId),
              tool: call.name,
              toolCallId: call.callId,
              errorClass: error instanceof Error ? error.name : typeof error,
            }),
        );
        sendJson(ws, {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.callId,
            output: boundedToolOutput({
              error:
                "Action confirmation timed out and the outcome is unknown. Do not claim success or retry automatically. Offer a manual follow-up or safe alternative.",
            }),
          },
        });
        continue;
      }

      if (outcome.kind === "failed") {
        toolCallsFailed += 1;
        log.warn("OpenAI Realtime tool execution failed", {
          userId: input.userId,
          agentId: input.agentId,
          callId: providerCallId(input.callId),
          tool: call.name,
          toolCallId: call.callId,
          errorClass: outcome.error instanceof Error ? outcome.error.name : typeof outcome.error,
        });
        sendJson(ws, {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.callId,
            output: boundedToolOutput({
              error:
                "The action could not be confirmed. Do not claim it happened; offer a safe alternative.",
            }),
          },
        });
        continue;
      }

      try {
        if (!ownsSession()) break;
        let transferCompleted = false;
        if (outcome.result.destination?.number) {
          await referOpenAISipCall(input.userId, input.callId, outcome.result.destination.number);
          if (call.name === "escalate_to_human") escalationSucceeded = true;
          transferCompleted = true;
        }
        sendJson(ws, {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.callId,
            output: boundedToolOutput({ result: outcome.result.result }),
          },
        });
        if (transferCompleted) {
          // REFER hands the PSTN call to the destination. Close only BotBound's
          // realtime session and disarm its watchdog; never hang up the new leg.
          notifyTransferred();
          break;
        }
        if (call.name === "add_to_dnc") {
          await endForCallerDnc(undefined);
          break;
        }
      } catch (error) {
        toolCallsFailed += 1;
        log.warn("OpenAI Realtime transfer action failed", {
          userId: input.userId,
          agentId: input.agentId,
          callId: providerCallId(input.callId),
          tool: call.name,
          toolCallId: call.callId,
          errorClass: error instanceof Error ? error.name : typeof error,
        });
        sendJson(ws, {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.callId,
            output: boundedToolOutput({
              error:
                "The transfer could not be confirmed. Do not say it succeeded; offer to take a message or try a safe alternative.",
            }),
          },
        });
      }
    }

    if (endedReason !== "transferred" && endedReason !== "caller-dnc") {
      // OpenAI can finish generating before SIP playback drains. Release the
      // follow-up only after output_audio_buffer.stopped/cleared.
      toolContinuationPending = true;
      requestToolContinuationWhenReady();
    }
  };

  const handleEvent = async (event: Record<string, unknown>) => {
    if (!ownsSession()) return;
    const type = String(event.type || "");
    if (type === "output_audio_buffer.started") {
      sipPlaybackActive = true;
      return;
    }
    if (type === "output_audio_buffer.stopped" || type === "output_audio_buffer.cleared") {
      sipPlaybackActive = false;
      if (finishExactOpeningIfNeeded(type === "output_audio_buffer.stopped")) return;
      requestToolContinuationWhenReady();
      return;
    }
    if (type === "input_audio_buffer.speech_started" || type === "input_audio_buffer.committed") {
      if (!hangupAfterOpening) awaitingExactOpeningPlayback = false;
      return;
    }
    if (
      type === "conversation.item.input_audio_transcription.delta" ||
      type === "conversation.item.input_audio_transcription.updated" ||
      type === "conversation.item.input_audio_transcription.completed"
    ) {
      const itemId = String(event.item_id || "caller");
      const transcript = typeof event.transcript === "string" ? event.transcript : "";
      upsertOrderedCallerTranscript(transcriptLines, callerTranscriptIndexes, itemId, transcript);
      const optOut = detectOptOut(transcript);
      if (optOut.kind === "dnc") {
        await endForCallerDnc(optOut.matched_pattern);
      }
      return;
    }
    if (type === "response.output_audio_transcript.delta" && typeof event.delta === "string") {
      assistantTurn += event.delta;
      if (capturingOpeningTranscript) actualOpeningTranscript += event.delta;
      return;
    }
    if (type === "response.output_audio_transcript.done" && typeof event.transcript === "string") {
      if (!assistantTurn.trim()) assistantTurn = event.transcript;
      if (capturingOpeningTranscript && !actualOpeningTranscript.trim()) {
        actualOpeningTranscript = event.transcript;
      }
      return;
    }
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
      assistantTurn += event.delta;
      return;
    }
    if (type === "response.function_call_arguments.done") {
      const name = typeof event.name === "string" ? event.name.trim() : "";
      const callId = typeof event.call_id === "string" ? event.call_id.trim() : "";
      if (name && callId) {
        pendingTools.set(callId, { callId, name, arguments: safeToolArguments(event.arguments) });
      }
      return;
    }
    if (type === "response.done") {
      flushAssistantTurn();
      capturingOpeningTranscript = false;
      const response = asRecord(event.response);
      if (String(response.status || "").toLowerCase() === "failed") {
        pipelineError = "openai_response";
        throw new Error("OPENAI_REALTIME_RESPONSE_FAILED");
      }
      if (awaitingExactOpeningPlayback || hangupAfterOpening) {
        // The opening response may finish before SIP audio drains.
        // Do not start a model turn or hang up until playback completes.
        return;
      }
      await executePendingTools();
      return;
    }
    if (type === "error") {
      pipelineError = "openai_realtime";
      throw new Error("OPENAI_REALTIME_EVENT_ERROR");
    }
  };

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const rejectOnce = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      ws.on("open", () => {
        if (!ownsSession()) {
          ws.terminate();
          return;
        }
        connectedAt = Date.now();
        const outbound = callDirection(input) === "outbound";
        const opening = outbound
          ? buildOutboundOpening(input, runtime)
          : buildInboundOpening(input, runtime);
        const instructions = outbound
          ? `${runtime.session.instructions}\n\n${buildOutboundInstructions(input)}`
          : runtime.session.instructions;

        sendJson(ws, {
          type: "session.update",
          session: { ...runtime.session, instructions },
        });
        if (opening) {
          // Keep the compliance opening isolated from the conversational turn.
          // A constrained response instruction owns the first playback.
          awaitingExactOpeningPlayback = true;
          capturingOpeningTranscript = true;
          sendJson(ws, {
            type: "response.create",
            response: {
              instructions: `Say exactly this and nothing else: ${opening}`,
              output_modalities: ["audio"],
            },
          });
        } else {
          sendJson(ws, { type: "response.create" });
        }

        const admissionMode = inboundAdmissionMode(input);
        const maxDurationMs =
          admissionMode === "suspended"
            ? 20_000
            : admissionMode === "take_message"
              ? 300_000
              : resolveOpenAISipSessionMaxSeconds() * 1_000;
        if (accountElapsed) {
          accountingTimer = setInterval(() => {
            if (!ownsSession() || connectedAt === null || endedAt !== null) return;
            const elapsed = (Date.now() - connectedAt) / 1_000;
            accountingWork = accountingWork.then(() => accountElapsed(elapsed));
          }, 30_000);
        }
        if (maxDurationMs >= 600_000) {
          durationWarningTimer = setTimeout(() => {
            if (!ownsSession() || ws.readyState !== WebSocket.OPEN) return;
            log.warn("Business call approaching its session limit", {
              userId: input.userId,
              callId: providerCallId(input.callId),
              remainingSeconds: 60,
            });
            // Guide the next conversational turn without interrupting speech
            // or creating a competing response while another one is playing.
            sendJson(ws, {
              type: "session.update",
              session: {
                type: "realtime",
                instructions:
                  instructions +
                  "\n\nThis call reaches its session limit in one minute. Briefly tell the caller, summarize the agreed next step, and offer an approved callback or human transfer if more time is needed. Do not promise automatic continuation.",
              },
            });
          }, maxDurationMs - 60_000);
        }
        maxDurationTimer = setTimeout(() => {
          if (!ownsSession() || endedAt !== null) return;
          if (endedReason === "transferred" || endedReason === "caller-dnc") return;
          void withOpenAISipControlLock(input.userId, input.callId, async (tx) => {
            // REFER or finalization may have completed while this lock waited.
            if (!ownsSession() || endedAt !== null || ws.readyState !== WebSocket.OPEN) return;
            if (endedReason === "transferred" || endedReason === "caller-dnc") return;
            if (
              (await readOpenAISipTransferStatus(tx, input.userId, input.callId)) === "transferred"
            ) {
              notifyTransferred();
              return;
            }
            if (!ownsSession() || endedAt !== null || ws.readyState !== WebSocket.OPEN) return;
            endedReason = "botbound-max-duration";
            await hangupOpenAISipCall(input.callId);
          })
            .catch(() => {
              log.warn("OpenAI max-duration hangup could not be confirmed", {
                callId: providerCallId(input.callId),
              });
            })
            .finally(() => {
              if (ownsSession() && endedAt === null && ws.readyState === WebSocket.OPEN) {
                ws.close(1000, "BotBound maximum duration reached");
              }
            });
        }, maxDurationMs);

        heartbeat = setInterval(() => {
          if (!ownsSession()) return;
          if (ws.readyState !== WebSocket.OPEN) return;
          void drizzle
            .select({ status: schema.signalPresence.status })
            .from(schema.signalPresence)
            .where(
              and(
                eq(schema.signalPresence.id, providerCallId(input.callId)),
                eq(schema.signalPresence.userId, input.userId),
              ),
            )
            .limit(1)
            .then(([row]) => {
              if (row?.status === "transferred") {
                notifyTransferred();
              }
            })
            .catch(() => {});
          missedPongs += 1;
          if (missedPongs > MAX_MISSED_PONGS) {
            pipelineError = "heartbeat";
            endedReason = "provider-heartbeat-timeout";
            ws.terminate();
            return;
          }
          try {
            ws.ping();
          } catch {
            pipelineError = "heartbeat";
            endedReason = "provider-heartbeat-error";
            ws.terminate();
          }
        }, HEARTBEAT_INTERVAL_MS);
      });

      ws.on("pong", () => {
        if (!ownsSession()) return;
        missedPongs = 0;
      });
      ws.on("message", (data) => {
        if (!ownsSession()) return;
        missedPongs = 0;
        const event = safeJsonParse(data.toString());
        if (!event) return;
        eventChain = eventChain.then(() => handleEvent(event));
        void eventChain.catch(rejectOnce);
      });
      ws.on("error", (error) => {
        if (!pipelineError) pipelineError = "connection";
        rejectOnce(error);
      });
      ws.on("close", (code, reason) => {
        endedAt ??= Date.now();
        if (accountingTimer) clearInterval(accountingTimer);
        if (code !== 1000 && endedReason === "provider-disconnected") {
          endedReason = `provider-close-${code}`;
        }
        log.info("OpenAI SIP WebSocket closed", {
          callId: providerCallId(input.callId),
          code,
          reasonLength: reason.length,
        });
        void eventChain.then(resolveOnce).catch(rejectOnce);
      });
    });
  } catch (error) {
    if (!pipelineError) pipelineError = "connection";
    endedReason =
      endedReason === "transferred" || endedReason === "caller-dnc" ? endedReason : "runtime-error";
    log.error("OpenAI SIP session failed", {
      userId: input.userId,
      agentId: input.agentId,
      callId: providerCallId(input.callId),
      failure: pipelineError,
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    try {
      if (ownsSession() && endedReason !== "transferred" && endedReason !== "caller-dnc") {
        await withOpenAISipControlLock(input.userId, input.callId, async (tx) => {
          if (!ownsSession()) return;
          if (
            (await readOpenAISipTransferStatus(tx, input.userId, input.callId)) === "transferred"
          ) {
            notifyTransferred();
            return;
          }
          if (ownsSession()) await hangupOpenAISipCall(input.callId);
        });
      }
    } catch {
      // The provider may already have ended the call.
    }
  } finally {
    endedAt ??= Date.now();
    ownershipSignal?.removeEventListener("abort", abortForLostOwnership);
    if (liveSipSessions.get(input.callId) === sessionHandle) {
      liveSipSessions.delete(input.callId);
    }
    if (maxDurationTimer) clearTimeout(maxDurationTimer);
    if (durationWarningTimer) clearTimeout(durationWarningTimer);
    if (accountingTimer) clearInterval(accountingTimer);
    if (heartbeat) clearInterval(heartbeat);
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }
    flushAssistantTurn();
    await accountingWork;
    if (accountElapsed && connectedAt !== null)
      await accountElapsed((endedAt - connectedAt) / 1_000);
  }

  return {
    endedAt,
    transcript: compactOpenAITranscript(transcriptLines),
    endedReason,
    pipelineError,
    connectedAt,
    toolCallsTotal,
    toolCallsFailed,
    escalationAttempted,
    escalationSucceeded,
    openingPlaybackConfirmed,
    actualOpeningTranscript: actualOpeningTranscript.trim(),
  };
}

export async function runOpenAISipCallSession(
  input: OpenAISipIncomingCall,
  admittedRuntime?: RealtimeRuntime,
  preclaimedCallLogId?: bigint,
  claim?: OpenAISipCallClaim,
  spendReservation?: PlatformCostReservation,
): Promise<void> {
  return tenantStore.run(input.userId, async () => {
    let leaseHeartbeat: ReturnType<typeof setTimeout> | null = null;
    let leaseSafetyTimer: ReturnType<typeof setTimeout> | null = null;
    let leaseRenewalStopped = false;
    const ownerFence = new AbortController();
    const armLeaseSafetyFence = (renewalStartedAt: number) => {
      if (leaseSafetyTimer) clearTimeout(leaseSafetyTimer);
      const remainingMs = renewalStartedAt + RUNNING_CLAIM_LOCAL_FENCE_MS - Date.now();
      if (remainingMs <= 0) {
        log.error("OpenAI SIP lease renewal exceeded its local safety margin", {
          userId: input.userId,
          callId: providerCallId(input.callId),
        });
        ownerFence.abort();
        return;
      }
      leaseSafetyTimer = setTimeout(() => {
        log.error("OpenAI SIP local lease safety deadline elapsed", {
          userId: input.userId,
          callId: providerCallId(input.callId),
        });
        ownerFence.abort();
      }, remainingMs);
    };
    const renewLeaseAndFence = async (): Promise<boolean> => {
      if (!claim) return true;
      const renewalStartedAt = Date.now();
      try {
        const renewed = await renewOpenAISipCallLease({ call: input, claim });
        if (!renewed) {
          log.error("OpenAI SIP session lost its durable running lease", {
            userId: input.userId,
            callId: providerCallId(input.callId),
          });
          ownerFence.abort();
          return false;
        }
        armLeaseSafetyFence(renewalStartedAt);
        return !ownerFence.signal.aborted;
      } catch (error) {
        log.error("OpenAI SIP running-lease renewal failed", {
          userId: input.userId,
          callId: providerCallId(input.callId),
          errorClass: error instanceof Error ? error.name : typeof error,
        });
        ownerFence.abort();
        return false;
      }
    };
    const scheduleLeaseRenewal = () => {
      leaseHeartbeat = setTimeout(async () => {
        if (leaseRenewalStopped || ownerFence.signal.aborted) return;
        const renewed = await renewLeaseAndFence();
        if (renewed && !leaseRenewalStopped && !ownerFence.signal.aborted) {
          scheduleLeaseRenewal();
        }
      }, RUNNING_CLAIM_HEARTBEAT_MS);
    };
    let callLogId = preclaimedCallLogId ?? null;
    if (callLogId === null) {
      try {
        const claimResult = await claimCall(input);
        callLogId = claimResult && claimResult !== "retry" ? claimResult.callLogId : null;
      } catch (error) {
        log.error("OpenAI SIP call could not establish durable recovery state", {
          userId: input.userId,
          agentId: input.agentId,
          callId: providerCallId(input.callId),
          errorClass: error instanceof Error ? error.name : typeof error,
        });
        await hangupOpenAISipCall(input.callId).catch(() => undefined);
        throw error;
      }
      if (!callLogId) {
        log.info("Duplicate OpenAI incoming-call webhook suppressed", {
          callId: providerCallId(input.callId),
        });
        return;
      }
    }

    let agentName = input.businessName?.trim() || "BotBound";
    let outcome: RealtimeSessionOutcome = {
      transcript: "",
      endedReason: "runtime-startup-error",
      pipelineError: "startup",
      connectedAt: null,
      endedAt: null,
      toolCallsTotal: 0,
      toolCallsFailed: 0,
      escalationAttempted: false,
      escalationSucceeded: false,
      openingPlaybackConfirmed: false,
      actualOpeningTranscript: "",
    };

    try {
      if (claim) {
        const renewed = await renewLeaseAndFence();
        if (!renewed) throw new Error("OpenAI SIP session could not confirm its running lease.");
        scheduleLeaseRenewal();
      }
      const runtime = applyInboundAdmission(
        admittedRuntime ??
          (await buildOpenAIRealtimeAgentRuntime({
            userId: input.userId,
            agentId: input.agentId,
            surface: "phone",
          })),
        input,
      );
      agentName = runtime.agentName;
      await updatePresence(input, agentName);
      if (callDirection(input) === "inbound") {
        void notifyInboundCall(input.userId, {
          callId: providerCallId(input.callId),
          fromNumber: input.callerNumber || "unknown",
          agentName,
          agentId: input.agentId,
        }).catch((error) => {
          log.warn("Native inbound-call push notification failed", {
            userId: input.userId,
            agentId: input.agentId,
            callId: providerCallId(input.callId),
            errorClass: error instanceof Error ? error.name : typeof error,
          });
        });
      }
      let accountedWindows = 1;
      const accountElapsed = spendReservation
        ? async (seconds: number) => {
            const windows = Math.max(1, Math.ceil(seconds / 300));
            if (windows <= accountedWindows) return;
            try {
              await extendCommittedPlatformCostReservation(spendReservation, seconds);
              accountedWindows = windows;
            } catch (error) {
              // Actual admitted work can cross the cap; new work must see its cost.
              // A transient persistence failure retries on the next heartbeat and
              // at completion, while retaining the prior conservative debit.
              log.error("Active SIP duration spend accounting failed", {
                userId: input.userId,
                callId: providerCallId(input.callId),
                elapsedSeconds: Math.ceil(seconds),
              });
              reportError(error, { tags: { surface: "sip-duration-accounting" } });
            }
          }
        : undefined;
      outcome = await runRealtimeSession(input, runtime, ownerFence.signal, accountElapsed);
    } catch (error) {
      log.error("OpenAI SIP session startup failed", {
        userId: input.userId,
        agentId: input.agentId,
        callId: providerCallId(input.callId),
        errorClass: error instanceof Error ? error.name : typeof error,
      });
      try {
        if (!ownerFence.signal.aborted) await hangupOpenAISipCall(input.callId);
      } catch {
        // The call may not yet be addressable or may already be over.
      }
    } finally {
      // Do not reuse ownerFence for normal cleanup: it signals lost ownership
      // and intentionally drives a provider hangup. This separate stop flag
      // prevents an in-flight renewal from outliving terminal persistence.
      leaseRenewalStopped = true;
      if (leaseHeartbeat) clearTimeout(leaseHeartbeat);
      if (leaseSafetyTimer) clearTimeout(leaseSafetyTimer);
      let terminalPersistedByOwner = false;
      try {
        outcome.endedReason = await persistFinishedCall({
          call: input,
          callLogId,
          agentName,
          connectedAt: outcome.connectedAt,
          endedAt: outcome.endedAt,
          transcript: outcome.transcript,
          endedReason: outcome.endedReason,
          pipelineError: outcome.pipelineError,
          toolCallsTotal: outcome.toolCallsTotal,
          toolCallsFailed: outcome.toolCallsFailed,
          escalationAttempted: outcome.escalationAttempted,
          escalationSucceeded: outcome.escalationSucceeded,
          openingPlaybackConfirmed: outcome.openingPlaybackConfirmed,
          actualOpeningTranscript: outcome.actualOpeningTranscript,
          claim,
        });
        terminalPersistedByOwner = true;
      } finally {
        // A transient renewal error aborts local work conservatively. If the
        // owner-fenced terminal write proves this worker still owned the call,
        // it must also end the now-silent provider leg. A real takeover fails
        // that write and therefore cannot be hung up by the stale worker.
        if (
          ownerFence.signal.aborted &&
          terminalPersistedByOwner &&
          outcome.endedReason !== "transferred"
        ) {
          await hangupOpenAISipCall(input.callId).catch(() => {
            log.warn("OpenAI SIP ownership-abort hangup could not be confirmed", {
              userId: input.userId,
              callId: providerCallId(input.callId),
            });
          });
        }
      }
    }
  });
}
