export const GROK_VOICE_DEFAULT_MODEL =
  process.env.XAI_GROK_VOICE_MODEL?.trim() || "grok-voice-think-fast-2.0";

export const GROK_VOICE_REALTIME_URL = "wss://api.x.ai/v1/realtime";
export const GROK_VOICE_CLIENT_SECRETS_URL =
  "https://api.x.ai/v1/realtime/client_secrets";
export const GROK_VOICE_EPHEMERAL_TOKEN_TTL_SECONDS = 300;
export const GROK_VOICE_SAMPLE_RATE = 24_000;

export function buildGrokVoiceRealtimeUrl(
  model: string = GROK_VOICE_DEFAULT_MODEL,
): string {
  const url = new URL(GROK_VOICE_REALTIME_URL);
  url.searchParams.set("model", model);
  return url.toString();
}

export type WirelineVoiceProfile = "bright" | "warm" | "clear" | "balanced" | "direct";

export const WIRELINE_LIVE_VOICE_PROFILES: ReadonlyArray<{
  id: WirelineVoiceProfile;
  label: string;
  description: string;
}> = [
  { id: "bright", label: "Bright", description: "Upbeat, energetic, and personable." },
  { id: "warm", label: "Warm", description: "Friendly, patient, and conversational." },
  { id: "clear", label: "Clear", description: "Confident, crisp, and business-ready." },
  { id: "balanced", label: "Balanced", description: "Neutral, composed, and versatile." },
  { id: "direct", label: "Direct", description: "Decisive, focused, and authoritative." },
] as const;

/**
 * World-class live voice personality mapping.
 * Role-tuned profiles + Grok realtime reasoning deliver distinctive,
 * context-aware voices while keeping all vendor details and hype
 * out of the customer experience. Profiles are resolved server-side
 * and paired with safe knowledge tools only.
 */
const PROFILE_TO_VOICE: Record<WirelineVoiceProfile, string> = {
  bright: "eve",
  warm: "ara",
  clear: "rex",
  balanced: "sal",
  direct: "leo",
};

const ROLE_TO_PROFILE: Record<string, WirelineVoiceProfile> = {
  sales: "clear",
  lead_qualifier: "clear",
  scheduler: "warm",
  appointment_scheduler: "warm",
  receptionist: "balanced",
  customer_service: "warm",
  technical_support: "balanced",
  collections: "direct",
};

const LANGUAGE_HINTS = [
  "en",
  "ar-EG",
  "ar-SA",
  "ar-AE",
  "bn",
  "zh",
  "fr",
  "de",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "pt-BR",
  "pt-PT",
  "ru",
  "es-MX",
  "es-ES",
  "tr",
  "vi",
] as const;

const SUPPORTED_LANGUAGE_HINTS = new Map(
  LANGUAGE_HINTS.map((language) => [language.toLowerCase(), language] as const),
);

export type GrokRealtimeFunction = {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
};

export const WIRELINE_GROK_REALTIME_TOOLS: readonly GrokRealtimeFunction[] = [
  {
    type: "function",
    name: "search_agent_knowledge",
    description:
      "Search the selected agent's approved facts, policies, and operating rules before answering a specific question.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The exact question or fact to look up in approved agent Training.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
] as const;

export function normalizeWirelineVoiceProfile(value: unknown): WirelineVoiceProfile | undefined {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return WIRELINE_LIVE_VOICE_PROFILES.some((profile) => profile.id === candidate)
    ? (candidate as WirelineVoiceProfile)
    : undefined;
}

export function resolveWirelineVoiceProfile(
  role?: string | null,
  requestedProfile?: unknown,
): WirelineVoiceProfile {
  const explicit = normalizeWirelineVoiceProfile(requestedProfile);
  if (explicit) return explicit;
  const normalizedRole = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return ROLE_TO_PROFILE[normalizedRole] || "balanced";
}

export function resolveWirelineGrokVoice(role?: string | null, requestedProfile?: unknown): string {
  return PROFILE_TO_VOICE[resolveWirelineVoiceProfile(role, requestedProfile)];
}

export function normalizeGrokLanguageHint(value: unknown): string | undefined {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SUPPORTED_LANGUAGE_HINTS.get(candidate);
}

export function resolveGrokReasoningEffort(): "high" | "none" {
  return process.env.XAI_GROK_VOICE_REASONING_EFFORT?.trim().toLowerCase() === "none"
    ? "none"
    : "high";
}

export function resolveGrokVoiceSpeed(): number {
  const raw = Number(process.env.XAI_GROK_VOICE_SPEED);
  return Number.isFinite(raw) && raw >= 0.7 && raw <= 1.5 ? raw : 1;
}
