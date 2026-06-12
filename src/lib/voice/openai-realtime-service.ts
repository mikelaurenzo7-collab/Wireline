import { createHash } from "node:crypto";
import { AppError } from "../api-error";
import { fetchWithTimeout, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import {
  OPENAI_REALTIME_DEFAULT_MODEL,
  buildOpenAIRealtimeInstructions,
  normalizeOpenAIRealtimeVoice,
} from "./openai-realtime-config";
import { OPENAI_REALTIME_WIRELINE_TOOLS } from "./openai-realtime-tools";

const OPENAI_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

export interface CreateOpenAIRealtimeClientSecretInput {
  userId: string;
  agentName?: string | null;
  model?: string | null;
  voice?: string | null;
}

function getOpenAIApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw AppError.fromHttpStatus(
      503,
      "OpenAI Realtime is not configured. Add OPENAI_API_KEY in Vercel environment variables.",
    );
  }
  return apiKey;
}

function safetyIdentifierForUser(userId: string): string {
  return createHash("sha256").update(`wireline:${userId}`).digest("hex");
}

export function buildOpenAIRealtimeSessionConfig(input: CreateOpenAIRealtimeClientSecretInput) {
  return {
    session: {
      type: "realtime",
      model: input.model?.trim() || OPENAI_REALTIME_DEFAULT_MODEL,
      output_modalities: ["audio"],
      instructions: buildOpenAIRealtimeInstructions(input.agentName),
      tools: OPENAI_REALTIME_WIRELINE_TOOLS,
      tool_choice: "auto",
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
    defaultModel: OPENAI_REALTIME_DEFAULT_MODEL,
    defaultVoice: normalizeOpenAIRealtimeVoice(process.env.OPENAI_REALTIME_VOICE),
    deepgramFluxRecommended: true,
    mode: "beta",
  };
}

export async function createOpenAIRealtimeClientSecret(input: CreateOpenAIRealtimeClientSecretInput) {
  const apiKey = getOpenAIApiKey();
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
        status: response.status,
        body: typeof text === "string" ? text.slice(0, 500) : undefined,
      });
      throw AppError.fromHttpStatus(
        response.status,
        "OpenAI Realtime session could not be created. Check OPENAI_API_KEY, model access, and billing.",
      );
    }

    return {
      ...((payload || {}) as Record<string, unknown>),
      wireline: {
        provider: "openai_realtime",
        model: body.session.model,
        voice: body.session.audio.output.voice,
        tools: OPENAI_REALTIME_WIRELINE_TOOLS.map((tool) => tool.name),
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error("OpenAI Realtime client secret request errored", {
      userId: input.userId,
      error: getErrorMessage(error),
    });
    throw AppError.fromHttpStatus(502, "OpenAI Realtime session request failed.");
  }
}
