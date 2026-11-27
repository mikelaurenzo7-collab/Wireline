import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { eq } from "drizzle-orm";
import WebSocket, { WebSocketServer, type RawData } from "ws";

import * as schema from "../../db/schema";
import { assertPrivateVoiceSimulationAllowed } from "../account-environment-policy";
import { AppError } from "../api-error";
import { runInBackground } from "../background-work";
import { markRealtimeProviderCallOutcome } from "../realtime-provider-outcome";
import { drizzle, log, serialQueryBatch, tenantStore } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import { composeInboundOpening } from "./inbound-opening";
import { runOpenAILiveVoiceTool } from "./openai-live-agent-service";
import { buildOpenAIRealtimeAgentRuntime } from "./openai-phone-agent-runtime";
import { configuredPhoneVoiceProvider, XAI_REALTIME_WEBSOCKET_URL } from "./realtime-provider";
import { spokenBusinessName } from "./spoken-business-name";
import {
  resolveXAIGrokVoiceModel,
  resolveXAIReasoningEffort,
  stockFallbackVoiceFor,
  toXAIRealtimeSession,
  xaiForceMessage,
  xaiForcedMessagePlaybackMs,
  xaiVoiceForSavedVoice,
  type XAIGrokVoice,
} from "./xai-voice-config";

/**
 * Studio voice rehearsal on xAI Grok Voice, relayed through BotBound.
 *
 * xAI serves browsers over WebSocket only, and its short-lived client tokens
 * cannot carry session settings, so a direct browser connection would have to
 * send the Bot's full prompt from the page. The relay keeps the API key, the
 * prompt, tool execution and the time limit on the server: the browser sends
 * microphone audio and typed lines, and receives the Bot's audio and a
 * transcript in a small BotBound protocol that never names the provider.
 *
 * The session is built by the phone runtime's private-test surface, so the
 * prompt, the voice mapping and the spoken opening match what callers hear,
 * while the only tool is approved-knowledge search.
 */
export const XAI_REHEARSAL_RELAY_PATH = "/api/voice/live/relay";
export const XAI_REHEARSAL_RELAY_PROTOCOL = "botbound-rehearsal.v1";
const TICKET_PROTOCOL_PREFIX = "ticket.";
/** Cleanup tickets for relayed rehearsals carry this call-id prefix. */
export const XAI_REHEARSAL_CALL_ID_PREFIX = "xai-rehearsal:";
/** PCM16 mono in both directions; 48 bytes per millisecond. */
export const XAI_REHEARSAL_SAMPLE_RATE = 24_000;
const BYTES_PER_MS = (XAI_REHEARSAL_SAMPLE_RATE * 2) / 1_000;
export const XAI_REHEARSAL_MAX_SECONDS = 300;

const CONFIGURE_TIMEOUT_MS = 6_000;
const ATTACH_WINDOW_MS = 20_000;
const MAX_ACTIVE_RELAYS = 24;
const MAX_ACTIVE_RELAYS_PER_USER = 2;
const MAX_BROWSER_FRAME_BYTES = 32_768;
const MAX_TYPED_LINE_CHARS = 2_000;
const MAX_TYPED_LINES = 200;
/** Holds account deletion off for the longest rehearsal plus its attach window. */
const RELAY_DELETION_LEASE_MS = 10 * 60_000;
/**
 * A reply BotBound requests must be acknowledged; xAI can drop that
 * acknowledgement (see the phone session), so retry a bounded number of times.
 */
const REPLY_ACK_TIMEOUT_MS = 4_000;
const MAX_REPLY_ATTEMPTS = 3;
/** After the owner stops talking, xAI's own reply normally starts within this. */
const AUTO_RESPONSE_WAIT_MS = 3_000;

export type RelayTiming = { replyAckMs?: number; autoResponseMs?: number };

/**
 * The route's spend reservation. It is committed when the browser attaches
 * and released if the rehearsal ends before that, so a browser that cannot
 * connect never uses up the owner's allowance.
 */
export type RelaySpend = { commit: () => Promise<void>; release: () => Promise<void> };

/** Rehearsal follows the phone line's provider so owners hear what callers hear. */
export type RehearsalVoiceProviderChoice =
  | { provider: "xai" }
  | { provider: "openai"; reason: "rehearsal_opt_out" | "phone_on_openai" | "xai_not_configured" };

export function rehearsalVoiceProvider(
  env: NodeJS.ProcessEnv = process.env,
): RehearsalVoiceProviderChoice {
  const override = String(env.WIRELINE_REHEARSAL_VOICE_PROVIDER || "")
    .trim()
    .toLowerCase();
  if (override === "openai") return { provider: "openai", reason: "rehearsal_opt_out" };
  if (configuredPhoneVoiceProvider(env) === "openai") {
    return { provider: "openai", reason: "phone_on_openai" };
  }
  if (!String(env.XAI_API_KEY || "").trim()) {
    return { provider: "openai", reason: "xai_not_configured" };
  }
  return { provider: "xai" };
}

/** xAI could not open this rehearsal; the browser falls back to OpenAI Realtime. */
export class XAIRehearsalUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`xAI rehearsal unavailable: ${reason}`);
    this.name = "XAIRehearsalUnavailableError";
    // Nothing was spoken, so the reservation can be released for the fallback.
    markRealtimeProviderCallOutcome(this, false);
  }
}

/**
 * Same instruction the phone session adds after the connection speaks the
 * opening, so the Bot does not introduce itself a second time.
 */
const AFTER_OPENING_INSTRUCTIONS =
  "The connection delivers the opening greeting and AI disclosure. After the caller speaks, lead with a direct answer in one or two short sentences when possible. Use natural phrasing and ordinary punctuation. Skip repeated acknowledgments and filler. Do not restart the introduction or give your name again unless they ask who is speaking. Addressing you by name is not a request for an introduction. If they interrupt or correct a detail, use the latest request or correction and ask only for the next missing detail.";

type EndReason =
  | "stopped"
  | "browser_closed"
  | "time_limit"
  | "attach_timeout"
  | "provider_closed"
  | "reply_failed"
  | "spend_unavailable"
  | "restarting";

const END_MESSAGES: Partial<Record<EndReason, string>> = {
  time_limit: "This rehearsal reached its time limit.",
  provider_closed: "The voice connection ended. Start the rehearsal again to continue.",
  reply_failed: "The Bot could not finish its voice reply. Start the rehearsal again.",
  spend_unavailable:
    "BotBound could not confirm this rehearsal against your allowance. Try again shortly.",
  restarting: "BotBound is updating. Start the rehearsal again in a moment.",
};

type PlaybackItem = { itemId: string; responseId: string; start: number; durationMs: number };

type RelaySession = {
  publicId: string;
  ticket: string;
  userId: string;
  agentId: string;
  tenantId: string;
  voice: XAIGrokVoice;
  opening: string;
  /** The Bot's own pace, so the opening's playback estimate allows for a slower voice. */
  speakingRate: number | null;
  upstream: WebSocket;
  browser: WebSocket | null;
  createdAt: number;
  attachedAt: number | null;
  deadlineAt: number;
  attachTimer: ReturnType<typeof setTimeout> | null;
  deadlineTimer: ReturnType<typeof setTimeout> | null;
  ended: boolean;
  openingResponseId: string | null;
  /** Set once the opening has streamed; barge-in waits for its playback too. */
  openingDone: boolean;
  openingPlaybackUntil: number;
  openingTimer: ReturnType<typeof setTimeout> | null;
  /** The provider's transcript of the opening, held until it proves to be one. */
  openingEcho: { key: string | null; text: string } | null;
  /** Estimated end of queued Bot audio in the browser, for interruptions. */
  queuedUntil: number;
  playback: Map<string, PlaybackItem>;
  interruptedResponses: Set<string>;
  pendingTools: Promise<void>;
  typedLines: number;
  callerTurnEndedAt: number | null;
  replyLatenciesMs: number[];
  respondingId: string | null;
  callerTurns: number;
  botTurns: number;
  /** Responses the provider has started and not finished. */
  activeResponses: Set<string>;
  callerSpeaking: boolean;
  /** The owner just finished speaking; xAI's own reply is about to start. */
  awaitingAutoResponse: boolean;
  autoResponseTimer: ReturnType<typeof setTimeout> | null;
  /** A knowledge result or typed line is waiting for the Bot's reply. */
  replyPending: boolean;
  /** The owner spoke or typed and the Bot has not yet finished a reply to it. */
  ownerTurnOpen: boolean;
  /** Tag of the reply BotBound requested and xAI has not yet acknowledged. */
  requestedReply: string | null;
  replyAttempts: number;
  replyWatchdog: ReturnType<typeof setTimeout> | null;
  timing: Required<RelayTiming>;
  spend: RelaySpend | null;
  spendState: "reserved" | "committing" | "committed" | "released";
};

const sessionsByTicket = new Map<string, RelaySession>();
const sessionsById = new Map<string, RelaySession>();
// Counted from before the first await, so concurrent starts respect the limits.
const pendingByUser = new Map<string, number>();
let pendingTotal = 0;
let acceptingRelays = true;

function activeSessionsForUser(userId: string): number {
  let count = pendingByUser.get(userId) ?? 0;
  for (const session of sessionsById.values()) if (session.userId === userId) count += 1;
  return count;
}

export function activeRehearsalRelayCount(): number {
  return sessionsById.size;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sendUpstream(session: RelaySession, value: unknown): void {
  if (session.upstream.readyState === WebSocket.OPEN) session.upstream.send(JSON.stringify(value));
}

function sendBrowser(session: RelaySession, value: unknown): void {
  const browser = session.browser;
  if (browser?.readyState === WebSocket.OPEN) browser.send(JSON.stringify(value));
}

function keyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 24);
}

async function rehearsalBusinessName(userId: string): Promise<string | null> {
  const [settings, owners] = await drizzle.transaction((tx) =>
    serialQueryBatch([
      tx
        .select({
          businessName: schema.settings.businessName,
          workspaceDisplayName: schema.settings.workspaceDisplayName,
        })
        .from(schema.settings)
        .where(eq(schema.settings.userId, userId))
        .limit(1),
      tx
        .select({ fullName: schema.users.fullName })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1),
    ]),
  );
  return spokenBusinessName({
    businessName: settings[0]?.businessName,
    workspaceDisplayName: settings[0]?.workspaceDisplayName,
    accountDisplayName: owners[0]?.fullName,
  });
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function endSession(session: RelaySession, reason: EndReason): void {
  if (session.ended) return;
  session.ended = true;
  if (session.attachTimer) clearTimeout(session.attachTimer);
  if (session.deadlineTimer) clearTimeout(session.deadlineTimer);
  if (session.openingTimer) clearTimeout(session.openingTimer);
  if (session.autoResponseTimer) clearTimeout(session.autoResponseTimer);
  if (session.replyWatchdog) clearTimeout(session.replyWatchdog);
  sessionsByTicket.delete(session.ticket);
  sessionsById.delete(session.publicId);
  // Nothing was spoken before the browser attached, so its reservation and
  // minute quota go back to the owner.
  const spend = session.spend;
  if (spend && session.spendState === "reserved") {
    session.spendState = "released";
    runInBackground("xAI rehearsal reservation release", () => spend.release());
  }
  const message = END_MESSAGES[reason];
  const browser = session.browser;
  if (browser && browser.readyState === WebSocket.OPEN) {
    browser.send(JSON.stringify({ type: "ended", reason, ...(message ? { message } : {}) }));
    browser.close(1000, "Rehearsal ended");
  }
  if (session.upstream.readyState === WebSocket.OPEN)
    session.upstream.close(1000, "Rehearsal ended");
  else if (session.upstream.readyState === WebSocket.CONNECTING) session.upstream.terminate();
  const startedAt = session.attachedAt ?? session.createdAt;
  log.info("xAI voice rehearsal ended", {
    userId: session.userId,
    agentId: session.agentId,
    rehearsalId: session.publicId,
    reason,
    durationSeconds: Math.round((Date.now() - startedAt) / 1_000),
    attached: session.attachedAt !== null,
    callerTurns: session.callerTurns,
    botTurns: session.botTurns,
    replyLatencyMedianMs: median(session.replyLatenciesMs),
    replyLatencyMaxMs: session.replyLatenciesMs.length
      ? Math.max(...session.replyLatenciesMs)
      : null,
    replyLatencySamples: session.replyLatenciesMs.length,
  });
}

/** End every relayed rehearsal and tell each owner to start again. */
export function endAllRehearsalRelays(reason: Extract<EndReason, "restarting"> = "restarting") {
  for (const session of [...sessionsById.values()]) endSession(session, reason);
}

/**
 * Shutdown: open no new relays (owners fall back to OpenAI until the new
 * process is up) and end the open ones with a start-again message.
 */
export function closeRehearsalRelays(): void {
  acceptingRelays = false;
  endAllRehearsalRelays("restarting");
}

/** Owner stop through the cleanup ticket; a missing session already ended. */
export function stopRehearsalRelay(input: { userId: string; callId: string }): boolean {
  if (!input.callId.startsWith(XAI_REHEARSAL_CALL_ID_PREFIX)) return false;
  const session = sessionsById.get(input.callId.slice(XAI_REHEARSAL_CALL_ID_PREFIX.length));
  if (session && session.userId === input.userId) endSession(session, "stopped");
  return true;
}

function openUpstream(apiKey: string): WebSocket {
  const url = new URL(XAI_REALTIME_WEBSOCKET_URL);
  url.searchParams.set("model", resolveXAIGrokVoiceModel());
  url.searchParams.set("reasoning.effort", resolveXAIReasoningEffort());
  return new WebSocket(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    handshakeTimeout: CONFIGURE_TIMEOUT_MS,
    maxPayload: 1_048_576,
    perMessageDeflate: false,
  });
}

function configureUpstream(upstream: WebSocket, session: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: XAIRehearsalUnavailableError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      upstream.off("message", onMessage);
      upstream.off("error", onError);
      upstream.off("close", onClose);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new XAIRehearsalUnavailableError("configure_timeout")),
      CONFIGURE_TIMEOUT_MS,
    );
    const onMessage = (raw: RawData) => {
      let event: Record<string, unknown>;
      try {
        event = asRecord(JSON.parse(String(raw)));
      } catch {
        return;
      }
      if (event.type === "session.updated") finish();
      else if (event.type === "error") {
        const detail = asRecord(event.error);
        log.warn("xAI rehearsal session was rejected", {
          code: typeof detail.code === "string" ? detail.code : null,
          message: typeof detail.message === "string" ? detail.message.slice(0, 300) : null,
        });
        finish(new XAIRehearsalUnavailableError("session_rejected"));
      }
    };
    const onError = (error: Error) => {
      log.warn("xAI rehearsal connection failed", { error: getErrorMessage(error) });
      finish(new XAIRehearsalUnavailableError("connect_failed"));
    };
    const onClose = (code: number) =>
      finish(new XAIRehearsalUnavailableError(`closed_${code || "unknown"}`));
    upstream.on("message", onMessage);
    upstream.on("error", onError);
    upstream.on("close", onClose);
    upstream.once("open", () => upstream.send(JSON.stringify({ type: "session.update", session })));
  });
}

/**
 * Open and configure the provider session for an authenticated owner. The
 * browser then has a short window to attach with the single-use ticket.
 */
type RelayInput = {
  userId: string;
  agentId: string;
  maxDurationSeconds?: number;
  env?: NodeJS.ProcessEnv;
  spend?: RelaySpend;
  /** Test hook; production uses the defaults above. */
  timing?: RelayTiming;
};

export async function createXAIRehearsalRelay(input: RelayInput) {
  const env = input.env ?? process.env;
  const apiKey = String(env.XAI_API_KEY || "").trim();
  if (!apiKey) throw new XAIRehearsalUnavailableError("xai_not_configured");
  if (!acceptingRelays) throw new XAIRehearsalUnavailableError("restarting");
  if (sessionsById.size + pendingTotal >= MAX_ACTIVE_RELAYS) {
    throw new XAIRehearsalUnavailableError("relay_capacity");
  }
  if (activeSessionsForUser(input.userId) >= MAX_ACTIVE_RELAYS_PER_USER) {
    throw new AppError(
      429,
      "REHEARSAL_ALREADY_ACTIVE",
      "A voice rehearsal is already running. End it before starting another.",
    );
  }
  pendingTotal += 1;
  pendingByUser.set(input.userId, (pendingByUser.get(input.userId) ?? 0) + 1);
  try {
    // The same account checks as the WebRTC rehearsal: environment policy,
    // and a deletion lease so an account purge waits for this session.
    await assertPrivateVoiceSimulationAllowed(input.userId, "xai_rehearsal_relay");
    const outcome = await runTenantProviderWorkWithDeletionFence({
      userId: input.userId,
      operation: "xai_rehearsal_relay_create",
      ttlMs: RELAY_DELETION_LEASE_MS,
      retainOnSuccess: true,
      perform: () => openRelaySession(input, env, apiKey),
    });
    if (!outcome.performed) {
      throw AppError.conflict(
        "This workspace has reached its account-deletion deadline. A new rehearsal cannot start.",
      );
    }
    return outcome.result;
  } finally {
    pendingTotal -= 1;
    const left = (pendingByUser.get(input.userId) ?? 1) - 1;
    if (left > 0) pendingByUser.set(input.userId, left);
    else pendingByUser.delete(input.userId);
  }
}

async function openRelaySession(input: RelayInput, env: NodeJS.ProcessEnv, apiKey: string) {
  // Owner and Bot errors (missing Bot, review hold) surface as-is; only
  // provider trouble falls back to OpenAI.
  const runtime = await buildOpenAIRealtimeAgentRuntime({
    userId: input.userId,
    agentId: input.agentId,
    surface: "browser_test",
  });
  const businessName = await rehearsalBusinessName(input.userId);
  // Phone calls speak a consented clone natively, or its closest stock voice;
  // rehearsal stays on stock (Studio labels the difference) and otherwise uses
  // the exact voice a caller hears for the saved choice.
  const voice = runtime.customVoice
    ? stockFallbackVoiceFor(runtime.stockPhoneVoice, runtime.customVoice.gender)
    : xaiVoiceForSavedVoice(runtime.stockPhoneVoice);
  const opening = composeInboundOpening({
    greeting: runtime.greeting,
    agentName: runtime.agentName,
    businessName,
    // Rehearsals are not recorded, so the opening makes no recording claim.
    recordingEnabled: false,
  });
  const xaiSession = toXAIRealtimeSession(runtime.session as Record<string, unknown>, {
    instructions: `${runtime.session.instructions}\n\n${AFTER_OPENING_INSTRUCTIONS}`,
    keyterms: [runtime.agentName, businessName ?? "", ...runtime.delivery.recognizedNames],
    customVoiceId: voice,
    // The same pace and pronunciations a caller hears, so a rehearsal sounds like the call.
    speakingRate: runtime.delivery.speakingRate,
    pronunciations: runtime.delivery.pronunciations,
  });
  const audio = asRecord(xaiSession.audio);
  xaiSession.audio = {
    ...audio,
    input: {
      ...asRecord(audio.input),
      format: { type: "audio/pcm", rate: XAI_REHEARSAL_SAMPLE_RATE },
    },
    // Keeps the speaking rate a caller hears, so a rehearsal sounds like the call.
    output: {
      ...asRecord(audio.output),
      format: { type: "audio/pcm", rate: XAI_REHEARSAL_SAMPLE_RATE },
    },
  };

  const startedAt = Date.now();
  const upstream = openUpstream(apiKey);
  try {
    await configureUpstream(upstream, xaiSession);
  } catch (error) {
    upstream.removeAllListeners();
    upstream.on("error", () => undefined);
    if (upstream.readyState === WebSocket.OPEN) upstream.close(1000, "Rehearsal not started");
    else upstream.terminate();
    throw error;
  }

  const maxDurationSeconds = Math.max(
    15,
    Math.min(input.maxDurationSeconds ?? XAI_REHEARSAL_MAX_SECONDS, XAI_REHEARSAL_MAX_SECONDS),
  );
  const session: RelaySession = {
    publicId: randomBytes(16).toString("hex"),
    ticket: randomBytes(32).toString("base64url"),
    userId: input.userId,
    agentId: runtime.agentId,
    tenantId: tenantStore.getStore() ?? input.userId,
    voice,
    opening,
    speakingRate: runtime.delivery.speakingRate,
    upstream,
    browser: null,
    createdAt: Date.now(),
    attachedAt: null,
    deadlineAt: Date.now() + maxDurationSeconds * 1_000,
    attachTimer: null,
    deadlineTimer: null,
    ended: false,
    openingResponseId: null,
    openingDone: false,
    openingPlaybackUntil: 0,
    openingTimer: null,
    openingEcho: { key: null, text: "" },
    queuedUntil: 0,
    playback: new Map(),
    interruptedResponses: new Set(),
    pendingTools: Promise.resolve(),
    typedLines: 0,
    callerTurnEndedAt: null,
    replyLatenciesMs: [],
    respondingId: null,
    callerTurns: 0,
    botTurns: 0,
    activeResponses: new Set(),
    callerSpeaking: false,
    awaitingAutoResponse: false,
    autoResponseTimer: null,
    replyPending: false,
    ownerTurnOpen: false,
    requestedReply: null,
    replyAttempts: 0,
    replyWatchdog: null,
    timing: {
      replyAckMs: input.timing?.replyAckMs ?? REPLY_ACK_TIMEOUT_MS,
      autoResponseMs: input.timing?.autoResponseMs ?? AUTO_RESPONSE_WAIT_MS,
    },
    spend: input.spend ?? null,
    spendState: "reserved",
  };
  sessionsByTicket.set(session.ticket, session);
  sessionsById.set(session.publicId, session);
  session.attachTimer = setTimeout(() => endSession(session, "attach_timeout"), ATTACH_WINDOW_MS);
  session.attachTimer.unref?.();
  session.deadlineTimer = setTimeout(
    () => endSession(session, "time_limit"),
    maxDurationSeconds * 1_000,
  );
  session.deadlineTimer.unref?.();
  upstream.on("error", (error) =>
    log.warn("xAI rehearsal connection error", {
      rehearsalId: session.publicId,
      error: getErrorMessage(error),
    }),
  );
  upstream.on("close", () => endSession(session, "provider_closed"));
  upstream.on("message", (raw) => handleUpstreamEvent(session, raw));

  log.info("xAI voice rehearsal opened", {
    userId: input.userId,
    agentId: runtime.agentId,
    rehearsalId: session.publicId,
    model: resolveXAIGrokVoiceModel(env),
    voice,
    configureMs: Date.now() - startedAt,
    maxDurationSeconds,
  });

  return {
    callId: `${XAI_REHEARSAL_CALL_ID_PREFIX}${session.publicId}`,
    keyFingerprint: keyFingerprint(apiKey),
    ticket: session.ticket,
    maxDurationSeconds,
    voice,
    agentId: runtime.agentId,
    model: resolveXAIGrokVoiceModel(env),
  };
}

function markInterrupted(session: RelaySession): void {
  const now = Date.now();
  for (const item of session.playback.values()) {
    if (item.responseId) session.interruptedResponses.add(item.responseId);
    const playedMs = Math.min(item.durationMs, Math.max(0, now - item.start));
    if (playedMs < item.durationMs) {
      // Keep the Bot's memory to what the owner actually heard.
      sendUpstream(session, {
        type: "conversation.item.truncate",
        item_id: item.itemId,
        content_index: 0,
        audio_end_ms: Math.floor(playedMs),
      });
    }
  }
  if (session.respondingId) session.interruptedResponses.add(session.respondingId);
  session.playback.clear();
  session.queuedUntil = 0;
  while (session.interruptedResponses.size > 128) {
    const oldest = session.interruptedResponses.values().next().value;
    if (oldest === undefined) break;
    session.interruptedResponses.delete(oldest);
  }
  sendBrowser(session, { type: "interrupt" });
}

function clearReplyWatchdog(session: RelaySession): void {
  if (session.replyWatchdog) clearTimeout(session.replyWatchdog);
  session.replyWatchdog = null;
}

/**
 * Ask for the Bot's reply to a knowledge result or typed line only when no
 * response is active, the owner is not talking, and xAI is not about to answer
 * the owner by itself; xAI rejects a second active response, which would leave
 * the Bot silent. The same gate guards phone calls (openai-sip-session.ts).
 */
function requestReplyWhenReady(session: RelaySession): void {
  if (session.ended || !session.replyPending || !session.openingDone) return;
  if (
    session.activeResponses.size ||
    session.callerSpeaking ||
    session.awaitingAutoResponse ||
    session.requestedReply ||
    session.upstream.readyState !== WebSocket.OPEN
  )
    return;
  session.replyPending = false;
  const tag = randomUUID();
  session.requestedReply = tag;
  session.replyAttempts += 1;
  sendUpstream(session, {
    type: "response.create",
    response: { metadata: { botbound_rehearsal_reply: tag } },
  });
  clearReplyWatchdog(session);
  session.replyWatchdog = setTimeout(() => {
    session.replyWatchdog = null;
    if (session.ended || session.requestedReply !== tag) return;
    // The acknowledgement never came: release the claim and retry, a bounded
    // number of times, instead of leaving the owner in silence.
    session.requestedReply = null;
    log.warn("xAI rehearsal reply was not acknowledged", {
      rehearsalId: session.publicId,
      attempt: session.replyAttempts,
    });
    if (session.replyAttempts >= MAX_REPLY_ATTEMPTS) {
      session.replyAttempts = 0;
      return;
    }
    session.replyPending = true;
    requestReplyWhenReady(session);
  }, session.timing.replyAckMs);
  session.replyWatchdog.unref?.();
}

function normalizedSpeech(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function finishOpening(session: RelaySession): void {
  if (session.openingDone) return;
  session.openingDone = true;
  session.openingPlaybackUntil = Math.max(Date.now(), session.queuedUntil);
  if (session.openingTimer) clearTimeout(session.openingTimer);
  session.openingTimer = null;
  // A line typed during the opening is answered once it has played.
  requestReplyWhenReady(session);
}

/**
 * The opening is already on screen verbatim. Hold the provider's transcript
 * while it still reads as that opening, and show it only if it turns out to
 * be a different reply.
 */
function relayBotTranscript(
  session: RelaySession,
  key: string,
  text: string,
  final: boolean,
): void {
  const echo = session.openingEcho;
  if (echo && (echo.key === null || echo.key === key)) {
    const opening = normalizedSpeech(session.opening);
    if (final) {
      session.openingEcho = null;
      if (normalizedSpeech(text) === opening) return;
    } else {
      const candidate = echo.text + text;
      if (opening.startsWith(normalizedSpeech(candidate))) {
        session.openingEcho = { key, text: candidate };
        return;
      }
      session.openingEcho = null;
      sendBrowser(session, { type: "bot_text", id: key, text: candidate, final: false });
      return;
    }
  }
  sendBrowser(session, { type: "bot_text", id: key, text, final });
}

async function runKnowledgeTool(session: RelaySession, event: Record<string, unknown>) {
  const name = typeof event.name === "string" ? event.name : "";
  const callId = typeof event.call_id === "string" ? event.call_id : "";
  if (!callId) return;
  sendBrowser(session, { type: "thinking", active: true });
  let result: unknown;
  try {
    let args: unknown = {};
    try {
      args = typeof event.arguments === "string" ? JSON.parse(event.arguments) : {};
    } catch {
      args = {};
    }
    result = await tenantStore.run(session.tenantId, () =>
      runOpenAILiveVoiceTool({
        userId: session.userId,
        agentId: session.agentId,
        name,
        arguments: args,
      }),
    );
  } catch (error) {
    result = {
      error: error instanceof AppError ? error.message : "Approved knowledge is unavailable.",
    };
  }
  if (session.ended) return;
  sendBrowser(session, { type: "thinking", active: false });
  sendUpstream(session, {
    type: "conversation.item.create",
    item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) },
  });
  // The response that asked for the lookup is usually still active.
  session.replyPending = true;
  requestReplyWhenReady(session);
}

function handleUpstreamEvent(session: RelaySession, raw: RawData): void {
  if (session.ended) return;
  let event: Record<string, unknown>;
  try {
    event = asRecord(JSON.parse(String(raw)));
  } catch {
    return;
  }
  const type = String(event.type || "");
  const response = asRecord(event.response);
  const responseId =
    typeof event.response_id === "string"
      ? event.response_id
      : typeof response.id === "string"
        ? response.id
        : "";
  const interrupted = Boolean(responseId && session.interruptedResponses.has(responseId));

  if (type === "response.created") {
    // Registered first, so nothing requests another reply while this one runs.
    // Only identified responses are tracked, as on the phone path, so an event
    // without an id can never block later replies.
    if (responseId) session.activeResponses.add(responseId);
    session.respondingId = responseId || null;
    const metadata = asRecord(response.metadata);
    const requested =
      Boolean(session.requestedReply) &&
      metadata.botbound_rehearsal_reply === session.requestedReply;
    // The opening's own response comes first; a requested reply, or anything
    // after the opening has finished, is a model turn.
    const isOpening =
      !requested &&
      !session.openingDone &&
      (!session.openingResponseId || responseId === session.openingResponseId);
    if (isOpening) {
      session.openingResponseId ??= responseId || "opening";
      return;
    }
    // A model turn starts only after the opening has played.
    finishOpening(session);
    // Any reply that starts after a request answers it, whether or not xAI
    // echoed the tag, so a retry can never make the Bot answer twice.
    if (session.requestedReply) {
      session.requestedReply = null;
      session.replyAttempts = 0;
      clearReplyWatchdog(session);
    }
    // A reply sees everything already in the conversation, including a
    // pending lookup result or typed line.
    session.awaitingAutoResponse = false;
    if (session.autoResponseTimer) clearTimeout(session.autoResponseTimer);
    session.autoResponseTimer = null;
    session.replyPending = false;
    return;
  }

  if (
    (type === "response.output_audio.delta" || type === "response.audio.delta") &&
    typeof event.delta === "string" &&
    event.delta
  ) {
    if (interrupted) return;
    const pcm = Buffer.from(event.delta, "base64");
    if (!pcm.length) return;
    const now = Date.now();
    if (session.callerTurnEndedAt !== null) {
      session.replyLatenciesMs.push(now - session.callerTurnEndedAt);
      session.callerTurnEndedAt = null;
    }
    const durationMs = pcm.length / BYTES_PER_MS;
    const start = Math.max(now, session.queuedUntil);
    session.queuedUntil = start + durationMs;
    const itemId = typeof event.item_id === "string" ? event.item_id : "";
    if (itemId) {
      const item = session.playback.get(itemId);
      if (item) item.durationMs += durationMs;
      else session.playback.set(itemId, { itemId, responseId, start, durationMs });
    }
    if (session.browser?.readyState === WebSocket.OPEN) session.browser.send(pcm);
    return;
  }

  if (type === "response.output_audio_transcript.delta" && typeof event.delta === "string") {
    if (!interrupted) {
      relayBotTranscript(session, String(event.item_id || responseId || "bot"), event.delta, false);
    }
    return;
  }
  if (type === "response.output_audio_transcript.done" && typeof event.transcript === "string") {
    relayBotTranscript(
      session,
      String(event.item_id || responseId || "bot"),
      event.transcript,
      true,
    );
    return;
  }

  if (
    type === "conversation.item.input_audio_transcription.delta" ||
    type === "conversation.item.input_audio_transcription.updated" ||
    type === "conversation.item.input_audio_transcription.completed"
  ) {
    const id = String(event.item_id || "caller");
    // xAI's updated and completed events carry the cumulative transcript.
    if (typeof event.transcript === "string") {
      sendBrowser(session, {
        type: "caller_text",
        id,
        text: event.transcript,
        final: type.endsWith(".completed"),
      });
    } else if (typeof event.delta === "string") {
      sendBrowser(session, { type: "caller_text", id, text: event.delta, append: true });
    }
    if (type.endsWith(".completed")) session.callerTurns += 1;
    return;
  }

  if (type === "input_audio_buffer.speech_started") {
    // As on a call, the opening is not interruptible.
    if (!session.openingDone || Date.now() < session.openingPlaybackUntil) return;
    session.callerSpeaking = true;
    markInterrupted(session);
    return;
  }
  if (type === "input_audio_buffer.speech_stopped" || type === "input_audio_buffer.committed") {
    if (type === "input_audio_buffer.speech_stopped") session.callerTurnEndedAt = Date.now();
    session.callerSpeaking = false;
    if (session.openingDone) session.ownerTurnOpen = true;
    // xAI creates its reply to the owner next; never insert one into that gap.
    // If none starts, a pending reply goes ahead after a short wait.
    session.awaitingAutoResponse = true;
    if (session.autoResponseTimer) clearTimeout(session.autoResponseTimer);
    session.autoResponseTimer = setTimeout(() => {
      session.autoResponseTimer = null;
      session.awaitingAutoResponse = false;
      requestReplyWhenReady(session);
    }, session.timing.autoResponseMs);
    session.autoResponseTimer.unref?.();
    return;
  }

  if (type === "response.function_call_arguments.done") {
    session.pendingTools = session.pendingTools
      .then(() => runKnowledgeTool(session, event))
      .catch((error: unknown) =>
        log.warn("xAI rehearsal knowledge lookup failed", {
          rehearsalId: session.publicId,
          error: getErrorMessage(error),
        }),
      );
    return;
  }

  if (type === "response.done") {
    const status = typeof response.status === "string" ? response.status : "";
    if (responseId) session.activeResponses.delete(responseId);
    else session.activeResponses.clear();
    const wasOpening =
      !session.openingDone && (!responseId || responseId === session.openingResponseId);
    if (wasOpening) finishOpening(session);
    if (!responseId || responseId === session.respondingId) session.respondingId = null;
    if (status === "failed") {
      log.warn("xAI rehearsal reply failed", {
        rehearsalId: session.publicId,
        details: JSON.stringify(response.status_details ?? null).slice(0, 300),
      });
      sendBrowser(session, { type: "turn_done", completed: false });
      endSession(session, "reply_failed");
      return;
    }
    const output = Array.isArray(response.output) ? response.output : [];
    const spoke =
      wasOpening ||
      output.some((item) => {
        const record = asRecord(item);
        return record.type === "message" && record.role === "assistant";
      });
    if (spoke && !interrupted) session.botTurns += 1;
    const completed = status === "completed" && spoke && !interrupted;
    // Known here, before the owner's transcript may have finished arriving.
    const answeredOwner = completed && !wasOpening && session.ownerTurnOpen;
    if (answeredOwner) session.ownerTurnOpen = false;
    sendBrowser(session, {
      type: "turn_done",
      completed,
      ...(answeredOwner ? { answeredOwner: true } : {}),
    });
    requestReplyWhenReady(session);
    return;
  }

  if (type === "error") {
    // Most provider errors leave the session usable (for example a truncate
    // that raced a finished reply). A fatal one closes the socket.
    const detail = asRecord(event.error);
    log.warn("xAI rehearsal provider error", {
      rehearsalId: session.publicId,
      code: typeof detail.code === "string" ? detail.code : null,
      message: typeof detail.message === "string" ? detail.message.slice(0, 300) : null,
    });
  }
}

function handleBrowserMessage(session: RelaySession, data: RawData, isBinary: boolean): void {
  if (session.ended) return;
  if (isBinary) {
    const chunk = Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data as ArrayBuffer);
    if (!chunk.length || chunk.length > MAX_BROWSER_FRAME_BYTES || chunk.length % 2 !== 0) return;
    sendUpstream(session, { type: "input_audio_buffer.append", audio: chunk.toString("base64") });
    return;
  }
  let message: Record<string, unknown>;
  try {
    message = asRecord(JSON.parse(String(data)));
  } catch {
    return;
  }
  if (message.type === "user_text" && typeof message.text === "string") {
    const text = message.text.trim().slice(0, MAX_TYPED_LINE_CHARS);
    if (!text || session.typedLines >= MAX_TYPED_LINES) return;
    session.typedLines += 1;
    session.callerTurns += 1;
    session.callerTurnEndedAt = Date.now();
    session.ownerTurnOpen = true;
    sendUpstream(session, {
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    });
    // Lines typed in quick succession share one reply.
    session.replyPending = true;
    if (session.openingDone && (session.activeResponses.size || session.playback.size)) {
      // Typing over the Bot interrupts it, as speaking would; the reply
      // follows once the interrupted response has finished.
      markInterrupted(session);
      if (session.activeResponses.size) sendUpstream(session, { type: "response.cancel" });
    }
    requestReplyWhenReady(session);
  } else if (message.type === "stop") {
    endSession(session, "stopped");
  }
}

async function attachBrowser(session: RelaySession, browser: WebSocket): Promise<void> {
  if (session.attachTimer) clearTimeout(session.attachTimer);
  session.attachTimer = null;
  sessionsByTicket.delete(session.ticket);
  session.browser = browser;
  session.attachedAt = Date.now();
  browser.on("message", (data, isBinary) => handleBrowserMessage(session, data, isBinary));
  browser.on("close", () => endSession(session, "browser_closed"));
  browser.on("error", () => endSession(session, "browser_closed"));
  // As on the WebRTC path, the session is committed before anything is heard.
  const spend = session.spend;
  if (spend && session.spendState === "reserved") {
    session.spendState = "committing";
    try {
      await spend.commit();
      session.spendState = "committed";
    } catch (error) {
      session.spendState = "reserved";
      log.error("xAI rehearsal spend could not be committed", {
        rehearsalId: session.publicId,
        error: getErrorMessage(error),
      });
      endSession(session, "spend_unavailable");
      return;
    }
  }
  if (session.ended) return;
  sendBrowser(session, {
    type: "ready",
    sampleRate: XAI_REHEARSAL_SAMPLE_RATE,
    maxDurationSeconds: Math.max(1, Math.floor((session.deadlineAt - Date.now()) / 1_000)),
  });
  // Spoken verbatim and not interruptible, exactly as the phone opening.
  sendBrowser(session, { type: "bot_text", id: "opening", text: session.opening, final: true });
  sendUpstream(session, xaiForceMessage(session.opening));
  // If the provider never reports the opening's end, allow barge-in after a
  // deliberately slow playback estimate rather than never.
  session.openingTimer = setTimeout(
    () => finishOpening(session),
    xaiForcedMessagePlaybackMs(session.opening, session.speakingRate),
  );
  session.openingTimer.unref?.();
}

function sameOriginUpgrade(request: IncomingMessage): boolean {
  const origin = typeof request.headers.origin === "string" ? request.headers.origin.trim() : "";
  if (!origin) return false;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = String(
    (typeof forwardedHost === "string" && forwardedHost) || request.headers.host || "",
  )
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (host && originUrl.host.toLowerCase() === host) return true;
  const allowed = [process.env.APP_URL, ...(process.env.CORS_ORIGINS || "").split(",")]
    .map((value) =>
      String(value || "")
        .trim()
        .replace(/\/+$/, ""),
    )
    .filter(Boolean);
  return allowed.includes(originUrl.origin);
}

function offeredProtocols(request: IncomingMessage): string[] {
  const raw = request.headers["sec-websocket-protocol"];
  return (Array.isArray(raw) ? raw.join(",") : String(raw || ""))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function refuse(socket: Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

let relayServer: WebSocketServer | null = null;

/**
 * The browser attaches with `["botbound-rehearsal.v1", "ticket.<ticket>"]`.
 * The ticket is single-use, expires within seconds, and was issued only by
 * the authenticated, spend-guarded session route.
 */
export function handleRehearsalRelayUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  if (!acceptingRelays) return refuse(socket, "503 Service Unavailable");
  if (!sameOriginUpgrade(request)) return refuse(socket, "403 Forbidden");
  const protocols = offeredProtocols(request);
  const ticket = protocols
    .find((value) => value.startsWith(TICKET_PROTOCOL_PREFIX))
    ?.slice(TICKET_PROTOCOL_PREFIX.length);
  const session = ticket ? sessionsByTicket.get(ticket) : undefined;
  if (!protocols.includes(XAI_REHEARSAL_RELAY_PROTOCOL) || !session || session.ended) {
    return refuse(socket, "401 Unauthorized");
  }
  // Claim the ticket before the handshake completes so it cannot attach twice.
  sessionsByTicket.delete(session.ticket);
  relayServer ??= new WebSocketServer({
    noServer: true,
    maxPayload: MAX_BROWSER_FRAME_BYTES * 2,
    perMessageDeflate: false,
    handleProtocols: (offered) =>
      offered.has(XAI_REHEARSAL_RELAY_PROTOCOL) ? XAI_REHEARSAL_RELAY_PROTOCOL : false,
  });
  relayServer.handleUpgrade(request, socket, head, (browser) => {
    if (session.ended) {
      browser.close(1000, "Rehearsal ended");
      return;
    }
    void attachBrowser(session, browser);
  });
}
