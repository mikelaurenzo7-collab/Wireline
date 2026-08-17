import { getCanonicalAppUrl } from "../app-url";

export const XAI_PHONE_NUMBERS_URL = "https://api.x.ai/v2/phone-numbers";
export const XAI_REALTIME_CALLS_URL = "https://api.x.ai/v1/realtime/calls";
export const XAI_SIP_HOST = "sip.voice.x.ai";
export const XAI_TWILIO_TRUNK_FRIENDLY_NAME = "Wireline · xAI Direct SIP";
export const XAI_TWILIO_ORIGINATION_FRIENDLY_NAME = "xAI realtime primary";
export const XAI_OUTBOUND_SIP_TOKEN_HEADER = "X-Wireline-Token";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const SIMPLE_CIDR_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$/;
const TWILIO_SIP_URI_MAX_LENGTH = 255;

export function normalizeXAIPhoneNumber(value: unknown): string | null {
  const phone = String(value || "")
    .trim()
    .replace(/[^\d+]/g, "");
  if (!phone.startsWith("+")) return null;
  const normalized = `+${phone.slice(1).replace(/\+/g, "")}`;
  return E164_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Twilio Elastic SIP origination uses a shared host-only URI. Twilio fills the
 * user part with the number that was dialed, producing the exact registered
 * xAI destination `sip:+E164@sip.voice.x.ai;transport=tls` for each line.
 */
export function xaiSharedTwilioOriginationUri(): string {
  return `sip:${XAI_SIP_HOST};transport=tls`;
}

export function xaiSipUriForPhone(phoneNumber: string): string {
  const normalized = normalizeXAIPhoneNumber(phoneNumber);
  if (!normalized) throw new Error("xAI SIP routing requires a valid E.164 phone number.");
  return `sip:${normalized}@${XAI_SIP_HOST};transport=tls`;
}

/**
 * Twilio turns `X-` query parameters on a `<Sip>` URI into SIP headers. The
 * token is base64url, contains no PII, and is length-bounded before this helper.
 */
export function buildXAIOutboundSipUri(phoneNumber: string, token: string): string {
  const candidate = `${xaiSipUriForPhone(phoneNumber)}?${XAI_OUTBOUND_SIP_TOKEN_HEADER}=${encodeURIComponent(
    token,
  )}`;
  if (candidate.length > TWILIO_SIP_URI_MAX_LENGTH) {
    throw new Error("Native outbound SIP URI exceeds Twilio's length limit.");
  }
  return candidate;
}

export function xaiVoiceWebhookUrl(): string {
  return `${getCanonicalAppUrl()}/api/webhooks/xai/voice`;
}

export function twilioXAIOutboundBridgeUrl(token: string): string {
  const url = new URL("/api/twilio-webhook/xai-outbound-bridge", `${getCanonicalAppUrl()}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

export function twilioXAIOutboundStatusUrl(token: string): string {
  const url = new URL("/api/twilio-webhook/xai-outbound-status", `${getCanonicalAppUrl()}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

export function twilioVoiceFallbackUrl(): string {
  return `${getCanonicalAppUrl()}/api/twilio-webhook/voice-fallback`;
}

/**
 * xAI Direct SIP must accept Twilio's published signaling ranges. The list is
 * operator-owned because carrier ranges can change independently of a deploy.
 * Set `XAI_SIP_ALLOWED_ADDRESSES` as comma/newline-separated CIDR blocks.
 */
export function resolveXAISipAllowedAddresses(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const entries = String(env.XAI_SIP_ALLOWED_ADDRESSES || "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const unique = [...new Set(entries)];
  if (!unique.length) {
    throw new Error(
      "XAI_SIP_ALLOWED_ADDRESSES is required before registering a Twilio number with xAI.",
    );
  }
  if (unique.some((entry) => !SIMPLE_CIDR_PATTERN.test(entry))) {
    throw new Error("XAI_SIP_ALLOWED_ADDRESSES contains an invalid IPv4/CIDR entry.");
  }
  return unique;
}

/** Vercel's voice worker is bounded below the configured 600-second function ceiling. */
export function resolveXAISipSessionMaxSeconds(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const configured = Number(env.WIRELINE_XAI_SIP_MAX_SECONDS);
  if (!Number.isFinite(configured)) return 540;
  return Math.max(60, Math.min(540, Math.floor(configured)));
}

/**
 * xAI documents TLS signaling for Twilio. SRTP support must be certified in a
 * live trunk probe before Twilio Secure Trunking is enabled automatically.
 */
export function xaiSecureTrunkingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = String(env.WIRELINE_XAI_SIP_SECURE_TRUNKING || "")
    .trim()
    .toLowerCase();
  return value === "true" || value === "1" || value === "on";
}
