import WebSocket from "ws";
import { and, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { dispatchAgentToolCall } from "../agent-tool-dispatch";
import { notifyInboundCall } from "../mobile-push";
import { enqueuePostCallDigest } from "../post-call-digest";
import { drizzle, fetchWithTimeout, log, tenantStore } from "../server-context";
import { trackVoiceMinutes } from "../voice-usage";
import type { ToolCallContext } from "../../routes/vapi/types";
import { buildGrokVoiceRealtimeUrl } from "./grok-voice-config";
import { buildXAIRealtimeAgentRuntime } from "./xai-agent-runtime";
import {
  XAI_REALTIME_CALLS_URL,
  normalizeXAIPhoneNumber,
  resolveXAISipSessionMaxSeconds,
} from "./xai-sip-config";

const WS_OPEN_TIMEOUT_MS = 15_000;
const PROVIDER_REQUEST_TIMEOUT_MS = 10_000;
const MAX_TRANSCRIPT_CHARS = 120_000;
const MAX_TOOL_OUTPUT_CHARS = 8_000;

export type XAISipIncomingCall = {
  callId: string;
  userId: string;
  agentId: string;
  callerNumber: string | null;
  calledNumber: string;
};

type PendingToolCall = {
  callId: string;
  name: string;
  arguments: unknown;
};

export type XAITranscriptLine = {
  role: "Caller" | "Agent";
  text: string;
};

function providerCallId(callId: string): string {
  return `xai:${callId}`;
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

/**
 * xAI transcription `updated` events are cumulative and can correct earlier
 * words. Insert the caller turn at its first event and mutate that same slot on
 * every update/completion so later agent turns retain their real chronology.
 */
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
  if (!response.ok) {
    throw new Error(`xAI ${action} returned HTTP ${response.status}.`);
  }
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
      direction: "inbound",
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
  await drizzle
    .insert(schema.signalPresence)
    .values({
      id: providerCallId(input.callId),
      userId: input.userId,
      agentId: input.agentId,
      customerNumber: input.callerNumber,
      status: "connected",
      label: `${agentName} · Live`,
      type: "voice",
      startedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.signalPresence.id,
      set: {
        userId: input.userId,
        agentId: input.agentId,
        customerNumber: input.callerNumber,
        status: "connected",
        label: `${agentName} · Live`,
        type: "voice",
        startedAt: new Date(),
      },
    });
}

function toolContext(input: {
  call: XAISipIncomingCall;
  agentName: string;
  toolCallId: string;
}): ToolCallContext {
  const call = {
    id: providerCallId(input.call.callId),
    type: "inboundPhoneCall",
    provider: "xai",
    customer: { number: input.call.callerNumber },
    phoneNumber: { number: input.call.calledNumber },
  };
  return {
    toolCallId: input.toolCallId,
    payload: { call },
    message: { type: "tool-calls", call },
    agent: {
      id: input.call.agentId,
      user_id: input.call.userId,
    },
    webhookAgentId: input.call.agentId,
    agentVoiceName: input.agentName,
    drizzle,
    log,
  };
}

async function persistFinishedCall(input: {
  call: XAISipIncomingCall;
  callLogId: bigint;
  agentName: string;
  startedAt: number;
  transcript: string;
  endedReason: string;
  pipelineError: string | null;
  toolCallsTotal: number;
  toolCallsFailed: number;
  escalationAttempted: boolean;
  escalationSucceeded: boolean;
}) {
  const durationSeconds = Math.max(0, Math.round((Date.now() - input.startedAt) / 1_000));
  const summary = deterministicSummary(input.transcript);

  await drizzle
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
      and(
        eq(schema.callLogs.id, input.callLogId),
        eq(schema.callLogs.userId, input.call.userId),
      ),
    );

  await drizzle
    .delete(schema.signalPresence)
    .where(
      and(
        eq(schema.signalPresence.id, providerCallId(input.call.callId)),
        eq(schema.signalPresence.userId, input.call.userId),
      ),
    );

  await trackVoiceMinutes({
    userId: input.call.userId,
    durationSeconds,
    vapiCallId: providerCallId(input.call.callId),
  });

  await enqueuePostCallDigest({
    userId: input.call.userId,
    callLogId: input.callLogId,
    agentId: input.call.agentId,
    dialedNumber: input.call.calledNumber,
    customerNumber: input.call.callerNumber,
    agentName: input.agentName,
    direction: "inbound",
    durationSeconds,
    summary,
    transcript: input.transcript,
    endedReason: input.endedReason,
    vapiCallType: "xai_sip_inbound",
    vapiCallId: providerCallId(input.call.callId),
  });
}

/**
 * Join an xAI Direct SIP call and own its complete realtime lifecycle.
 *
 * This function is intentionally a long-running promise. The webhook route
 * hands it to Vercel `waitUntil`; standalone deployments await it on their
 * normal Node process. `vercel.json` grants the API function 600 seconds and
 * this worker self-terminates at 540 seconds by default so cleanup can finish.
 */
export async function runXAISipCallSession(input: XAISipIncomingCall): Promise<void> {
  return tenantStore.run(input.userId, async () => {
    const callLogId = await claimCall(input);
    if (!callLogId) {
      log.info("Duplicate xAI incoming-call webhook adopted existing call", {
        callId: providerCallId(input.callId),
      });
      return;
    }

    const runtime = await buildXAIRealtimeAgentRuntime({
      userId: input.userId,
      agentId: input.agentId,
      surface: "phone",
    });
    await updatePresence(input, runtime.agentName);
    void notifyInboundCall(input.userId, {
      callId: providerCallId(input.callId),
      fromNumber: input.callerNumber || "unknown",
      agentName: runtime.agentName,
      agentId: input.agentId,
    });

    const apiKey = String(process.env.XAI_API_KEY || "").trim();
    if (!apiKey) throw new Error("XAI_API_KEY is missing during SIP session startup.");

    const startedAt = Date.now();
    const callerTranscriptIndexes = new Map<string, number>();
    const transcriptLines: XAITranscriptLine[] = [];
    const pendingTools = new Map<string, PendingToolCall>();
    let assistantTurn = "";
    let endedReason = "provider-disconnected";
    let pipelineError: string | null = null;
    let toolCallsTotal = 0;
    let toolCallsFailed = 0;
    let escalationAttempted = false;
    let escalationSucceeded = false;
    let eventChain = Promise.resolve();

    const ws = new WebSocket(
      `${buildGrokVoiceRealtimeUrl(runtime.model)}&call_id=${encodeURIComponent(input.callId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, handshakeTimeout: WS_OPEN_TIMEOUT_MS },
    );

    const maxDurationMs = resolveXAISipSessionMaxSeconds() * 1_000;
    const maxDurationTimer = setTimeout(() => {
      endedReason = "wireline-max-duration";
      void hangupXAISipCall(input.callId).catch(() => {
        log.warn("xAI max-duration hangup could not be confirmed", {
          callId: providerCallId(input.callId),
        });
      });
      ws.close(1000, "Wireline maximum duration reached");
    }, maxDurationMs);

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 25_000);

    const flushAssistantTurn = () => {
      const text = assistantTurn.trim();
      if (text) transcriptLines.push({ role: "Agent", text });
      assistantTurn = "";
    };

    const executePendingTools = async () => {
      if (!pendingTools.size || ws.readyState !== WebSocket.OPEN) return;
      const calls = [...pendingTools.values()];
      pendingTools.clear();
      const outputs = await Promise.all(
        calls.map(async (call) => {
          toolCallsTotal += 1;
          if (call.name === "escalate_to_human") escalationAttempted = true;
          try {
            const result = await dispatchAgentToolCall(
              call.name,
              call.arguments,
              toolContext({
                call: input,
                agentName: runtime.agentName,
                toolCallId: call.callId,
              }),
            );
            if (result.destination?.number) {
              await referXAISipCall(input.callId, result.destination.number);
              escalationSucceeded = true;
              endedReason = "transferred";
            }
            return {
              callId: call.callId,
              output: JSON.stringify({ result: result.result }).slice(0, MAX_TOOL_OUTPUT_CHARS),
            };
          } catch {
            toolCallsFailed += 1;
            return {
              callId: call.callId,
              output: JSON.stringify({
                error:
                  "The action could not be confirmed. Do not claim it happened; offer a safe alternative.",
              }),
            };
          }
        }),
      );

      for (const output of outputs) {
        sendJson(ws, {
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: output.callId,
            output: output.output,
          },
        });
      }
      if (endedReason !== "transferred") sendJson(ws, { type: "response.create" });
    };

    const handleEvent = async (event: Record<string, unknown>) => {
      const type = String(event.type || "");
      if (
        type === "conversation.item.input_audio_transcription.updated" ||
        type === "conversation.item.input_audio_transcription.completed"
      ) {
        const itemId = String(event.item_id || "caller");
        const transcript = typeof event.transcript === "string" ? event.transcript : "";
        upsertOrderedCallerTranscript(
          transcriptLines,
          callerTranscriptIndexes,
          itemId,
          transcript,
        );
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
          pendingTools.set(callId, {
            callId,
            name,
            arguments: safeToolArguments(event.arguments),
          });
        }
        return;
      }
      if (type === "response.done") {
        flushAssistantTurn();
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
        ws.on("open", () => {
          const session = {
            ...runtime.session,
            instructions: `${runtime.session.instructions}\n\nOPENING: Begin the call by saying: ${runtime.greeting}`,
          };
          sendJson(ws, { type: "session.update", session });
          sendJson(ws, { type: "response.create" });
        });
        ws.on("message", (data) => {
          const event = safeJsonParse(data.toString());
          if (!event) return;
          eventChain = eventChain.then(() => handleEvent(event));
          eventChain.catch(reject);
        });
        ws.on("error", () => {
          pipelineError = "connection";
          reject(new Error("XAI_REALTIME_WEBSOCKET_ERROR"));
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
          eventChain.then(resolve).catch(reject);
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
        await hangupXAISipCall(input.callId);
      } catch {
        // The provider may already have ended the call.
      }
    } finally {
      clearTimeout(maxDurationTimer);
      clearInterval(heartbeat);
      flushAssistantTurn();
      const transcript = compactXAITranscript(transcriptLines);
      await persistFinishedCall({
        call: input,
        callLogId,
        agentName: runtime.agentName,
        startedAt,
        transcript,
        endedReason,
        pipelineError,
        toolCallsTotal,
        toolCallsFailed,
        escalationAttempted,
        escalationSucceeded,
      });
    }
  });
}
