import { OPENAI_REALTIME_DEFAULT_MODEL } from "./openai-realtime-config";

/** Studio and PSTN share one OpenAI Realtime runtime across WebRTC and SIP. */
export const STUDIO_BROWSER_TEST_MAX_SECONDS = 300 as const;

export function isStudioOpenAIRealtimeConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getStudioLiveVoiceStatus() {
  const configured = isStudioOpenAIRealtimeConfigured();
  return {
    configured,
    defaultProvider: "openai_realtime",
    fallbackProvider: null,
    provider: "openai",
    model: OPENAI_REALTIME_DEFAULT_MODEL,
    sessionMode: "authenticated_server_mediated_webrtc",
    transcriptionEnabled: true,
    phoneRuntimeProvider: "openai_realtime_sip",
  } as const;
}
