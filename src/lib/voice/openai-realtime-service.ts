import { createHash } from "node:crypto";
import { AppError } from "../api-error";
import { fetchWithTimeout, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import {
  OPENAI_REALTIME_DEFAULT_MODEL,
  buildOpenAIRealtimeInstructions,
  normalizeOpenAIRealtimeVoice,
  type OpenAIRealtimeToolDefinition,
} from "./openai-realtime-config";
import { OPENAI_REALTIME_WIRELINE_TOOLS } from "./openai-realtime-tools";

const OPENAI_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

export interface CreateOpenAIRealtimeClientSecretInput {
  userId: string;
  agentName?: string | null;
  model?: string | null;
  voice?: string | null;
  /** Overrides the standard Wireline runtime instructions for isolated previews. */
  instructions?: string | null;
  /** Defaults to Wireline runtime tools. Pass [] for a tool-free demo. */
  tools?: OpenAIRealtimeToolDefinition[];
  /** Tool-free demos must disable tool selection explicitly. */
  toolChoice?: "auto" | "none";
  /** Routes acquisition/demo sessions to a separately budgeted OpenAI key when configured. */
  apiKeyPurpose?: "runtime" | "chatgpt_demo";
}

function getOpenAIApiKey(
  purpose: CreateOpenAIRealtimeClientSecretInput["apiKeyPurpose"] = "runtime",
): string {
  const apiKey =
    (purpose === "chatgpt_demo" ? process.env.OPENAI_API_KEY_CHATKIT?.trim() : "") ||
    process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw AppError.fromHttpStatus(
      503,
      purpose === "chatgpt_demo"
        ? "ChatGPT voice preview is not configured. Add OPENAI_API_KEY_CHATKIT or OPENAI_API_KEY in Vercel."
        : "OpenAI Realtime is not configured. Add OPENAI_API_KEY in Vercel environment variables.",
    );
  }
  return apiKey;
}

function safetyIdentifierForUser(userId: string): string {
  return createHash("sha256").update(`wireline:${userId}`).digest("hex");
}

export function buildOpenAIRealtimeSessionConfig(input: CreateOpenAIRealtimeClientSecretInput) {
  const tools = input.tools ?? OPENAI_REALTIME_WIRELINE_TOOLS;
  // Sessions are minted on the PLATFORM OpenAI key, so the model is pinned to
  // the platform-configured default. Forwarding a caller-supplied model string
  // here let any authenticated user mint sessions on arbitrary (potentially
  // far more expensive) realtime models at platform cost.
  const requestedModel = input.model?.trim();
  if (requestedModel && requestedModel !== OPENAI_REALTIME_DEFAULT_MODEL) {
    log.warn("openai realtime session requested non-platform model — using default", {
      requested: requestedModel.slice(0, 80),
    });
  }
  return {
    session: {
      type: "realtime",
      model: OPENAI_REALTIME_DEFAULT_MODEL,
      output_modalities: ["audio"],
      instructions:
        input.instructions?.trim().slice(0, 16_000) ||
        buildOpenAIRealtimeInstructions(input.agentName),
      tools,
      tool_choice: input.toolChoice || "auto",
      audio: {
        input: {
          format: {
            type: "audio/pcm",
            rate: 24000,
          },
          turn_detection: {
            type: "semantic_vad",
          },
        },
        output: {
          format: {
            type: "audio/pcm",
          },
          voice: normalizeOpenAIRealtimeVoice(input.voice),
        },
      },
    },
  };
}

export function getOpenAIRealtimeStatus() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    chatgptDemoConfigured: Boolean(
      process.env.OPENAI_API_KEY_CHATKIT?.trim() || process.env.OPENAI_API_KEY?.trim(),
    ),
    defaultModel: OPENAI_REALTIME_DEFAULT_MODEL,
    defaultVoice: normalizeOpenAIRealtimeVoice(process.env.OPENAI_REALTIME_VOICE),
    deepgramFluxRecommended: true,
    mode: "beta",
  };
}

export async function createOpenAIRealtimeClientSecret(
  input: CreateOpenAIRealtimeClientSecretInput,
) {
  const purpose =
    input.apiKeyPurpose || (input.userId.startsWith("guest:") ? "chatgpt_demo" : "runtime");
  const apiKey = getOpenAIApiKey(purpose);
  const body = buildOpenAIRealtimeSessionConfig(input);

  try {
    const response = await fetchWithTimeout(
      OPENAI_REALTIME_CLIENT_SECRETS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyIdentifierForUser(input.userId),
        },
        body: JSON.stringify(body),
      },
      15_000,
    );

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    if (!response.ok) {
      log.warn("OpenAI Realtime client secret request failed", {
        userId: input.userId,
        purpose,
        status: response.status,
        body: typeof text === "string" ? text.slice(0, 500) : undefined,
      });
      throw AppError.fromHttpStatus(
        response.status,
        "OpenAI Realtime session could not be created. Check OpenAI model access and billing.",
      );
    }

    return {
      ...((payload || {}) as Record<string, unknown>),
      wireline: {
        provider: "openai_realtime",
        model: body.session.model,
        voice: body.session.audio.output.voice,
        tools: (input.tools ?? OPENAI_REALTIME_WIRELINE_TOOLS).map((tool) => tool.name),
        purpose,
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error("OpenAI Realtime client secret request errored", {
      userId: input.userId,
      purpose,
      error: getErrorMessage(error),
    });
    throw AppError.fromHttpStatus(502, "OpenAI Realtime session request failed.");
  }
}
