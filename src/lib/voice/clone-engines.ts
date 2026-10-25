import { Buffer } from "node:buffer";

import { log } from "../server-context";
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
 * id, speaks previews, and deletes that id. Nothing here decides eligibility —
 * see clone-engine-selection.ts.
 *
 * - xai: https://docs.x.ai/developers/model-capabilities/audio/custom-voices
 *   (Enterprise-gated API, US except Illinois, 30 voices per team by default).
 *   Spoken natively by the realtime phone session (no extra hop).
 * - elevenlabs: https://elevenlabs.io/docs/api-reference/voices/ivc/create
 *   Instant Voice Cloning; slot- and credit-limited by the workspace plan.
 *   Live calls need a text-to-speech bridge (see docs/CLONED_VOICE_ENGINES.md).
 */
export const CLONE_ENGINE_IDS = ["xai", "elevenlabs"] as const;
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
  capacity(): Promise<CloneEngineCapacity>;
  isVoiceId(value: unknown): value is string;
};

type Env = NodeJS.ProcessEnv;

function xaiCode(error: unknown): CloneEngineErrorCode {
  return error instanceof XAICustomVoiceError ? error.code : "provider_unavailable";
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
