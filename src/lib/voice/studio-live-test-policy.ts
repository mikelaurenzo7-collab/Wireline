import { OPENAI_REALTIME_DEFAULT_MODEL } from "./openai-realtime-config";

/**
 * Studio browser tests use OpenAI Realtime over an authenticated WebRTC
 * exchange. Production phone calls remain on the separate Twilio + xAI Direct
 * SIP lane; changing this browser default must never reconfigure PSTN.
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

export function getStudioLiveVoiceStatus() {
  const openaiConfigured = isStudioOpenAIRealtimeConfigured();
  return {
    configured: openaiConfigured,
    defaultProvider: "openai_realtime",
    fallbackProvider: null,
    provider: "openai",
    model: OPENAI_REALTIME_DEFAULT_MODEL,
    sessionMode: "authenticated_browser_webrtc_ephemeral_token",
    transcriptionEnabled: true,
    phoneRuntimeProvider: "xai_sip",
  } as const;
}
