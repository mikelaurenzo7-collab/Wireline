import { getCanonicalAppUrl } from "../app-url";

export const XAI_PHONE_NUMBERS_URL = "https://api.x.ai/v2/phone-numbers";
export const XAI_REALTIME_CALLS_URL = "https://api.x.ai/v1/realtime/calls";
export const XAI_REALTIME_WEBSOCKET_URL = "wss://api.x.ai/v1/realtime";
export const XAI_SIP_HOST = "sip.voice.x.ai";
export const XAI_TWILIO_TRUNK_FRIENDLY_NAME = "Wireline · xAI Direct SIP";
export const XAI_TWILIO_ORIGINATION_FRIENDLY_NAME = "xAI realtime primary";
export const XAI_OUTBOUND_SIP_TOKEN_HEADER = "X-Wireline-Token";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const TWILIO_SIP_URI_MAX_LENGTH = 255;
const XAI_CALL_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

export function normalizeXAIPhoneNumber(value: unknown): string | null {
  const phone = String(value || "")
    .trim()
    .replace(/[^\d+]/g, "");
  if (!phone.startsWith("+")) return null;
  const normalized = `+${phone.slice(1).replace(/\+/g, "")}`;
  return E164_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Join an xAI-managed SIP call by provider call id. xAI binds the model to the
 * SIP phone session and ignores a `model` query parameter when `call_id` is
 * present. `session.update` configures instructions, voice, tools, and turn
 * detection; it does not version-pin the SIP model. Browser Studio sessions are
 * separately pinned by `grok-voice-config.ts`.
 */
export function buildXAISipRealtimeUrl(callId: string): string {
  const normalized = callId.trim();
  if (!XAI_CALL_ID_PATTERN.test(normalized)) {
    throw new Error("A valid xAI SIP call id is required.");
  }
  const url = new URL(XAI_REALTIME_WEBSOCKET_URL);
  url.searchParams.set("call_id", normalized);
  return url.toString();
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
 * Twilio Elastic SIP Trunking regional signaling CIDRs.
 * https://www.twilio.com/docs/sip-trunking/ip-addresses
 *
 * These are public carrier ranges, not a credential. xAI Direct SIP uses them
 * as `sip_auth.allowed_addresses` so Twilio can originate to sip.voice.x.ai.
 * Override with `XAI_SIP_ALLOWED_ADDRESSES` only when Twilio publishes a
 * change ahead of a Wireline deploy.
 */
export const TWILIO_SIP_SIGNALING_ADDRESSES = [
  "54.172.60.0/30",
  "54.244.51.0/30",
  "54.171.127.192/30",
  "35.156.191.128/30",
  "54.65.63.192/30",
  "54.169.127.128/30",
  "54.252.254.64/30",
  "177.71.206.192/30",
] as const;

/** Strict IPv4/CIDR validation for xAI's SIP allowlist. */
export function isValidXAISipAllowedAddress(value: string): boolean {
  const candidate = value.trim();
  const parts = candidate.split("/");
  if (parts.length > 2 || !parts[0]) return false;

  const octets = parts[0].split(".");
  if (
    octets.length !== 4 ||
    octets.some(
      (octet) =>
        !/^\d{1,3}$/.test(octet) ||
        Number(octet) < 0 ||
        Number(octet) > 255,
    )
  ) {
    return false;
  }

  if (parts.length === 1) return true;
  const prefix = parts[1];
  if (!prefix || !/^\d{1,2}$/.test(prefix)) return false;
  const length = Number(prefix);
  // `/0` (and other internet-wide prefixes) would authorize Direct SIP from
  // any source. Twilio publishes regional signaling CIDRs; operators may
  // override the committed defaults, but never with a default-open allowlist.
  return length >= 8 && length <= 32;
}

/**
 * xAI Direct SIP must accept Twilio's published signaling ranges. Unset
 * `XAI_SIP_ALLOWED_ADDRESSES` uses the committed Twilio CIDRs. A set value
 * replaces the default list entirely so operators can ship a carrier change
 * without waiting on a deploy of this file.
 */
export function resolveXAISipAllowedAddresses(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw = String(env.XAI_SIP_ALLOWED_ADDRESSES || "").trim();
  if (!raw) return [...TWILIO_SIP_SIGNALING_ADDRESSES];
  const unique = [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
  if (!unique.length) return [...TWILIO_SIP_SIGNALING_ADDRESSES];
  if (unique.some((entry) => !isValidXAISipAllowedAddress(entry))) {
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
