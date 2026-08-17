import { AppError } from "../api-error";
import { fetchWithTimeout, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import {
  GROK_VOICE_CLIENT_SECRETS_URL,
  GROK_VOICE_DEFAULT_MODEL,
  GROK_VOICE_EPHEMERAL_TOKEN_TTL_SECONDS,
  buildGrokVoiceRealtimeUrl,
  type WirelineVoiceProfile,
} from "./grok-voice-config";
import {
  buildXAIRealtimeAgentRuntime,
  getXAIRealtimeVoiceProfile,
  searchApprovedAgentKnowledge,
  setXAIRealtimeVoiceProfile,
} from "./xai-agent-runtime";

type XAIClientSecretPayload = {
  value?: string;
  expires_at?: number;
  client_secret?: {
    value?: string;
    expires_at?: number;
  };
};

function tokenValue(payload: XAIClientSecretPayload): string {
  return payload.client_secret?.value?.trim() || payload.value?.trim() || "";
}

function tokenExpiry(payload: XAIClientSecretPayload): number | null {
  const raw = payload.client_secret?.expires_at ?? payload.expires_at;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export async function createXAILiveVoiceSession(input: { userId: string; agentId: string }) {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) throw AppError.serviceUnavailable("Live voice is not configured yet.");

  const runtime = await buildXAIRealtimeAgentRuntime({
    userId: input.userId,
    agentId: input.agentId,
    surface: "browser_test",
  });

  try {
    const response = await fetchWithTimeout(
      GROK_VOICE_CLIENT_SECRETS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expires_after: { seconds: GROK_VOICE_EPHEMERAL_TOKEN_TTL_SECONDS },
        }),
      },
      15_000,
    );
    const responseText = await response.text();
    let payload: XAIClientSecretPayload = {};
    if (responseText) {
      try {
        payload = JSON.parse(responseText) as XAIClientSecretPayload;
      } catch {
        payload = {};
      }
    }
    const clientSecret = tokenValue(payload);
    if (!response.ok || !clientSecret) {
      // Provider bodies can contain request diagnostics and must never enter
      // customer responses or logs. Status + scoped identifiers are enough for
      // operational correlation with the xAI console.
      log.warn("xAI realtime client secret mint failed", {
        userId: input.userId,
        agentId: input.agentId,
        status: response.status,
      });
      throw AppError.fromHttpStatus(
        response.status || 502,
        "Live voice session could not be created. Check model access and billing.",
      );
    }

    const expiresAtSeconds = tokenExpiry(payload);
    log.info("xAI live voice session created", {
      userId: input.userId,
      agentId: input.agentId,
      model: runtime.model,
      voice: runtime.voice,
      profile: runtime.profile,
    });

    return {
      clientSecret,
      expiresAt: expiresAtSeconds
        ? new Date(expiresAtSeconds * 1000).toISOString()
        : new Date(Date.now() + GROK_VOICE_EPHEMERAL_TOKEN_TTL_SECONDS * 1000).toISOString(),
      websocketUrl: buildGrokVoiceRealtimeUrl(),
      model: runtime.model,
      voice: runtime.voice,
      greeting: runtime.greeting,
      session: runtime.session,
      wireline: {
        provider: "xai_realtime",
        phoneRuntimeProvider: "xai_sip",
        agentId: runtime.agentId,
        profile: runtime.profile,
        tools: runtime.toolNames,
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error("xAI realtime session mint failed", {
      userId: input.userId,
      agentId: input.agentId,
      error: getErrorMessage(error),
    });
    throw AppError.fromHttpStatus(502, "Live voice session request failed.");
  }
}

export async function runXAILiveVoiceTool(input: {
  userId: string;
  agentId: string;
  name: string;
  arguments: unknown;
}) {
  if (input.name !== "search_agent_knowledge") {
    throw AppError.badRequest("Unsupported live voice tool.");
  }
  const raw =
    input.arguments && typeof input.arguments === "object"
      ? (input.arguments as Record<string, unknown>)
      : {};
  return searchApprovedAgentKnowledge({
    userId: input.userId,
    agentId: input.agentId,
    query: raw.query,
  });
}

export function getXAILiveVoiceStatus() {
  return {
    configured: Boolean(process.env.XAI_API_KEY?.trim()),
    defaultProvider: "xai_realtime",
    provider: "xai",
    defaultModel: GROK_VOICE_DEFAULT_MODEL,
    model: GROK_VOICE_DEFAULT_MODEL,
    sessionMode: "authenticated_browser_websocket_ephemeral_token",
    transcriptionEnabled: true,
    phoneRuntimeProvider: "xai_sip",
    openaiFallbackConfigured: false,
  } as const;
}

export function getXAILiveVoiceProfile(userId: string, agentId: string) {
  return getXAIRealtimeVoiceProfile(userId, agentId);
}

export function setXAILiveVoiceProfile(
  userId: string,
  agentId: string,
  profile: WirelineVoiceProfile,
) {
  return setXAIRealtimeVoiceProfile(userId, agentId, profile);
}
