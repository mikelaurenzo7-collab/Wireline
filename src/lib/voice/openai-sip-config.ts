import { getCanonicalAppUrl } from "../app-url";

export const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
export const OPENAI_REALTIME_SIDEBAND_URL = "wss://api.openai.com/v1/realtime";
export const OPENAI_SIP_WEBHOOK_PATH = "/api/webhooks/openai/realtime";
export const OPENAI_SIP_DEFAULT_MAX_SECONDS = 300 as const;
export const OPENAI_OUTBOUND_SIP_TOKEN_HEADER = "X-BotBound-Token" as const;
export const OPENAI_INBOUND_SIP_TOKEN_HEADER = "X-BB-Inbound" as const;

const TWILIO_SIP_URI_MAX_LENGTH = 255;
const TWILIO_OUTBOUND_CONNECTION_OVERRIDES = "#ct=2000&rt=5000&tt=15000&rc=2&rp=ct,rt,5xx" as const;

function withTwilioConnectionOverrides(url: URL): string {
  return `${url.toString()}${TWILIO_OUTBOUND_CONNECTION_OVERRIDES}`;
}

export function normalizeOpenAIPhoneNumber(value: unknown): string | null {
  const raw = String(value || "").trim();
  const embedded = raw.match(/\+[1-9]\d{7,14}/)?.[0] || raw;
  const digits = embedded.replace(/[^\d+]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function resolveOpenAISipSessionMaxSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.OPENAI_SIP_MAX_CALL_SECONDS);
  if (!Number.isFinite(raw)) return OPENAI_SIP_DEFAULT_MAX_SECONDS;
  return Math.max(30, Math.min(300, Math.floor(raw)));
}

export function buildOpenAISipRealtimeUrl(callId: string): string {
  const normalized = callId.trim();
  if (!/^[A-Za-z0-9_.:-]{1,256}$/.test(normalized)) {
    throw new Error("OpenAI Realtime call id is invalid.");
  }
  const url = new URL(OPENAI_REALTIME_SIDEBAND_URL);
  url.searchParams.set("call_id", normalized);
  return url.toString();
}

export function openAIProjectSipUri(env: NodeJS.ProcessEnv = process.env): string {
  const projectId = String(env.OPENAI_PROJECT_ID || "").trim();
  if (!/^proj_[A-Za-z0-9_-]{8,}$/.test(projectId)) {
    throw new Error("OPENAI_PROJECT_ID is missing or invalid.");
  }
  return `sip:${projectId}@sip.api.openai.com;transport=tls`;
}

/**
 * Twilio forwards x- prefixed SIP URI query parameters as SIP headers. The
 * signed token carries no PII and binds the OpenAI incoming-call webhook to
 * one durable outbound placement.
 */
export function buildOpenAIOutboundSipUri(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const normalizedToken = token.trim();
  if (!normalizedToken || normalizedToken.length > 180) {
    throw new Error("OpenAI outbound SIP token is invalid.");
  }
  const candidate = `${openAIProjectSipUri(env)}?${OPENAI_OUTBOUND_SIP_TOKEN_HEADER}=${encodeURIComponent(
    normalizedToken,
  )}`;
  if (candidate.length > TWILIO_SIP_URI_MAX_LENGTH) {
    throw new Error("OpenAI outbound SIP URI exceeds Twilio's length limit.");
  }
  return candidate;
}

/**
 * Bind an inbound Twilio leg to its BotBound-owned number without embedding a
 * tenant or Bot identifier in the carrier configuration. OpenAI includes this
 * x-prefixed SIP header in the signed incoming-call event, where the current
 * database assignment remains authoritative.
 */
export function buildOpenAIInboundSipUri(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const normalizedToken = token.trim();
  if (!normalizedToken || normalizedToken.length > 220) {
    throw new Error("OpenAI inbound SIP token is invalid.");
  }
  const candidate = `${openAIProjectSipUri(env)}?${OPENAI_INBOUND_SIP_TOKEN_HEADER}=${encodeURIComponent(
    normalizedToken,
  )}`;
  if (candidate.length > TWILIO_SIP_URI_MAX_LENGTH) {
    throw new Error("OpenAI inbound SIP URI exceeds Twilio's length limit.");
  }
  return candidate;
}

export function twilioOpenAIInboundVoiceUrl(): string {
  const url = new URL("/api/twilio-webhook/openai-inbound", `${getCanonicalAppUrl()}/`);
  return withTwilioConnectionOverrides(url);
}

export function twilioOpenAIInboundFallbackUrl(): string {
  const url = new URL("/api/twilio-webhook/openai-inbound-fallback", `${getCanonicalAppUrl()}/`);
  return withTwilioConnectionOverrides(url);
}

export function twilioOpenAIOutboundBridgeUrl(token: string): string {
  const url = new URL("/api/twilio-webhook/openai-outbound-bridge", `${getCanonicalAppUrl()}/`);
  url.searchParams.set("token", token);
  return withTwilioConnectionOverrides(url);
}

export function twilioOpenAIOutboundStatusUrl(token: string): string {
  const url = new URL("/api/twilio-webhook/openai-outbound-status", `${getCanonicalAppUrl()}/`);
  url.searchParams.set("token", token);
  return withTwilioConnectionOverrides(url);
}

export function twilioOpenAIOutboundFallbackUrl(token: string): string {
  const url = new URL("/api/twilio-webhook/openai-outbound-fallback", `${getCanonicalAppUrl()}/`);
  url.searchParams.set("token", token);
  return withTwilioConnectionOverrides(url);
}

export function openAISipWebhookUrl(): string {
  return `${getCanonicalAppUrl()}${OPENAI_SIP_WEBHOOK_PATH}`;
}

export function openAISipConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    String(env.OPENAI_API_KEY || "").trim() &&
    /^proj_[A-Za-z0-9_-]{8,}$/.test(String(env.OPENAI_PROJECT_ID || "").trim()) &&
    String(env.OPENAI_WEBHOOK_SECRET || "").trim(),
  );
}
