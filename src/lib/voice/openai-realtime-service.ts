import { runInBackground } from "../background-work";
import { log } from "../server-context";
import {
  OPENAI_REALTIME_DEFAULT_MODEL,
  buildOpenAIRealtimeInstructions,
  normalizeOpenAIRealtimeVoice,
  type OpenAIRealtimeToolDefinition,
} from "./openai-realtime-config";
import { OPENAI_REALTIME_WIRELINE_TOOLS } from "./openai-realtime-tools";
import {
  createServerManagedOpenAIRealtimeCall,
  hangupOpenAIRealtimeCall,
} from "./openai-realtime-call-control";
import { OPENAI_REALTIME_COST_TRUNCATION } from "./openai-realtime-pricing";

export const OPENAI_REALTIME_SIMULATION_MAX_SECONDS = 300 as const;

export interface CreateOpenAIRealtimeSimulationCallInput {
  userId: string;
  sdp: string;
  agentName?: string | null;
  model?: string | null;
  voice?: string | null;
  /** Overrides the standard BotBound runtime instructions for isolated previews. */
  instructions?: string | null;
  /** Defaults to BotBound runtime tools. Pass [] for a tool-free demo. */
  tools?: OpenAIRealtimeToolDefinition[];
  /** Tool-free demos must disable tool selection explicitly. */
  toolChoice?: "auto" | "none";
  /** Routes acquisition/demo sessions to a separately budgeted OpenAI key when configured. */
  apiKeyPurpose?: "runtime" | "chatgpt_demo";
}

export function buildOpenAIRealtimeSessionConfig(input: CreateOpenAIRealtimeSimulationCallInput) {
  const tools = input.tools ?? OPENAI_REALTIME_WIRELINE_TOOLS;
  const requestedModel = input.model?.trim();
  if (requestedModel && requestedModel !== OPENAI_REALTIME_DEFAULT_MODEL) {
    log.warn("openai realtime session requested non-platform model, using default", {
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
      truncation: OPENAI_REALTIME_COST_TRUNCATION,
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
            rate: 24000,
          },
          voice: normalizeOpenAIRealtimeVoice(input.voice),
        },
      },
    },
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
    mode: "ga",
  };
}

export async function createOpenAIRealtimeSimulationCall(
  input: CreateOpenAIRealtimeSimulationCallInput,
) {
  const purpose =
    input.apiKeyPurpose || (input.userId.startsWith("guest:") ? "chatgpt_demo" : "runtime");
  const body = buildOpenAIRealtimeSessionConfig(input);
  const call = await createServerManagedOpenAIRealtimeCall({
    userId: input.userId,
    sdp: input.sdp,
    session: body.session,
    keyPurpose: purpose,
    maxDurationSeconds: OPENAI_REALTIME_SIMULATION_MAX_SECONDS,
    logContext: { userId: input.userId, surface: "private_simulation" },
  });
  const endsAt = new Date(Date.now() + call.maxDurationSeconds * 1_000);

  runInBackground(`OpenAI private simulation deadline ${call.callId}`, async () => {
    await delay(Math.max(0, endsAt.getTime() - Date.now()));
    await hangupOpenAIRealtimeCall({
      callId: call.callId,
      keyPurpose: purpose,
      keySource: call.keySource,
      expectedKeyFingerprint: call.keyFingerprint,
    });
  });

  log.info("OpenAI private simulation created", {
    userId: input.userId,
    purpose,
    callId: call.callId,
    maxDurationSeconds: call.maxDurationSeconds,
  });
  return {
    sdp: call.sdp,
    maxDurationSeconds: call.maxDurationSeconds,
    endsAt: endsAt.toISOString(),
    wireline: {
      provider: "openai_realtime",
      model: body.session.model,
      voice: body.session.audio.output.voice,
      tools: (input.tools ?? OPENAI_REALTIME_WIRELINE_TOOLS).map((tool) => tool.name),
      purpose,
    },
  } as const;
}
