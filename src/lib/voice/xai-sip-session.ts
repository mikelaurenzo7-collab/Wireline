import WebSocket from "ws";
import { and, eq, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import type { ToolCallContext } from "../../routes/vapi/types";
import { dispatchAgentToolCall } from "../agent-tool-dispatch";
import { complianceFirstMessagePrefix } from "../agent-runtime";
import { notifyInboundCall } from "../mobile-push";
import {
  isMarketingCallPurpose,
  type OutboundCallPurpose,
} from "../outbound-call-purpose";
import { LEAD_STATUS } from "../outbound-status";
import { enqueuePostCallDigest } from "../post-call-digest";
import { drizzle, fetchWithTimeout, log, tenantStore } from "../server-context";
import { trackVoiceMinutes } from "../voice-usage";
import { buildXAIRealtimeAgentRuntime } from "./xai-agent-runtime";
import {
  XAI_REALTIME_CALLS_URL,
  buildXAISipRealtimeUrl,
  normalizeXAIPhoneNumber,
  resolveXAISipSessionMaxSeconds,
} from "./xai-sip-config";

const WS_OPEN_TIMEOUT_MS = 15_000;
const PROVIDER_REQUEST_TIMEOUT_MS = 10_000;
const TOOL_CONFIRM_TIMEOUT_MS = 20_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const MAX_MISSED_PONGS = 2;
const MAX_TRANSCRIPT_CHARS = 120_000;
const MAX_TOOL_OUTPUT_CHARS = 8_000;
const ACTIVE_OUTBOUND_STATUSES: readonly string[] = [
  LEAD_STATUS.PENDING,
  LEAD_STATUS.QUEUED,
  LEAD_STATUS.RETRYING,
  LEAD_STATUS.DIALING,
  LEAD_STATUS.CONNECTED,
];

export type XAISipIncomingCall = {
  callId: string;
  userId: string;
  agentId: string;
  callerNumber: string | null;
  calledNumber: string;
  direction?: "inbound" | "outbound";
  leadId?: bigint;
  customerName?: string | null;
  context?: string | null;
  callPurpose?: OutboundCallPurpose;
  businessName?: string | null;
  complianceMode?: string | null;
};

type PendingToolCall = {
  callId: string;
  name: string;
  arguments: unknown;
};

type RealtimeRuntime = Awaited<ReturnType<typeof buildXAIRealtimeAgentRuntime>>;

type RealtimeSessionOutcome = {
  transcript: string;
  endedReason: string;
  pipelineError: string | null;
  connectedAt: number | null;
  toolCallsTotal: number;
  toolCallsFailed: number;
  escalationAttempted: boolean;
  escalationSucceeded: boolean;
};

export type XAITranscriptLine = {
  role: "Caller" | "Agent";
  text: string;
};

function callDirection(input: XAISipIncomingCall): "inbound" | "outbound" {
  return input.direction === "outbound" ? "outbound" : "inbound";
}

function providerCallId(callId: string): string {
  return `xai:${callId}`;
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
  lines: XAITranscriptLine[],
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

export function compactXAITranscript(lines: XAITranscriptLine[]): string {
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

function buildInboundOpening(input: XAISipIncomingCall, runtime: RealtimeRuntime): string {
  const disclosure = complianceFirstMessagePrefix(
    input.complianceMode,
    input.businessName || runtime.agentName,
    {
      outboundAiCall: false,
      recordingEnabled: false,
    },
  );
  return `${disclosure}${runtime.greeting}`.trim();
}

function buildOutboundOpening(input: XAISipIncomingCall, runtime: RealtimeRuntime): string {
  const purpose = input.callPurpose || "service_or_requested";
  const disclosure = complianceFirstMessagePrefix(
    input.complianceMode,
    input.businessName || runtime.agentName,
    {
      outboundAiCall: true,
      recordingEnabled: false,
      telemarketing: isMarketingCallPurpose(purpose),
    },
  );
  const name = input.customerName?.trim();
  const identity = input.businessName?.trim()
    ? `${runtime.agentName} with ${input.businessName.trim()}`
    : runtime.agentName;
  return `${disclosure}${name ? `Hi ${name}, ` : "Hi, "}this is ${identity}.`.trim();
}

function buildOutboundInstructions(input: XAISipIncomingCall): string {
  const purpose = input.callPurpose || "service_or_requested";
  const objective =
    input.context?.trim() ||
    (purpose === "callback"
      ? "Continue the requested callback and establish the next useful step."
      : "Explain the reason for the call and establish the next useful step.");
  return [
    "OUTBOUND CALL: The required opening has already been delivered verbatim. Wait for the contact's response, then continue naturally.",
    input.customerName ? `Contact: ${input.customerName}.` : "",
    `Call purpose: ${purpose}.`,
    `Objective: ${objective}`,
    "Do not repeat the opening or read the objective like a script. Ask one question at a time and respect surprise, resistance, or a bad time.",
    purpose === "marketing_or_sales"
      ? "Any stop-calling or opt-out request is immediate: use add_to_dnc, confirm once, and end without another pitch."
      : "",
    "Before ending, use update_lead_status or schedule_callback when applicable and confirm the next step.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function xaiCallControl(
  callId: string,
  action: "refer" | "hangup",
  body?: Record<string, unknown>,
): Promise<void> {
  const apiKey = String(process.env.XAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("XAI_API_KEY is missing during call control.");
  const response = await fetchWithTimeout(
    `${XAI_REALTIME_CALLS_URL}/${encodeURIComponent(callId)}/${action}`,
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
  if (!response.ok) throw new Error(`xAI ${action} returned HTTP ${response.status}.`);
}

export async function referXAISipCall(callId: string, destination: string): Promise<void> {
  const phone = normalizeXAIPhoneNumber(destination);
  const targetUri = phone ? `tel:${phone}` : destination.trim();
  if (!targetUri || (!targetUri.startsWith("tel:") && !targetUri.startsWith("sip:"))) {
    throw new Error("A valid PSTN or SIP transfer destination is required.");
  }
  await xaiCallControl(callId, "refer", { target_uri: targetUri });
}

export function hangupXAISipCall(callId: string): Promise<void> {
  return xaiCallControl(callId, "hangup");
}

async function claimCall(input: XAISipIncomingCall) {
  const id = providerCallId(input.callId);
  const [created] = await drizzle
    .insert(schema.callLogs)
    .values({
      userId: input.userId,
      vapiCallId: id,
      agentId: input.agentId,
      direction: callDirection(input),
      customerNumber: input.callerNumber,
      summary: "Native xAI voice call in progress.",
      endedReason: null,
      pipelineError: null,
    })
    .onConflictDoNothing({ target: schema.callLogs.vapiCallId })
    .returning({ id: schema.callLogs.id });
  return created?.id ?? null;
}

async function updatePresence(input: XAISipIncomingCall, agentName: string) {
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
  call: XAISipIncomingCall;
  agentName: string;
  toolCallId: string;
}): ToolCallContext {
  const direction = callDirection(input.call);
  const call = {
    id: providerCallId(input.call.callId),
    type: direction === "outbound" ? "outboundPhoneCall" : "inboundPhoneCall",
    provider: "xai",
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
    drizzle,
    log,
  };
}

async function settleOutboundLead(input: {
  call: XAISipIncomingCall;
  summary: string;
  endedReason: string;
  pipelineError: string | null;
}) {
  if (callDirection(input.call) !== "outbound" || !input.call.leadId) return;

  await drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-outbound:${String(input.call.leadId)}`}))`,
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
          eq(schema.outboundLeads.id, input.call.leadId!),
          eq(schema.outboundLeads.userId, input.call.userId),
        ),
      )
      .limit(1);
    if (!lead) return;

    const metadata = asRecord(lead.metadata);
    const nativeVoice = asRecord(metadata.native_voice);
    const currentlyActive = ACTIVE_OUTBOUND_STATUSES.includes(lead.status || "");
    const now = new Date();
    const nextState =
      input.endedReason === "transferred"
        ? "transferred"
        : input.pipelineError
          ? "runtime_error"
          : "completed";

    await tx
      .update(schema.outboundLeads)
      .set({
        ...(currentlyActive
          ? { status: input.pipelineError ? LEAD_STATUS.ERROR : LEAD_STATUS.COMPLETED }
          : {}),
        lastContactSummary: currentlyActive
          ? input.summary
          : lead.lastContactSummary || input.summary,
        lastCalledAt: now,
        metadata: {
          ...metadata,
          native_voice: {
            ...nativeVoice,
            xai_call_id: providerCallId(input.call.callId),
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
          eq(schema.outboundLeads.id, input.call.leadId!),
          eq(schema.outboundLeads.userId, input.call.userId),
        ),
      );
  });
}

async function runFinalizerStep(
  name: string,
  input: XAISipIncomingCall,
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    log.error("Native xAI call finalizer step failed", {
      step: name,
      userId: input.userId,
      agentId: input.agentId,
      callId: providerCallId(input.callId),
      errorClass: error instanceof Error ? error.name : typeof error,
    });
  }
}

async function persistFinishedCall(input: {
  call: XAISipIncomingCall;
  callLogId: bigint;
  agentName: string;
  connectedAt: number | null;
  transcript: string;
  endedReason: string;
  pipelineError: string | null;
  toolCallsTotal: number;
  toolCallsFailed: number;
  escalationAttempted: boolean;
  escalationSucceeded: boolean;
}) {
  const durationSeconds = input.connectedAt
    ? Math.max(0, Math.round((Date.now() - input.connectedAt) / 1_000))
    : 0;
  const summary = deterministicSummary(input.transcript);
  const direction = callDirection(input.call);

  await runFinalizerStep("call_log", input.call, () =>
    drizzle
      .update(schema.callLogs)
      .set({
        durationSeconds,
        summary,
        transcript: input.transcript || null,
        endedReason: input.endedReason,
        pipelineError: input.pipelineError,
        toolCallsTotal: input.toolCallsTotal,
        toolCallsFailed: input.toolCallsFailed,
        escalationAttempted: input.escalationAttempted,
        escalationSucceeded: input.escalationSucceeded,
      })
      .where(
        and(eq(schema.callLogs.id, input.callLogId), eq(schema.callLogs.userId, input.call.userId)),
      ),
  );

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
      endedReason: input.endedReason,
      pipelineError: input.pipelineError,
    }),
  );

  if (durationSeconds > 0) {
    await runFinalizerStep("voice_usage", input.call, () =>
      trackVoiceMinutes({
        userId: input.call.userId,
        durationSeconds,
        vapiCallId: providerCallId(input.call.callId),
      }),
    );
  }

  if (durationSeconds > 0 || input.transcript) {
    await runFinalizerStep("post_call_digest", input.call, () =>
      enqueuePostCallDigest({
        userId: input.call.userId,
        callLogId: input.callLogId,
        agentId: input.call.agentId,
        dialedNumber: input.call.calledNumber,
        customerNumber: input.call.callerNumber,
        agentName: input.agentName,
        direction,
        durationSeconds,
        summary,
        transcript: input.transcript,
        endedReason: input.endedReason,
        vapiCallType: direction === "outbound" ? "xai_sip_outbound" : "xai_sip_inbound",
        vapiCallId: providerCallId(input.call.callId),
      }),
    );
  }
}

async function runRealtimeSession(
  input: XAISipIncomingCall,
  runtime: RealtimeRuntime,
): Promise<RealtimeSessionOutcome> {
  const apiKey = String(process.env.XAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("XAI_API_KEY is missing during SIP session startup.");

  const callerTranscriptIndexes = new Map<string, number>();
  const transcriptLines: XAITranscriptLine[] = [];
  const pendingTools = new Map<string, PendingToolCall>();
  let assistantTurn = "";
  let endedReason = "provider-disconnected";
  let pipelineError: string | null = null;
  let connectedAt: number | null = null;
  let toolCallsTotal = 0;
  let toolCallsFailed = 0;
  let escalationAttempted = false;
  let escalationSucceeded = false;
  let sipPlaybackActive = false;
  let toolContinuationPending = false;
  let eventChain = Promise.resolve();
  let maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let missedPongs = 0;

  const ws = new WebSocket(buildXAISipRealtimeUrl(input.callId), {
    headers: { Authorization: `Bearer ${apiKey}` },
    handshakeTimeout: WS_OPEN_TIMEOUT_MS,
  });

  const flushAssistantTurn = () => {
    const text = assistantTurn.trim();
    if (text) transcriptLines.push({ role: "Agent", text });
    assistantTurn = "";
  };

  const requestToolContinuationWhenReady = () => {
    if (
      !toolContinuationPending ||
      sipPlaybackActive ||
      endedReason === "transferred" ||
      ws.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    toolContinuationPending = false;
    sendJson(ws, { type: "response.create" });
  };

  const executePendingTools = async () => {
    if (!pendingTools.size || ws.readyState !== WebSocket.OPEN) return;
    const calls = [...pendingTools.values()];
    pendingTools.clear();

    // Execute in provider order. Parallel side effects can otherwise race (for
    // example a stop-calling request and a follow-up send from the same turn).
    for (const call of calls) {
      toolCallsTotal += 1;
      if (call.name === "escalate_to_human") escalationAttempted = true;

      const operation = dispatchAgentToolCall(
        call.name,
        call.arguments,
        toolContext({ call: input, agentName: runtime.agentName, toolCallId: call.callId }),
      );
      const outcome = await Promise.race([
        operation.then(
          (result) => ({ kind: "completed" as const, result }),
          (error) => ({ kind: "failed" as const, error }),
        ),
        delay(TOOL_CONFIRM_TIMEOUT_MS).then(() => ({ kind: "timeout" as const })),
      ]);

      if (outcome.kind === "timeout") {
        toolCallsFailed += 1;
        log.warn("Native xAI tool confirmation timed out", {
          userId: input.userId,
          agentId: input.agentId,
          callId: providerCallId(input.callId),
          tool: call.name,
          toolCallId: call.callId,
        });
        void operation.then(
          () =>
            log.info("Native xAI tool completed after caller-facing timeout", {
              userId: input.userId,
              agentId: input.agentId,
              callId: providerCallId(input.callId),
              tool: call.name,
              toolCallId: call.callId,
            }),
          (error) =>
            log.warn("Native xAI tool failed after caller-facing timeout", {
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
        log.warn("Native xAI tool execution failed", {
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
        if (outcome.result.destination?.number) {
          await referXAISipCall(input.callId, outcome.result.destination.number);
          if (call.name === "escalate_to_human") escalationSucceeded = true;
          endedReason = "transferred";
        }
        sendJson(ws, {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.callId,
            output: boundedToolOutput({ result: outcome.result.result }),
          },
        });
      } catch (error) {
        toolCallsFailed += 1;
        log.warn("Native xAI transfer action failed", {
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

    if (endedReason !== "transferred") {
      // xAI can finish generating before SIP playback drains. Release the
      // follow-up only after output_audio_buffer.stopped/cleared.
      toolContinuationPending = true;
      requestToolContinuationWhenReady();
    }
  };

  const handleEvent = async (event: Record<string, unknown>) => {
    const type = String(event.type || "");
    if (type === "output_audio_buffer.started") {
      sipPlaybackActive = true;
      return;
    }
    if (type === "output_audio_buffer.stopped" || type === "output_audio_buffer.cleared") {
      sipPlaybackActive = false;
      requestToolContinuationWhenReady();
      return;
    }
    if (
      type === "conversation.item.input_audio_transcription.updated" ||
      type === "conversation.item.input_audio_transcription.completed"
    ) {
      const itemId = String(event.item_id || "caller");
      const transcript = typeof event.transcript === "string" ? event.transcript : "";
      upsertOrderedCallerTranscript(transcriptLines, callerTranscriptIndexes, itemId, transcript);
      return;
    }
    if (
      (type === "response.output_audio_transcript.delta" ||
        type === "response.output_text.delta") &&
      typeof event.delta === "string"
    ) {
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
      const response = asRecord(event.response);
      if (String(response.status || "").toLowerCase() === "failed") {
        pipelineError = "xai_response";
        throw new Error("XAI_REALTIME_RESPONSE_FAILED");
      }
      await executePendingTools();
      return;
    }
    if (type === "error") {
      pipelineError = "xai_realtime";
      throw new Error("XAI_REALTIME_EVENT_ERROR");
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
          // A legally significant opening must be exact and uninterrupted.
          // force_message owns its response lifecycle; no response.create here.
          sendJson(ws, {
            type: "conversation.item.create",
            item: {
              type: "force_message",
              role: "assistant",
              interruptible: false,
              content: [{ type: "output_text", text: opening }],
            },
          });
        } else {
          sendJson(ws, { type: "response.create" });
        }

        const maxDurationMs = resolveXAISipSessionMaxSeconds() * 1_000;
        maxDurationTimer = setTimeout(() => {
          endedReason = "wireline-max-duration";
          void hangupXAISipCall(input.callId).catch(() => {
            log.warn("xAI max-duration hangup could not be confirmed", {
              callId: providerCallId(input.callId),
            });
          });
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(1000, "Wireline maximum duration reached");
          }
        }, maxDurationMs);

        heartbeat = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
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
        missedPongs = 0;
      });
      ws.on("message", (data) => {
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
        if (code !== 1000 && endedReason === "provider-disconnected") {
          endedReason = `provider-close-${code}`;
        }
        log.info("xAI SIP WebSocket closed", {
          callId: providerCallId(input.callId),
          code,
          reasonLength: reason.length,
        });
        void eventChain.then(resolveOnce).catch(rejectOnce);
      });
    });
  } catch (error) {
    if (!pipelineError) pipelineError = "connection";
    endedReason = endedReason === "transferred" ? endedReason : "runtime-error";
    log.error("Native xAI SIP session failed", {
      userId: input.userId,
      agentId: input.agentId,
      callId: providerCallId(input.callId),
      failure: pipelineError,
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    try {
      if (endedReason !== "transferred") await hangupXAISipCall(input.callId);
    } catch {
      // The provider may already have ended the call.
    }
  } finally {
    if (maxDurationTimer) clearTimeout(maxDurationTimer);
    if (heartbeat) clearInterval(heartbeat);
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }
    flushAssistantTurn();
  }

  return {
    transcript: compactXAITranscript(transcriptLines),
    endedReason,
    pipelineError,
    connectedAt,
    toolCallsTotal,
    toolCallsFailed,
    escalationAttempted,
    escalationSucceeded,
  };
}

export async function runXAISipCallSession(input: XAISipIncomingCall): Promise<void> {
  return tenantStore.run(input.userId, async () => {
    const callLogId = await claimCall(input);
    if (!callLogId) {
      log.info("Duplicate xAI incoming-call webhook suppressed", {
        callId: providerCallId(input.callId),
      });
      return;
    }

    let agentName = input.businessName?.trim() || "Wireline";
    let outcome: RealtimeSessionOutcome = {
      transcript: "",
      endedReason: "runtime-startup-error",
      pipelineError: "startup",
      connectedAt: null,
      toolCallsTotal: 0,
      toolCallsFailed: 0,
      escalationAttempted: false,
      escalationSucceeded: false,
    };

    try {
      const runtime = await buildXAIRealtimeAgentRuntime({
        userId: input.userId,
        agentId: input.agentId,
        surface: "phone",
      });
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
      outcome = await runRealtimeSession(input, runtime);
    } catch (error) {
      log.error("Native xAI SIP session startup failed", {
        userId: input.userId,
        agentId: input.agentId,
        callId: providerCallId(input.callId),
        errorClass: error instanceof Error ? error.name : typeof error,
      });
      try {
        await hangupXAISipCall(input.callId);
      } catch {
        // The call may not yet be addressable or may already be over.
      }
    } finally {
      await persistFinishedCall({
        call: input,
        callLogId,
        agentName,
        connectedAt: outcome.connectedAt,
        transcript: outcome.transcript,
        endedReason: outcome.endedReason,
        pipelineError: outcome.pipelineError,
        toolCallsTotal: outcome.toolCallsTotal,
        toolCallsFailed: outcome.toolCallsFailed,
        escalationAttempted: outcome.escalationAttempted,
        escalationSucceeded: outcome.escalationSucceeded,
      });
    }
  });
}
