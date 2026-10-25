import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import WebSocket, { WebSocketServer } from "ws";
import twilio from "twilio";
import { z } from "zod";
import { getTwilioClient } from "../twilio-service";
import { log } from "../server-context";
import {
  reservePlatformCostRecord,
  commitPlatformCostReservation,
} from "../../middleware/audit-middleware";
import {
  CLONED_MEDIA_PATH,
  CLONED_MEDIA_ADMIT_PATH,
  mediaCallSid,
  clonedMediaOrigin,
} from "./cloned-media-config";
import { ElevenLabsMediaSession } from "./elevenlabs-media-session";
import { clonedSpeechStreams, clonedStockVoice } from "./cloned-speech-stream";
import { voiceWorkerServiceSecret } from "./openai-sip-worker-config";
import { VOICE_WORKER_AUTH_HEADER } from "./openai-sip-worker-dispatch";
import { OPENAI_REALTIME_DEFAULT_MODEL } from "./openai-realtime-config";
import { liveRecordingCallbackUrl } from "./live-call-recording";
import {
  markRuntimeCustomVoicePlayed,
  resolveRuntimeCustomVoice,
  LIVE_CUSTOM_VOICE_KEY,
  type RuntimeCustomVoice,
} from "./live-voice-service";
import { referTransferTwiml } from "./inbound-bridge";
import { PHONE_CATALOG_VOICE_KEY, type CatalogPhoneVoice } from "../phone-voice-catalog";
import { phoneCatalogService, CARTESIA_SPEECH_MODEL } from "./phone-catalog-service";

type RegisteredStream = {
  carrier: WebSocket;
  streamSid: string;
  token: string;
  direction: "inbound" | "outbound";
  earlyFrames: Buffer[];
  buffer: (data: WebSocket.RawData) => void;
  claimed: boolean;
  authorized: boolean;
};
const streams = new Map<string, RegisteredStream>();
const startFrame = z.object({
  event: z.literal("start"),
  start: z.object({
    callSid: z.string().regex(/^CA[a-f0-9]{32}$/i),
    streamSid: z.string().regex(/^MZ[a-f0-9]{32}$/i),
    accountSid: z.string(),
    mediaFormat: z.object({
      encoding: z.literal("audio/x-mulaw"),
      sampleRate: z.literal(8000),
      channels: z.literal(1),
    }),
    customParameters: z.object({
      token: z.string().min(1).max(4096),
      direction: z.enum(["inbound", "outbound"]),
    }),
  }),
});

export function registeredMediaCall(callId: string, token: string): boolean {
  const entry = streams.get(callId);
  return Boolean(
    entry && entry.token === token && !entry.claimed && entry.carrier.readyState === WebSocket.OPEN,
  );
}

/** Called only after the signed routing token and persisted parent SID agree. */
export function authorizeMediaCall(callId: string): void {
  const entry = streams.get(callId);
  if (!entry) throw new Error("Media stream is no longer available");
  entry.authorized = true;
}

/** Carrier control remains addressable after a process restart. */
export async function controlMediaCall(
  callId: string,
  action: "hangup" | "refer",
  destination?: string,
): Promise<"completed" | "already_ended"> {
  const sid = mediaCallSid(callId);
  if (!sid) throw new Error("Invalid media call id");
  const pending = streams.get(callId);
  if (pending && !pending.authorized) {
    // A WebSocket signature authenticates the upgrade URL, not start-message
    // fields. Never let an unverified start frame hang up another call.
    pending.carrier.close(1008, "Call routing not verified");
    return "already_ended";
  }
  const client = getTwilioClient();
  if (!client) throw new Error("Twilio is not configured");
  try {
    if (action === "refer") {
      const twiml = referTransferTwiml(destination ?? "", null, {
        absoluteAction: true,
      });
      if (!twiml) throw new Error("Media calls require a PSTN transfer destination");
      await client.calls(sid).update({ twiml });
    } else await client.calls(sid).update({ status: "completed" });
    return "completed";
  } catch (error) {
    if (
      action === "hangup" &&
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 404
    )
      return "already_ended";
    throw error;
  }
}

export async function prepareMediaRecording(callId: string, enabled: boolean): Promise<void> {
  if (!enabled) return;
  const sid = mediaCallSid(callId);
  const client = getTwilioClient();
  if (!sid || !client) throw new Error("Media recording is not configured");
  // One parent recording spans clone and stock TTS. A retry never starts a
  // second recorder while the first is active.
  const existing = await client.calls(sid).recordings.list({ limit: 20 });
  if (
    existing.some(
      (recording) => recording.status === "in-progress" || recording.status === "paused",
    )
  )
    return;
  await client.calls(sid).recordings.create({
    recordingChannels: "dual",
    recordingTrack: "both",
    recordingStatusCallback: liveRecordingCallbackUrl(),
    recordingStatusCallbackMethod: "POST",
    recordingStatusCallbackEvent: ["completed"],
  });
}

export function createClonedMediaSession(input: {
  callId: string;
  userId: string;
  voice: RuntimeCustomVoice | null;
  catalogVoice?: CatalogPhoneVoice | null;
}): ElevenLabsMediaSession {
  const entry = streams.get(input.callId);
  if (!entry || entry.claimed || entry.carrier.readyState !== WebSocket.OPEN)
    throw new Error("Media stream is no longer available");
  entry.claimed = true;
  entry.carrier.off("message", entry.buffer);
  const openAIKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY?.trim() ?? "";
  const cartesiaKey = process.env.CARTESIA_API_KEY?.trim() ?? "";
  if (!openAIKey) throw new Error("Cloned speech is not configured");
  const model = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(OPENAI_REALTIME_DEFAULT_MODEL)}`,
    {
      headers: { Authorization: `Bearer ${openAIKey}` },
      handshakeTimeout: 10_000,
      maxPayload: 1_048_576,
    },
  );
  let played = false;
  let synthesisSequence = 0;
  const catalogVoice = input.voice ? null : input.catalogVoice;
  const speechProvider = catalogVoice?.provider ?? "elevenlabs";
  const speech = clonedSpeechStreams({
    voiceId: input.voice?.voiceId ?? catalogVoice?.id ?? "",
    elevenLabsKey,
    cartesiaKey,
    speechProvider,
    openAIKey,
    stockVoice: clonedStockVoice(input.voice?.gender ?? catalogVoice?.gender ?? null),
    reserve: async (provider, text) => {
      if (
        provider === "elevenlabs" &&
        input.voice &&
        !(await resolveRuntimeCustomVoice(input.userId, {
          [LIVE_CUSTOM_VOICE_KEY]: { cloneId: input.voice!.cloneId },
        }))
      )
        throw new Error("Cloned voice was revoked or expired");
      if (
        provider !== "openai" &&
        catalogVoice &&
        !(await phoneCatalogService.resolve({ [PHONE_CATALOG_VOICE_KEY]: catalogVoice }))
      )
        throw new Error("Catalog phone voice is no longer available");
      // Conservative character-based reservation, separate from the Realtime
      // reasoning/input-audio reservation. Attempts retain their debit when
      // the provider outcome is ambiguous; cancellation never refunds work.
      const usdPerThousand =
        provider === "elevenlabs" ? 0.3 : provider === "cartesia" ? 0.08 : 0.015;
      const reservation = await reservePlatformCostRecord({
        userId: input.userId,
        action: catalogVoice ? "voice.catalog.synthesis" : "voice.clone.synthesis",
        provider,
        model:
          provider === "elevenlabs"
            ? "eleven_flash_v2_5"
            : provider === "cartesia"
              ? CARTESIA_SPEECH_MODEL
              : "tts-1",
        costUsd: Math.max(0.000001, (Array.from(text).length * usdPerThousand) / 1_000),
        idempotencyKey: `clone-speech:${input.callId}:${synthesisSequence++}:${randomUUID()}`,
        requestMeta: {
          surface: "cloned_phone",
          characters: Array.from(text).length,
          estimate: true,
        },
      });
      if (!reservation.reserved) throw new Error("Speech spend admission refused");
      await commitPlatformCostReservation(reservation.reservation);
    },
  });
  const cloneId = input.voice?.cloneId;
  const session = new ElevenLabsMediaSession({
    carrier: entry.carrier,
    model,
    streamSid: entry.streamSid,
    initialStock: catalogVoice
      ? !(speechProvider === "cartesia" ? cartesiaKey : elevenLabsKey)
      : input.voice?.engine !== "elevenlabs" || !elevenLabsKey,
    ...speech,
    onClonePlayed: async () => {
      if (played || !cloneId) return;
      played = true;
      await markRuntimeCustomVoicePlayed(input.userId, cloneId);
    },
    onFallback: () =>
      log.warn(
        catalogVoice
          ? "Catalog phone voice switched to stock speech"
          : "Cloned phone voice switched to stock speech",
        {
          callId: input.callId,
          cloneId,
          catalogProvider: catalogVoice?.provider,
        },
      ),
  });
  for (const frame of entry.earlyFrames) entry.carrier.emit("message", frame);
  entry.earlyFrames = [];
  return session;
}

/** Install only on the persistent voice worker, never on the API/Vercel host. */
export function installClonedMediaServer(
  server: Server,
  options: { port: number; maxCalls: number; canAdmit: () => boolean },
) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 32_768,
    perMessageDeflate: false,
  });
  let handshakes = 0;
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== CLONED_MEDIA_PATH) {
      socket.destroy();
      return;
    }
    let authenticated = false;
    try {
      const url = new URL(CLONED_MEDIA_PATH, clonedMediaOrigin()).toString();
      const signature = String(request.headers["x-twilio-signature"] ?? "");
      const key = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
      authenticated = Boolean(
        key &&
        signature &&
        (twilio.validateRequest(key, signature, url, {}) ||
          twilio.validateRequest(key, signature, url.replace(/^https:/, "wss:"), {})),
      );
    } catch {
      /* Configuration failure is a refused upgrade. */
    }
    if (!authenticated || !options.canAdmit() || handshakes + streams.size >= options.maxCalls) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    handshakes += 1;
    wss.handleUpgrade(request, socket, head, (carrier) => {
      let started = false;
      let id: string | null = null;
      const timeout = setTimeout(() => carrier.close(1008, "Stream start required"), 5_000);
      carrier.on("error", () => carrier.close());
      carrier.once("close", () => {
        clearTimeout(timeout);
        if (!started) handshakes -= 1;
        if (id && streams.get(id)?.carrier === carrier) streams.delete(id);
      });
      const start = (raw: WebSocket.RawData) => {
        let message: unknown;
        try {
          message = JSON.parse(String(raw));
        } catch {
          carrier.close(1008, "Invalid start");
          return;
        }
        if (
          message &&
          typeof message === "object" &&
          "event" in message &&
          message.event === "connected"
        )
          return;
        const parsed = startFrame.safeParse(message);
        if (started || !parsed.success) {
          carrier.close(1008, "Invalid start");
          return;
        }
        const data = parsed.data.start;
        const params = data.customParameters;
        if (data.accountSid !== process.env.TWILIO_ACCOUNT_SID) {
          carrier.close(1008, "Invalid stream identity");
          return;
        }
        id = `media:${data.callSid}`;
        if (streams.has(id)) {
          carrier.close(1008, "Call already attached");
          return;
        }
        started = true;
        handshakes -= 1;
        clearTimeout(timeout);
        carrier.off("message", start);
        const earlyFrames: Buffer[] = [];
        let size = 0;
        const buffer = (frame: WebSocket.RawData) => {
          const bytes = Buffer.from(String(frame));
          size += bytes.length;
          if (size > 128_000) carrier.close(1008, "Admission took too long");
          else earlyFrames.push(bytes);
        };
        carrier.on("message", buffer);
        streams.set(id, {
          carrier,
          streamSid: data.streamSid,
          token: params.token,
          direction: params.direction,
          earlyFrames,
          buffer,
          claimed: false,
          authorized: false,
        });
        const callId = id;
        // Reuse the existing HTTP admission pipeline and all its tenant,
        // deletion, funding, spend and durable-claim guards on this worker.
        void fetch(`http://127.0.0.1:${options.port}${CLONED_MEDIA_ADMIT_PATH}`, {
          method: "POST",
          signal: AbortSignal.timeout(25_000),
          headers: {
            "Content-Type": "application/json",
            [VOICE_WORKER_AUTH_HEADER]: voiceWorkerServiceSecret(),
          },
          body: JSON.stringify({
            callId,
            token: params.token,
            direction: params.direction,
          }),
        })
          .then(async (response) => {
            const result = (await response.json()) as {
              handled?: boolean;
              duplicate?: boolean;
            };
            if (!response.ok || !result.handled || result.duplicate)
              carrier.close(1008, "Call admission refused");
          })
          .catch(() => {
            carrier.close(1011, "Call admission failed");
          });
      };
      carrier.on("message", start);
    });
  });
  return wss;
}
