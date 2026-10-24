import { fetchWithTimeout } from "../server-context";

/**
 * xAI Custom Voices: a consented reference clip becomes a team-scoped voice id
 * that works anywhere a built-in Grok voice works, including live
 * speech-to-speech sessions (`session.update.voice`). Because the realtime
 * model speaks the clone natively, a cloned voice adds no extra hop on a call.
 *
 * Docs: https://docs.x.ai/developers/model-capabilities/audio/custom-voices
 * - POST /v1/custom-voices is gated to Enterprise teams (403 otherwise).
 * - Up to 30 custom voices per team unless xAI raises the limit.
 * - Available in the United States, except Illinois.
 * - Reference clip up to 120 seconds; 90-120 seconds gives the best result.
 */
export const XAI_CUSTOM_VOICES_URL = "https://api.x.ai/v1/custom-voices";
export const XAI_TTS_URL = "https://api.x.ai/v1/tts";
const CREATE_TIMEOUT_MS = 60_000;
const CONTROL_TIMEOUT_MS = 15_000;
const TTS_TIMEOUT_MS = 20_000;
const MAX_TTS_BYTES = 2_000_000;

export type XAICustomVoiceErrorCode =
  | "not_configured"
  | "not_entitled"
  | "limit_reached"
  | "rejected_audio"
  | "region_unavailable"
  | "not_found"
  | "provider_unavailable";

export class XAICustomVoiceError extends Error {
  constructor(
    readonly code: XAICustomVoiceErrorCode,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "XAICustomVoiceError";
  }
}

export type XAICustomVoiceCreateInput = {
  name: string;
  wav: Buffer;
  language?: string;
  gender?: "male" | "female" | "neutral";
  tone?: string;
  useCase?: string;
  description?: string;
};

type FetchImpl = typeof fetchWithTimeout;

function apiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = String(env.XAI_API_KEY || "").trim();
  if (!key) throw new XAICustomVoiceError("not_configured", null, "Voice cloning is not set up.");
  return key;
}

export function isXAICustomVoiceConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(String(env.XAI_API_KEY || "").trim());
}

/** Provider voice ids are short opaque tokens; anything else never reaches a session. */
export function isXAICustomVoiceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(value);
}

async function readProviderMessage(response: Response): Promise<string> {
  try {
    const text = (await response.text()).slice(0, 2_000);
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const err = parsed.error;
      if (typeof err === "string") return err.slice(0, 300);
      if (err && typeof err === "object") {
        return String((err as Record<string, unknown>).message || "").slice(0, 300);
      }
      return String(parsed.message || parsed.detail || "").slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return "";
  }
}

/** Map a provider failure to a stable code the UI can explain kindly. */
export function classifyXAICustomVoiceFailure(
  status: number,
  message: string,
): XAICustomVoiceErrorCode {
  const text = message.toLowerCase();
  if (status === 401) return "not_configured";
  if (/region|country|illinois|not available in your/.test(text)) return "region_unavailable";
  if (status === 403) return "not_entitled";
  if (status === 404) return "not_found";
  if (status === 409 || status === 429 || /limit|quota|maximum/.test(text)) return "limit_reached";
  if (status === 400 || status === 413 || status === 415 || status === 422) return "rejected_audio";
  return "provider_unavailable";
}

export async function createXAICustomVoice(
  input: XAICustomVoiceCreateInput,
  fetchImpl: FetchImpl = fetchWithTimeout,
): Promise<{ voiceId: string }> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(input.wav)], { type: "audio/wav" }),
    "reference.wav",
  );
  form.append("name", input.name.slice(0, 80));
  form.append("language", input.language || "en");
  form.append("use_case", input.useCase || "conversational");
  if (input.gender) form.append("gender", input.gender);
  if (input.tone) form.append("tone", input.tone);
  if (input.description) form.append("description", input.description.slice(0, 200));
  const response = await fetchImpl(
    XAI_CUSTOM_VOICES_URL,
    { method: "POST", headers: { Authorization: `Bearer ${apiKey()}` }, body: form },
    CREATE_TIMEOUT_MS,
  ).catch((error: unknown) => {
    throw new XAICustomVoiceError(
      "provider_unavailable",
      null,
      error instanceof Error ? error.name : "network",
    );
  });
  if (!response.ok) {
    const message = await readProviderMessage(response);
    throw new XAICustomVoiceError(
      classifyXAICustomVoiceFailure(response.status, message),
      response.status,
      message || `HTTP ${response.status}`,
    );
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const voiceId = body.voice_id ?? body.id;
  if (!isXAICustomVoiceId(voiceId)) {
    throw new XAICustomVoiceError("provider_unavailable", response.status, "No voice id returned.");
  }
  return { voiceId };
}

/** Idempotent: a voice that is already gone counts as deleted. */
export async function deleteXAICustomVoice(
  voiceId: string,
  fetchImpl: FetchImpl = fetchWithTimeout,
): Promise<{ deleted: true; alreadyMissing: boolean }> {
  if (!isXAICustomVoiceId(voiceId)) return { deleted: true, alreadyMissing: true };
  const response = await fetchImpl(
    `${XAI_CUSTOM_VOICES_URL}/${encodeURIComponent(voiceId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${apiKey()}` } },
    CONTROL_TIMEOUT_MS,
  );
  if (response.status === 404) {
    await response.body?.cancel().catch(() => {});
    return { deleted: true, alreadyMissing: true };
  }
  if (!response.ok) {
    const message = await readProviderMessage(response);
    throw new XAICustomVoiceError(
      classifyXAICustomVoiceFailure(response.status, message),
      response.status,
      message || `HTTP ${response.status}`,
    );
  }
  await response.body?.cancel().catch(() => {});
  return { deleted: true, alreadyMissing: false };
}

/**
 * Speak one line in any voice (built-in or custom) for previews. Returns MP3.
 * The REST endpoint may answer with raw audio or a JSON body carrying base64.
 */
export async function synthesizeXAIVoiceLine(
  voiceId: string,
  text: string,
  fetchImpl: FetchImpl = fetchWithTimeout,
): Promise<Buffer> {
  const response = await fetchImpl(
    XAI_TTS_URL,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, 400),
        voice_id: voiceId,
        language: "en",
        output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 64000 },
      }),
    },
    TTS_TIMEOUT_MS,
  );
  if (!response.ok) {
    const message = await readProviderMessage(response);
    throw new XAICustomVoiceError(
      classifyXAICustomVoiceFailure(response.status, message),
      response.status,
      message || `HTTP ${response.status}`,
    );
  }
  const contentType = response.headers.get("content-type") || "";
  let audio: Buffer;
  if (contentType.includes("application/json")) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    audio = typeof body.audio === "string" ? Buffer.from(body.audio, "base64") : Buffer.alloc(0);
  } else {
    audio = Buffer.from(await response.arrayBuffer());
  }
  if (!audio.length || audio.length > MAX_TTS_BYTES) {
    throw new XAICustomVoiceError("provider_unavailable", response.status, "Empty preview audio.");
  }
  return audio;
}
