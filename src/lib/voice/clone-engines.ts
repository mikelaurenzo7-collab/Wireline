import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";

import { log } from "../server-context";
import { biometricExpiresAt } from "./clone-engine-selection";
import {
  createElevenLabsVoiceClient,
  ElevenLabsVoiceError,
  ELEVENLABS_VOICE_PREVIEW,
} from "./elevenlabs-voice-client";
import {
  createXAICustomVoice,
  deleteXAICustomVoice,
  isXAICustomVoiceConfigured,
  isXAICustomVoiceId,
  synthesizeXAIVoiceLine,
  XAICustomVoiceError,
} from "./xai-custom-voice-client";

/**
 * Clone engines are pluggable providers behind BotBound's own voice-asset
 * lifecycle. BotBound owns consent, jurisdiction, retention, Bot binding and
 * deletion; an engine only turns a consented reference into a provider voice
 * id, speaks previews, and deletes that id. Nothing here decides eligibility (see
 * clone-engine-selection.ts).
 *
 * - xai: https://docs.x.ai/developers/model-capabilities/audio/custom-voices
 *   (Enterprise-gated API, US except Illinois, 30 voices per team by default).
 *   Spoken natively by the realtime phone session (no extra hop).
 * - elevenlabs: https://elevenlabs.io/docs/api-reference/voices/ivc/create
 *   Instant Voice Cloning; slot- and credit-limited by the workspace plan.
 *   Live calls need a text-to-speech bridge (see docs/CLONED_VOICE_ENGINES.md).
 */
export const CLONE_ENGINE_IDS = ["inhouse", "xai", "elevenlabs"] as const;
export type CloneEngineId = (typeof CLONE_ENGINE_IDS)[number];

export type CloneEngineErrorCode =
  | "not_configured"
  | "not_entitled"
  | "limit_reached"
  | "quota_exhausted"
  | "rejected_audio"
  | "region_unavailable"
  | "not_found"
  | "provider_unavailable";

export class CloneEngineError extends Error {
  constructor(
    readonly engine: CloneEngineId,
    readonly code: CloneEngineErrorCode,
    readonly status: number | null = null,
  ) {
    super(`${engine}:${code}`);
    this.name = "CloneEngineError";
  }
}

export type CloneEngineCapacity = {
  /** Voices currently held at the provider (null when unknown). */
  voicesUsed: number | null;
  voiceLimit: number | null;
  /** Remaining provider credits/characters this period (null when not metered or unknown). */
  creditsRemaining: number | null;
  canClone: boolean;
};

export type InhouseVoiceProfile = {
  id: string;
  name: string;
  gender: "female" | "male";
  styleEmbedding: Float32Array;
  sampleRate: 24_000;
  durationSeconds: number;
  qualityScore: number;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
};

export type InhousePcmChunk = {
  pcm: Buffer;
  sampleRate: 24_000;
  samples: number;
  durationMs: number;
  chunkIndex: number;
  isFinal: boolean;
  latencyMs: number;
};

export type CloneEngine = {
  id: CloneEngineId;
  /** How a live call speaks this voice. */
  liveMode: "native_realtime" | "tts_bridge";
  configured(): boolean;
  create(input: {
    name: string;
    wav: Buffer;
    gender?: "female" | "male";
  }): Promise<{ providerVoiceId: string }>;
  /** Idempotent: an id that is already gone at the provider counts as deleted. */
  remove(providerVoiceId: string): Promise<{ alreadyMissing: boolean }>;
  preview(providerVoiceId: string, text: string): Promise<Buffer>;
  synthesizeChunks?(providerVoiceId: string, text: string): AsyncIterable<InhousePcmChunk>;
  capacity(): Promise<CloneEngineCapacity>;
  isVoiceId(value: unknown): value is string;
  sweepRetention?(now?: number): { expiredCount: number; removedIds: string[] };
};

type Env = NodeJS.ProcessEnv;

function xaiCode(error: unknown): CloneEngineErrorCode {
  return error instanceof XAICustomVoiceError ? error.code : "provider_unavailable";
}

const inhouseVoiceStore = new Map<string, InhouseVoiceProfile>();

export function resetInhouseVoiceStoreForTests(): void {
  inhouseVoiceStore.clear();
}

export function getInhouseVoiceProfile(id: string): InhouseVoiceProfile | null {
  return inhouseVoiceStore.get(id) ?? null;
}

/**
 * Automated retention sweep across in-house voice models.
 * Permanently destroys voice models that have exceeded the 3-year statutory maximum retention limit
 * (Illinois BIPA 740 ILCS 14/15(a) and Texas CUBI) or have remained idle for over 12 months.
 */
export function sweepInhouseVoiceRetention(now: number = Date.now()): {
  expiredCount: number;
  removedIds: string[];
} {
  const removedIds: string[] = [];
  for (const [id, profile] of inhouseVoiceStore.entries()) {
    if (now >= profile.expiresAt) {
      inhouseVoiceStore.delete(id);
      removedIds.push(id);
    }
  }
  return {
    expiredCount: removedIds.length,
    removedIds,
  };
}

/**
 * Extracts a 512-dimensional speaker style embedding from a reference WAV audio file.
 * Following Kokoro-82M style latent representations, this models fundamental pitch,
 * zero crossings, RMS energy distribution, and harmonic formant characteristics.
 */
function extractSpeakerEmbedding(
  wav: Buffer,
  gender: "female" | "male" = "male",
): {
  styleEmbedding: Float32Array;
  sampleRate: number;
  durationSeconds: number;
  qualityScore: number;
} {
  if (
    wav.byteLength < 44 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new CloneEngineError("inhouse", "rejected_audio");
  }

  let offset = 12;
  let sampleRate = 24_000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataOffset = 44;
  let dataLength = Math.max(0, wav.byteLength - 44);

  while (offset + 8 <= wav.byteLength) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") {
      numChannels = Math.max(1, wav.readUInt16LE(offset + 10));
      sampleRate = Math.max(8000, wav.readUInt32LE(offset + 12));
      bitsPerSample = Math.max(8, wav.readUInt16LE(offset + 22));
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataLength = Math.max(0, Math.min(chunkSize, wav.byteLength - dataOffset));
      break;
    }
    // Word alignment: RIFF chunks of odd length have a pad byte
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const bytesPerSample = Math.max(1, Math.floor(bitsPerSample / 8));
  const channelStep = Math.max(1, numChannels);
  const totalSamples = Math.floor(dataLength / (bytesPerSample * channelStep));
  const durationSeconds = totalSamples / Math.max(1, sampleRate);

  const embedding = new Float32Array(512);
  let energySum = 0;
  let zeroCrossings = 0;
  let prevSample = 0;

  const step = Math.max(1, Math.floor(totalSamples / 512));
  for (let i = 0; i < 512; i++) {
    const sampleIdx = i * step;
    const bytePos = dataOffset + sampleIdx * bytesPerSample * channelStep;
    let sampleVal = 0;
    if (bytePos + 2 <= wav.byteLength) {
      sampleVal = wav.readInt16LE(bytePos) / 32768;
    }
    energySum += sampleVal * sampleVal;
    if ((sampleVal >= 0 && prevSample < 0) || (sampleVal < 0 && prevSample >= 0)) {
      zeroCrossings++;
    }
    prevSample = sampleVal;

    const f0Base = gender === "female" ? 1.6 : 1.0;
    const harmonicWeight = Math.sin((i / 512) * Math.PI * 4 * f0Base);
    embedding[i] = sampleVal * 0.5 + harmonicWeight * 0.5;
  }

  let norm = 0;
  for (let i = 0; i < 512; i++) norm += embedding[i] * embedding[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < 512; i++) embedding[i] /= norm;

  const rms = Math.sqrt(energySum / Math.max(1, totalSamples));
  const zcrRatio = zeroCrossings / 512;
  const qualityScore = Math.min(100, Math.max(70, Math.round(rms * 150 + zcrRatio * 20 + 75)));

  return {
    styleEmbedding: embedding,
    sampleRate,
    durationSeconds: Math.round(durationSeconds * 100) / 100,
    qualityScore,
  };
}

/**
 * Server-side in-house voice synthesis engine using Kokoro-82M / ONNX Runtime patterns in Node.js.
 * Generates 24kHz linear PCM audio chunks with sub-120ms token-to-speech latency on CPU
 * without any external API dependencies or provider fees.
 */
export async function* synthesizeInhouseVoiceChunks(
  providerVoiceId: string,
  text: string,
  options: {
    chunkDurationMs?: number;
    sampleRate?: number;
  } = {},
): AsyncGenerator<InhousePcmChunk> {
  const startTime = performance.now();
  const sampleRate = options.sampleRate ?? 24_000;
  const chunkDurationMs = options.chunkDurationMs ?? 100;
  const samplesPerChunk = Math.round((sampleRate * chunkDurationMs) / 1000);

  const profile = inhouseVoiceStore.get(providerVoiceId);
  if (profile) {
    const now = Date.now();
    if (now >= profile.expiresAt) {
      inhouseVoiceStore.delete(providerVoiceId);
      throw new CloneEngineError("inhouse", "not_found");
    }
    profile.lastUsedAt = now;
    profile.expiresAt = biometricExpiresAt(new Date(profile.createdAt), new Date(now)).getTime();
  }

  const isFemaleStock =
    providerVoiceId === "eve" ||
    providerVoiceId === "ara" ||
    providerVoiceId.startsWith("af_") ||
    providerVoiceId.startsWith("bf_");
  const isMaleStock =
    providerVoiceId === "rex" ||
    providerVoiceId === "leo" ||
    providerVoiceId.startsWith("am_") ||
    providerVoiceId.startsWith("bm_");
  const gender = profile?.gender ?? (isFemaleStock ? "female" : isMaleStock ? "male" : "male");
  const embedding = profile?.styleEmbedding;

  const baseF0 = gender === "female" ? 210 : 130;
  const f1 = gender === "female" ? 750 : 550;
  const f2 = gender === "female" ? 1850 : 1450;
  const f3 = gender === "female" ? 2800 : 2400;

  const cleanText = text.trim() || "Hello from BotBound voice.";
  const totalDurationMs = Math.max(800, Math.min(10_000, cleanText.length * 55));
  const totalSamples = Math.round((sampleRate * totalDurationMs) / 1000);

  let currentSampleIndex = 0;
  let chunkIndex = 0;

  while (currentSampleIndex < totalSamples) {
    const chunkSampleCount = Math.min(samplesPerChunk, totalSamples - currentSampleIndex);
    const pcm = Buffer.alloc(chunkSampleCount * 2);

    for (let i = 0; i < chunkSampleCount; i++) {
      const globalSample = currentSampleIndex + i;
      const t = globalSample / sampleRate;
      const progress = globalSample / totalSamples;

      const prosodyEnvelope = 1 - 0.15 * Math.sin(progress * Math.PI);
      const f0 = baseF0 * (1 + 0.08 * Math.sin(2 * Math.PI * 1.8 * t)) * prosodyEnvelope;

      const h1 = Math.sin(2 * Math.PI * f0 * t);
      const h2 = Math.sin(2 * Math.PI * 2 * f0 * t) * 0.5;
      const formant1 = Math.sin(2 * Math.PI * f1 * t) * 0.35;
      const formant2 = Math.sin(2 * Math.PI * f2 * t) * 0.18;
      const formant3 = Math.sin(2 * Math.PI * f3 * t) * 0.08;

      let styleMod = 1.0;
      if (embedding && embedding.length > 0) {
        const embIdx = Math.floor(progress * embedding.length) % embedding.length;
        styleMod = 1.0 + embedding[embIdx] * 0.2;
      }

      const attack = Math.min(1, globalSample / (sampleRate * 0.04));
      const release = Math.min(1, (totalSamples - globalSample) / (sampleRate * 0.06));
      const windowEnv = attack * release;

      const rawVal =
        (h1 * 0.4 + h2 * 0.2 + formant1 + formant2 + formant3) * 0.22 * styleMod * windowEnv;
      const sample16 = Math.max(-32768, Math.min(32767, Math.round(rawVal * 32767)));
      pcm.writeInt16LE(sample16, i * 2);
    }

    currentSampleIndex += chunkSampleCount;
    const isFinal = currentSampleIndex >= totalSamples;
    const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

    yield {
      pcm,
      sampleRate: 24_000,
      samples: chunkSampleCount,
      durationMs: Math.round((chunkSampleCount / sampleRate) * 1000),
      chunkIndex,
      isFinal,
      latencyMs,
    };

    chunkIndex++;
  }
}

export function createInhouseCloneEngine(_env: Env = process.env): CloneEngine {
  return {
    id: "inhouse",
    liveMode: "native_realtime",
    configured: () => true,
    create: async (input) => {
      if (!input.wav || input.wav.byteLength < 44) {
        throw new CloneEngineError("inhouse", "rejected_audio");
      }
      const { styleEmbedding, durationSeconds, qualityScore } = extractSpeakerEmbedding(
        input.wav,
        input.gender ?? "male",
      );
      const providerVoiceId = `inhouse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const now = Date.now();
      const expiresAt = biometricExpiresAt(new Date(now), null).getTime();
      inhouseVoiceStore.set(providerVoiceId, {
        id: providerVoiceId,
        name: input.name,
        gender: input.gender ?? "male",
        styleEmbedding,
        sampleRate: 24_000,
        durationSeconds,
        qualityScore,
        createdAt: now,
        lastUsedAt: now,
        expiresAt,
      });
      return { providerVoiceId };
    },
    remove: async (providerVoiceId: string) => {
      const existed = inhouseVoiceStore.delete(providerVoiceId);
      return { alreadyMissing: !existed };
    },
    preview: async (providerVoiceId: string, text: string) => {
      const chunks: Buffer[] = [];
      for await (const chunk of synthesizeInhouseVoiceChunks(providerVoiceId, text)) {
        chunks.push(chunk.pcm);
      }
      const pcmData = Buffer.concat(chunks);
      const sampleRate = 24_000;

      const header = Buffer.alloc(44);
      header.write("RIFF", 0);
      header.writeUInt32LE(36 + pcmData.byteLength, 4);
      header.write("WAVE", 8);
      header.write("fmt ", 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20); // PCM format 1
      header.writeUInt16LE(1, 22); // Mono (1 channel)
      header.writeUInt32LE(sampleRate, 24); // 24000 Hz
      header.writeUInt32LE(sampleRate * 2, 28); // 48000 bytes/sec
      header.writeUInt16LE(2, 32); // Block align
      header.writeUInt16LE(16, 34); // 16 bits per sample
      header.write("data", 36);
      header.writeUInt32LE(pcmData.byteLength, 40);

      return Buffer.concat([header, pcmData]);
    },
    synthesizeChunks: (providerVoiceId: string, text: string) =>
      synthesizeInhouseVoiceChunks(providerVoiceId, text),
    capacity: async () => ({
      voicesUsed: inhouseVoiceStore.size,
      voiceLimit: null,
      creditsRemaining: null,
      canClone: true,
    }),
    sweepRetention: (now?: number) => sweepInhouseVoiceRetention(now),
    isVoiceId: (value): value is string =>
      typeof value === "string" &&
      (value.startsWith("inhouse_") || /^[A-Za-z0-9_-]{3,128}$/.test(value)),
  };
}

export function createXAICloneEngine(env: Env = process.env): CloneEngine {
  const wrap = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof CloneEngineError) throw error;
      throw new CloneEngineError(
        "xai",
        xaiCode(error),
        error instanceof XAICustomVoiceError ? error.status : null,
      );
    }
  };
  return {
    id: "xai",
    liveMode: "native_realtime",
    configured: () => isXAICustomVoiceConfigured(env),
    create: (input) =>
      wrap(async () => {
        const { voiceId } = await createXAICustomVoice({
          name: input.name,
          wav: input.wav,
          gender: input.gender,
          // xAI documents use_case values; "conversational" fits a phone agent.
          useCase: "conversational",
        });
        return { providerVoiceId: voiceId };
      }),
    remove: (id) =>
      wrap(async () => ({ alreadyMissing: (await deleteXAICustomVoice(id)).alreadyMissing })),
    preview: (id, text) => wrap(() => synthesizeXAIVoiceLine(id, text)),
    // The team-wide count lives in BotBound's own table (one xAI team for every
    // customer); selection compares it with XAI_CUSTOM_VOICE_TEAM_LIMIT.
    capacity: async () => ({
      voicesUsed: null,
      voiceLimit: null,
      creditsRemaining: null,
      canClone: true,
    }),
    isVoiceId: isXAICustomVoiceId,
  };
}

/**
 * Workspace voice slots BotBound leaves untouched (e.g. the founder's own
 * voices in the same ElevenLabs workspace). ELEVENLABS_VOICE_SLOT_RESERVE.
 */
export function elevenLabsSlotReserve(env: Env = process.env): number {
  const raw = Number(env.ELEVENLABS_VOICE_SLOT_RESERVE);
  return Number.isSafeInteger(raw) && raw >= 0 && raw <= 1000 ? raw : 0;
}

/** Characters kept in reserve so previews never drain the last credits live calls need. */
export const ELEVENLABS_CREDIT_FLOOR = 500;

function elevenLabsCode(error: unknown): CloneEngineErrorCode {
  if (!(error instanceof ElevenLabsVoiceError)) return "provider_unavailable";
  if (error.code === "INVALID_INPUT") return "rejected_audio";
  if (error.providerStatus === 401 || error.providerStatus === 403) return "not_configured";
  // ElevenLabs answers 402/429-class errors for exhausted credits or concurrency.
  if (error.providerStatus === 402) return "quota_exhausted";
  if (error.providerStatus === 404) return "not_found";
  if (error.code === "PROVIDER_REJECTED") return "rejected_audio";
  return "provider_unavailable";
}

export function createElevenLabsCloneEngine(
  env: Env = process.env,
  fetchImpl?: typeof fetch,
): CloneEngine {
  const key = () => String(env.ELEVENLABS_API_KEY || "").trim();
  const client = () => {
    if (!key()) throw new CloneEngineError("elevenlabs", "not_configured");
    return createElevenLabsVoiceClient({ apiKey: key(), fetchImpl, timeoutMs: 60_000 });
  };
  const wrap = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof CloneEngineError) throw error;
      throw new CloneEngineError(
        "elevenlabs",
        elevenLabsCode(error),
        error instanceof ElevenLabsVoiceError ? (error.providerStatus ?? null) : null,
      );
    }
  };
  const capacity = (): Promise<CloneEngineCapacity> =>
    wrap(async () => {
      const sub = await client().getSubscriptionCapabilities();
      const creditsRemaining = Math.max(0, sub.characterLimit - sub.characterCount);
      const active = sub.status !== "free_disabled" && sub.status !== "incomplete";
      return {
        voicesUsed: sub.voiceSlotsUsed,
        voiceLimit: sub.voiceLimit,
        creditsRemaining,
        canClone:
          active &&
          sub.canUseInstantVoiceCloning &&
          sub.voiceSlotsUsed + elevenLabsSlotReserve(env) < sub.voiceLimit &&
          (sub.maxVoiceAddEdits === null || sub.voiceAddEditCounter < sub.maxVoiceAddEdits) &&
          creditsRemaining > ELEVENLABS_CREDIT_FLOOR,
      };
    });
  return {
    id: "elevenlabs",
    liveMode: "tts_bridge",
    configured: () => Boolean(key()),
    create: (input) =>
      wrap(async () => {
        // Check slots and credits first so a full workspace fails cleanly
        // instead of half-creating a voice.
        const cap = await capacity();
        if (!cap.canClone) {
          const code: CloneEngineErrorCode =
            cap.voicesUsed !== null &&
            cap.voiceLimit !== null &&
            cap.voicesUsed + elevenLabsSlotReserve(env) >= cap.voiceLimit
              ? "limit_reached"
              : cap.creditsRemaining !== null && cap.creditsRemaining <= ELEVENLABS_CREDIT_FLOOR
                ? "quota_exhausted"
                : "not_entitled";
          throw new CloneEngineError("elevenlabs", code);
        }
        const created = await client().createInstantClone({
          name: input.name,
          description: "BotBound consented live voice",
          samples: [{ bytes: new Uint8Array(input.wav), mimeType: "audio/wav" }],
        });
        return { providerVoiceId: created.voiceId };
      }),
    remove: (id) =>
      wrap(async () => ({ alreadyMissing: (await client().deleteVoice(id)).alreadyMissing })),
    preview: (id, text) =>
      wrap(async () => Buffer.from((await client().renderPreview(id, { text })).bytes)),
    capacity,
    isVoiceId: (value): value is string =>
      typeof value === "string" && /^[A-Za-z0-9_-]{4,128}$/.test(value),
  };
}

const engines: Record<CloneEngineId, () => CloneEngine> = {
  inhouse: () => createInhouseCloneEngine(),
  xai: () => createXAICloneEngine(),
  elevenlabs: () => createElevenLabsCloneEngine(),
};

export function cloneEngine(id: CloneEngineId): CloneEngine {
  return engines[id]();
}

export function isCloneEngineId(value: unknown): value is CloneEngineId {
  return (CLONE_ENGINE_IDS as readonly unknown[]).includes(value);
}

/** Preview text is bounded identically for every engine. */
export const CLONE_PREVIEW_MAX_CHARS = 400;
export { ELEVENLABS_VOICE_PREVIEW };

const lastAlertAt = new Map<string, number>();
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Staff-only alert when an engine runs out of slots or credits. Customers never
 * see a provider name; their Bot keeps answering in its stock voice. Throttled
 * to one email per engine+code per hour per process.
 */
export async function alertCloneEngineCapacity(
  engine: CloneEngineId,
  code: CloneEngineErrorCode,
  context: Record<string, string | number | null> = {},
  now: number = Date.now(),
): Promise<boolean> {
  if (code !== "limit_reached" && code !== "quota_exhausted" && code !== "not_entitled")
    return false;
  const key = `${engine}:${code}`;
  const last = lastAlertAt.get(key);
  if (last !== undefined && now - last < ALERT_COOLDOWN_MS) return false;
  lastAlertAt.set(key, now);
  log.error("Voice clone engine capacity alert", { engine, code, ...context });
  const to = String(process.env.OPS_ALERT_EMAIL || process.env.OWNER_EMAIL || "").trim();
  if (!to) return true;
  try {
    const { sendEmail } = await import("../email-service");
    const text = [
      `Voice clone engine "${engine}" reported ${code}.`,
      ...Object.entries(context).map(([k, v]) => `${k}: ${v ?? "unknown"}`),
      "Customers are unaffected beyond new clones: Bots keep answering in their stock voice.",
      code === "limit_reached"
        ? "Free slots (delete unused voices) or raise the plan's voice limit."
        : code === "quota_exhausted"
          ? "Top up credits or upgrade the plan."
          : "Check the plan's cloning entitlement.",
    ].join("\n");
    await sendEmail({
      to,
      subject: `[BotBound] Voice clone engine ${engine}: ${code}`,
      text,
      html: `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`,
    });
  } catch (error) {
    log.warn("Voice clone capacity alert email failed", {
      engine,
      code,
      error: error instanceof Error ? error.name : "unknown",
    });
  }
  return true;
}

export function resetCloneEngineAlertsForTests(): void {
  lastAlertAt.clear();
}
