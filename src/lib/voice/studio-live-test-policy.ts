import {
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
} from "../ai-models";
import { OPENAI_REALTIME_DEFAULT_MODEL } from "./openai-realtime-config";

/**
 * Studio live tests must use the same managed default as live phone calls.
 * Users do not pick a separate test brain. OpenAI Realtime is backup only
 * when Vapi is unavailable — never a parallel default.
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
  const vapiConfigured = isStudioVapiWebConfigured();
  const openaiConfigured = isStudioOpenAIRealtimeConfigured();
  return {
    configured: vapiConfigured || openaiConfigured,
    defaultProvider: vapiConfigured ? "vapi" : "openai_realtime",
    fallbackProvider: openaiConfigured ? "openai_realtime" : null,
    provider: vapiConfigured ? VAPI_TENANT_DEFAULT_PROVIDER : "openai",
    model: vapiConfigured ? VAPI_TENANT_DEFAULT_MODEL : OPENAI_REALTIME_DEFAULT_MODEL,
    sessionMode: vapiConfigured
      ? "authenticated_browser_vapi_web"
      : "authenticated_browser_and_mobile_webrtc",
    transcriptionEnabled: true,
    phoneDemoProvider: "vapi",
    openaiFallbackConfigured: openaiConfigured,
  } as const;
}
