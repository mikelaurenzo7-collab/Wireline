/**
 * Live phone calls run on one of two speech-to-speech providers that share the
 * Realtime SIP protocol: OpenAI Realtime and xAI Grok Voice. The provider is
 * chosen when Twilio bridges the call and then travels with the call id, so
 * every later step (database records, leases, hangup, transfer, recovery after
 * a restart) reaches the same provider without extra lookups.
 *
 * xAI call ids carry an `xai:` prefix inside BotBound. OpenAI ids stay bare, so
 * records written before xAI existed keep their meaning.
 */
export type RealtimeVoiceProvider = "openai" | "xai";

export const XAI_CALL_ID_PREFIX = "xai:" as const;

export const OPENAI_REALTIME_CALLS_BASE_URL = "https://api.openai.com/v1/realtime/calls";
export const OPENAI_REALTIME_WEBSOCKET_URL = "wss://api.openai.com/v1/realtime";
export const XAI_REALTIME_CALLS_BASE_URL = "https://api.x.ai/v1/realtime/calls";
export const XAI_REALTIME_WEBSOCKET_URL = "wss://api.x.ai/v1/realtime";

const PROVIDER_CALL_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,256}$/;

export function realtimeProviderForCallId(callId: string): RealtimeVoiceProvider {
  return callId.startsWith(XAI_CALL_ID_PREFIX) ? "xai" : "openai";
}

/** The id the provider itself issued, without BotBound's routing prefix. */
export function providerNativeCallId(callId: string): string {
  return callId.startsWith(XAI_CALL_ID_PREFIX) ? callId.slice(XAI_CALL_ID_PREFIX.length) : callId;
}

export function xaiCallId(nativeCallId: string): string {
  return `${XAI_CALL_ID_PREFIX}${nativeCallId.trim()}`;
}

/**
 * The provider new phone calls use. OpenAI stays the default until the owner
 * opts in, and it remains the fallback for any number not registered with xAI.
 */
export function configuredPhoneVoiceProvider(
  env: NodeJS.ProcessEnv = process.env,
): RealtimeVoiceProvider {
  return String(env.WIRELINE_PHONE_VOICE_PROVIDER || "")
    .trim()
    .toLowerCase() === "xai"
    ? "xai"
    : "openai";
}

export function realtimeApiKey(
  provider: RealtimeVoiceProvider,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return String((provider === "xai" ? env.XAI_API_KEY : env.OPENAI_API_KEY) || "").trim();
}

export function realtimeCallsBaseUrl(provider: RealtimeVoiceProvider): string {
  return provider === "xai" ? XAI_REALTIME_CALLS_BASE_URL : OPENAI_REALTIME_CALLS_BASE_URL;
}

/** Control endpoint for one call: hangup, refer, and (OpenAI only) accept/reject. */
export function realtimeCallControlUrl(callId: string, action: string): string {
  const provider = realtimeProviderForCallId(callId);
  return `${realtimeCallsBaseUrl(provider)}/${encodeURIComponent(providerNativeCallId(callId))}/${action}`;
}

/** The SIP session socket for a call, on whichever provider owns it. */
export function buildRealtimeSipSocketUrl(callId: string): string {
  const provider = realtimeProviderForCallId(callId);
  const nativeId = providerNativeCallId(callId).trim();
  if (!PROVIDER_CALL_ID_PATTERN.test(nativeId)) {
    throw new Error("Realtime call id is invalid.");
  }
  const url = new URL(
    provider === "xai" ? XAI_REALTIME_WEBSOCKET_URL : OPENAI_REALTIME_WEBSOCKET_URL,
  );
  url.searchParams.set("call_id", nativeId);
  return url.toString();
}

export function realtimeProviderLabel(provider: RealtimeVoiceProvider): string {
  return provider === "xai" ? "xAI Grok Voice" : "OpenAI Realtime";
}
