import { and, desc, eq } from "drizzle-orm";
import { Behavior, Modality, Type, type LiveConnectConfig, type Tool } from "@google/genai";
import { AppError } from "../api-error";
import { drizzle, serialQueryBatch } from "../server-context";
import * as schema from "../../db/schema";
import {
  excerptAroundMatch,
  knowledgeSearchWords,
  searchAgentKnowledge,
  DIRECTIVE_PROMPT_ORDER,
} from "../agent-knowledge-search";
import {
  GEMINI_3_8_LIVE_MODEL,
  GEMINI_3_8_LIVE_EXTENDED_THINKING_MODEL,
  RESOLVED_GEMINI_LIVE_MODEL,
  type GeminiLiveModel,
} from "./gemini-live-client";
import { resolveGeminiLiveVoice } from "../voice-catalog";
import {
  composeOpenAILiveInstructions,
  type OpenAILiveInstructionAgent,
} from "./openai-live-agent-service";
import {
  isSavedRuntimeReviewRequired,
  RUNTIME_REVIEW_REQUIRED_RESPONSE,
  RUNTIME_REVIEW_REQUIRED_GREETING,
} from "../runtime-template-personality";
import { resolveAgentGreeting } from "../agent-greeting";

export const GEMINI_LIVE_DEFAULT_MODEL = RESOLVED_GEMINI_LIVE_MODEL;
const MAX_INITIAL_KNOWLEDGE_ITEMS = 8;
const MAX_LIVE_KB_RESULTS = 5;
const MAX_LIVE_KB_RESULT_CHARS = 900;

/**
 * Gemini 3.8 Live function declaration definitions.
 * Follows the non-blocking async tool calling standard (behavior: "NON_BLOCKING").
 */
export const GEMINI_LIVE_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "search_agent_knowledge",
        description:
          "Search this Bot's approved Training rules and knowledge before answering policy, pricing, or product questions.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description:
                "The exact policy, product, service, price, or procedure question to verify.",
            },
          },
          required: ["query"],
        },
        behavior: Behavior.NON_BLOCKING,
      },
      {
        name: "lookup_customer",
        description:
          "Search and retrieve customer account history, past service notes, and equipment records from the trade portal without blocking speech.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: "The customer's full name.",
            },
            phone: {
              type: Type.STRING,
              description: "The customer's phone number.",
            },
            portal_url: {
              type: Type.STRING,
              description: "Optional custom URL for the customer portal.",
            },
          },
        },
        behavior: Behavior.NON_BLOCKING,
      },
      {
        name: "check_parts_portal",
        description:
          "Search supplier catalogs for part availability, warehouse inventory levels, contractor pricing, and estimated delivery dates.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            part_number: {
              type: Type.STRING,
              description: "The manufacturer or catalog part number.",
            },
            description: {
              type: Type.STRING,
              description: "Description or search query for the part or equipment.",
            },
            portal_url: {
              type: Type.STRING,
              description: "Optional custom URL for the parts supplier portal.",
            },
          },
        },
        behavior: Behavior.NON_BLOCKING,
      },
      {
        name: "mirror_dispatch_job",
        description:
          "Mirror and create a confirmed service appointment directly on the vertical dispatch board (Housecall Pro or ServiceTitan).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            customer_name: {
              type: Type.STRING,
              description: "Name of the customer.",
            },
            service_type: {
              type: Type.STRING,
              description: "Type of trade service (e.g., HVAC maintenance, leak repair).",
            },
            scheduled_time: {
              type: Type.STRING,
              description: "Confirmed date and arrival window.",
            },
            phone: {
              type: Type.STRING,
              description: "Customer contact phone number.",
            },
            address: {
              type: Type.STRING,
              description: "Service location street address.",
            },
            portal_url: {
              type: Type.STRING,
              description: "Optional dispatch portal URL.",
            },
          },
          required: ["customer_name", "service_type", "scheduled_time"],
        },
        behavior: Behavior.NON_BLOCKING,
      },
    ],
  },
];

export async function loadAgentRuntimeForGemini(
  agentId: string,
  userId: string,
) {
  const [agents, personalities, directives, knowledge] =
    await drizzle.transaction((tx) =>
      serialQueryBatch([
        tx
          .select({
            id: schema.agents.id,
            userId: schema.agents.userId,
            name: schema.agents.name,
            role: schema.agents.role,
            firstMessage: schema.agents.firstMessage,
            personalityVibe: schema.agents.personalityVibe,
            systemPromptOverride: schema.agents.systemPromptOverride,
            complianceMode: schema.agents.complianceMode,
            disallowedTopics: schema.agents.disallowedTopics,
            escalationKeywords: schema.agents.escalationKeywords,
            escalationPhone: schema.agents.escalationPhone,
            escalationEmail: schema.agents.escalationEmail,
            transferPhone: schema.agents.transferPhone,
            businessVariables: schema.agents.businessVariables,
            voiceProvider: schema.agents.voiceProvider,
            voiceId: schema.agents.voiceId,
            phoneVoiceId: schema.agents.phoneVoiceId,
            playbook: schema.agents.playbook,
          })
          .from(schema.agents)
          .where(
            and(
              eq(schema.agents.id, agentId),
              eq(schema.agents.userId, userId),
            ),
          )
          .limit(1),
        tx
          .select({ content: schema.personality.content })
          .from(schema.personality)
          .where(
            and(
              eq(schema.personality.agentId, agentId),
              eq(schema.personality.userId, userId),
            ),
          )
          .limit(1),
        tx
          .select({ content: schema.directives.content })
          .from(schema.directives)
          .where(
            and(
              eq(schema.directives.agentId, agentId),
              eq(schema.directives.userId, userId),
            ),
          )
          .orderBy(...DIRECTIVE_PROMPT_ORDER)
          .limit(40),
        tx
          .select({ content: schema.knowledge.content })
          .from(schema.knowledge)
          .where(
            and(
              eq(schema.knowledge.agentId, agentId),
              eq(schema.knowledge.userId, userId),
            ),
          )
          .orderBy(desc(schema.knowledge.createdAt))
          .limit(MAX_INITIAL_KNOWLEDGE_ITEMS),
      ]),
    );

  const agent = agents[0] as OpenAILiveInstructionAgent | undefined;
  if (!agent) throw AppError.fromHttpStatus(404, "Bot not found.");

  return {
    agent,
    personality: personalities[0]?.content || "",
    directives,
    knowledge,
  };
}

export async function prepareGeminiLiveSessionConfig(input: {
  userId: string;
  agentId: string;
  model?: GeminiLiveModel;
  voiceName?: string;
}) {
  const runtime = await loadAgentRuntimeForGemini(input.agentId, input.userId);
  const reviewRequired = isSavedRuntimeReviewRequired(
    runtime.personality,
    runtime.agent.role,
  );
  if (reviewRequired) {
    throw new AppError(
      409,
      "RUNTIME_REVIEW_REQUIRED",
      RUNTIME_REVIEW_REQUIRED_RESPONSE,
    );
  }

  const instructions = composeOpenAILiveInstructions(
    runtime.agent,
    runtime.personality,
    runtime.directives,
    runtime.knowledge,
  );

  const voice = resolveGeminiLiveVoice(
    input.voiceName ||
      runtime.agent.voiceId ||
      runtime.agent.phoneVoiceId ||
      "Zephyr",
  );

  const model = input.model || RESOLVED_GEMINI_LIVE_MODEL;

  const config: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: voice,
        },
      },
    },
    systemInstruction: {
      parts: [{ text: instructions }],
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    tools: reviewRequired ? [] : GEMINI_LIVE_TOOLS,
  };

  const greeting = reviewRequired
    ? RUNTIME_REVIEW_REQUIRED_GREETING
    : resolveAgentGreeting(runtime.agent, runtime.directives);

  return {
    model,
    voice,
    config,
    greeting,
    agent: runtime.agent,
  };
}

export async function runGeminiLiveTool(input: {
  userId: string;
  agentId: string;
  name: string;
  args: Record<string, unknown>;
}) {
  if (["lookup_customer", "check_parts_portal", "mirror_dispatch_job"].includes(input.name)) {
    const [owned] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(
        and(
          eq(schema.agents.id, input.agentId),
          eq(schema.agents.userId, input.userId),
        ),
      )
      .limit(1);

    if (!owned) throw AppError.fromHttpStatus(404, "Bot not found.");

    return {
      status: "queued",
      action: input.name,
      parameters: input.args,
      message: `Cloud browser task for ${input.name} accepted.`,
    };
  }

  if (input.name !== "search_agent_knowledge") {
    throw AppError.fromHttpStatus(400, `Unsupported live tool: ${input.name}`);
  }

  const query = typeof input.args.query === "string" ? input.args.query.trim().slice(0, 600) : "";
  if (!query) {
    throw AppError.fromHttpStatus(400, "A Training search query is required.");
  }

  const [owned] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(
      and(
        eq(schema.agents.id, input.agentId),
        eq(schema.agents.userId, input.userId),
      ),
    )
    .limit(1);

  if (!owned) throw AppError.fromHttpStatus(404, "Bot not found.");

  const words = knowledgeSearchWords(query);
  const matches = (
    await searchAgentKnowledge(drizzle, {
      userId: input.userId,
      agentId: input.agentId,
      query,
      limit: MAX_LIVE_KB_RESULTS,
    })
  ).map((match) => ({
    source: match.source,
    content: excerptAroundMatch(match.content, words, MAX_LIVE_KB_RESULT_CHARS),
  }));

  return matches.length
    ? { found: true, query, matches }
    : {
        found: false,
        query,
        matches: [],
        guidance:
          "No approved Training matched. Tell the caller you do not want to guess and offer a message or human follow-up.",
      };
}

export function getGeminiLiveVoiceStatus() {
  const configured = Boolean(process.env.GEMINI_API_KEY?.trim());
  return {
    configured,
    defaultProvider: "gemini_live" as const,
    provider: "gemini" as const,
    defaultModel: GEMINI_3_8_LIVE_MODEL,
    extendedThinkingModel: GEMINI_3_8_LIVE_EXTENDED_THINKING_MODEL,
    sessionMode: "bidirectional_pcm_websocket",
    transcriptionEnabled: true,
    phoneRuntimeProvider: "gemini_media_stream",
    fallbackProvider: "xai_sip",
  };
}
