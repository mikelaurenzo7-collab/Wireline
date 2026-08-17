import { OPENAI_REALTIME_DEFAULT_MODEL } from "./openai-realtime-config";
import { GROK_VOICE_DEFAULT_MODEL } from "./grok-voice-config";

/**
 * Studio live tests must use the same managed default as live phone calls.
 * Users do not pick a separate test brain. OpenAI Realtime is backup only
 * when native xAI realtime is unavailable — never a parallel default.
 */
export const STUDIO_BROWSER_TEST_MAX_SECONDS = 180 as const;
export const STUDIO_VAPI_WEB_TICKET_TTL_SECONDS = 120 as const;
export const STUDIO_VAPI_WEB_ASSISTANT_SENTINEL = "wireline-studio-live-test";
export const STUDIO_VAPI_WEB_PROXY_PATH = "/api/voice/live/vapi";

export function isStudioVapiWebConfigured(): boolean {
  return Boolean(process.env.VAPI_PRIVATE_KEY?.trim());
}

export function isStudioOpenAIRealtimeConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function isStudioXAIRealtimeConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

export function getStudioLiveVoiceStatus() {
  const xaiConfigured = isStudioXAIRealtimeConfigured();
  const openaiConfigured = isStudioOpenAIRealtimeConfigured();
  return {
    configured: xaiConfigured || openaiConfigured,
    defaultProvider: xaiConfigured ? "xai_realtime" : "openai_realtime",
    fallbackProvider: openaiConfigured ? "openai_realtime" : null,
    provider: xaiConfigured ? "xai" : "openai",
    model: xaiConfigured ? GROK_VOICE_DEFAULT_MODEL : OPENAI_REALTIME_DEFAULT_MODEL,
    sessionMode: xaiConfigured
      ? "authenticated_browser_websocket_ephemeral_token"
      : "authenticated_browser_and_mobile_webrtc",
    transcriptionEnabled: true,
    phoneRuntimeProvider: "xai_sip",
    openaiFallbackConfigured: openaiConfigured,
  } as const;
}
