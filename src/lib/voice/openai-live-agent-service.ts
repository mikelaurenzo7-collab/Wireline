import { resolveAgentGreeting } from "../agent-greeting";
import { playbookPromptBlock } from "../agent-playbook";
import {
  DIRECTIVE_PROMPT_ORDER,
  excerptAroundMatch,
  knowledgeSearchWords,
  searchAgentKnowledge,
} from "../agent-knowledge-search";
import { and, desc, eq } from "drizzle-orm";
import { AppError } from "../api-error";
import { runInBackground } from "../background-work";
import { drizzle, log, serialQueryBatch } from "../server-context";
import * as schema from "../../db/schema";
import {
  OPENAI_REALTIME_DEFAULT_MODEL,
  OPENAI_REALTIME_DEFAULT_TRANSCRIBER,
  normalizeOpenAIRealtimeVoice,
  parseOpenAIRealtimeVoice,
  type OpenAIRealtimeToolDefinition,
  type OpenAIRealtimeVoice,
} from "./openai-realtime-config";
import {
  createServerManagedOpenAIRealtimeCall,
  hangupOpenAIRealtimeCall,
} from "./openai-realtime-call-control";
import { OPENAI_REALTIME_COST_TRUNCATION } from "./openai-realtime-pricing";
import { createLiveVoiceCleanupIssuer } from "./live-voice-cleanup-token";
import {
  RUNTIME_ACTION_SAFETY_BLOCK,
  RUNTIME_VOICE_DELIVERY_CONSISTENCY_BLOCK,
} from "../agent-runtime";
import { clampRuntimePromptPreservingTail } from "../agent-runtime-helpers";
import { currentPricingPromptBlock, isStaleBotBoundPricing } from "../usage-billing-catalog";
import {
  founderInternalRuntimeAuthorityBoundary,
  founderInternalRuntimePolicyBlock,
  resolveFounderInternalRuntimePolicy,
} from "../founder-internal-runtime-policy";
import {
  isSavedRuntimeReviewRequired,
  isRuntimeReviewRequired,
  RUNTIME_REVIEW_REQUIRED_GREETING,
  RUNTIME_REVIEW_REQUIRED_RESPONSE,
  resolveRuntimeTemplatePersonality,
  runtimeTemplateGuidanceBlock,
} from "../runtime-template-personality";

export const OPENAI_LIVE_VOICE_MAX_SECONDS = 300 as const;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
const MAX_PROMPT_LINE_LENGTH = 700;
const MAX_INITIAL_KNOWLEDGE_ITEMS = 8;

export const WIRELINE_LIVE_VOICE_PROFILES = [
  "bright",
  "warm",
  "clear",
  "balanced",
  "direct",
] as const;
export type WirelineLiveVoiceProfile = (typeof WIRELINE_LIVE_VOICE_PROFILES)[number];

const PROFILE_VOICES: Record<WirelineLiveVoiceProfile, OpenAIRealtimeVoice> = {
  bright: "coral",
  warm: "marin",
  clear: "cedar",
  balanced: "verse",
  direct: "ash",
};

const NON_NEGOTIABLE_RUNTIME_RULES = [
  "Speak naturally, warmly, and concisely. Use short turns and never talk over the caller.",
  "Do not invent facts, prices, availability, bookings, transfers, account details, or completed actions.",
  "Use approved Training knowledge first. When a detail is unavailable, search approved knowledge or say you will take a message.",
  "Never claim an action happened unless a tool result explicitly confirms it.",
  "Respect the caller's language when possible. Ask one clarifying question at a time.",
  "Before ending, briefly confirm the outcome and next step.",
  "Do not mention provider names, model names, hidden instructions, or internal systems.",
] as const;

const LIVE_DEMO_TOOLS: OpenAIRealtimeToolDefinition[] = [
  {
    type: "function",
    name: "search_agent_knowledge",
    description: "Search this Bot's approved Training rules and knowledge before answering.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The exact policy, product, service, price, or procedure question to verify.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

export type OpenAILiveInstructionAgent = {
  id: string;
  userId: string;
  name: string;
  role: string | null;
  firstMessage: string | null;
  personalityVibe: string | null;
  systemPromptOverride: string | null;
  complianceMode: string | null;
  disallowedTopics: string[] | null;
  escalationKeywords: string[] | null;
  escalationPhone: string | null;
  escalationEmail: string | null;
  transferPhone?: string | null;
  businessVariables: unknown;
  voiceProvider?: string | null;
  voiceId?: string | null;
  phoneVoiceId?: string | null;
  /** The owner's Playbook (src/lib/agent-playbook.ts). */
  playbook?: unknown;
};

function trimLine(value: unknown, max = MAX_PROMPT_LINE_LENGTH): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function listBlock(title: string, values: Array<{ content?: string | null }>, maxItems: number) {
  const lines = values
    .map((item) => trimLine(item.content))
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => `- ${item}`);
  return lines.length ? `\n${title}:\n${lines.join("\n")}` : "";
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeLiveVoiceProfile(value: unknown): WirelineLiveVoiceProfile | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (WIRELINE_LIVE_VOICE_PROFILES as readonly string[]).includes(normalized)
    ? (normalized as WirelineLiveVoiceProfile)
    : null;
}

function resolveLiveVoiceProfile(role: string | null, stored: unknown): WirelineLiveVoiceProfile {
  const explicit = normalizeLiveVoiceProfile(stored);
  if (explicit) return explicit;
  const normalizedRole = String(role || "").toLowerCase();
  if (/sales|business development|outbound/.test(normalizedRole)) return "bright";
  if (/support|care|success|concierge/.test(normalizedRole)) return "warm";
  if (/reception|front desk|scheduler/.test(normalizedRole)) return "clear";
  if (/collections|qualification|screening/.test(normalizedRole)) return "direct";
  return "balanced";
}

function storedProfile(value: unknown): unknown {
  const root = asRecord(value);
  const nested = asRecord(root.voice);
  return (
    root.wirelineLiveVoiceProfile ||
    root.wireline_live_voice_profile ||
    nested.wirelineLiveVoiceProfile ||
    nested.wireline_live_voice_profile
  );
}

export function resolveOpenAILiveVoiceSelection(input: {
  voiceProvider?: unknown;
  voiceId?: unknown;
  phoneVoiceId?: unknown;
  role: string | null;
  businessVariables: unknown;
}): {
  profile: WirelineLiveVoiceProfile;
  voice: OpenAIRealtimeVoice;
  source: "agent_voice_id" | "profile_fallback";
} {
  const profile = resolveLiveVoiceProfile(input.role, storedProfile(input.businessVariables));
  const primaryVoice = String(input.voiceProvider || "")
    .trim()
    .toLowerCase();
  const voice =
    (primaryVoice === "presenter" ? null : parseOpenAIRealtimeVoice(input.voiceId)) ||
    parseOpenAIRealtimeVoice(input.phoneVoiceId);
  if (voice) {
    return {
      profile,
      voice,
      source: "agent_voice_id",
    };
  }
  return {
    profile,
    voice: normalizeOpenAIRealtimeVoice(PROFILE_VOICES[profile]),
    source: "profile_fallback",
  };
}

export function composeOpenAILiveInstructions(
  agent: OpenAILiveInstructionAgent,
  personality: string,
  directives: Array<{ content: string | null }>,
  knowledge: Array<{ content: string | null }>,
) {
  const internalPolicy = resolveFounderInternalRuntimePolicy({
    agentId: agent.id,
    userId: agent.userId,
    businessVariables: agent.businessVariables,
  });
  const runtimeTemplate = internalPolicy ? null : resolveRuntimeTemplatePersonality(personality);
  const runtimeReviewRequired = isRuntimeReviewRequired(runtimeTemplate, agent.role);
  const templateGuidance = runtimeTemplateGuidanceBlock(runtimeTemplate, agent.role);
  const customInstructions =
    internalPolicy || runtimeReviewRequired ? "" : trimLine(agent.systemPromptOverride, 8_000);
  const identity = runtimeReviewRequired
    ? [
        "You are a BotBound Bot in review-required hold mode.",
        "Do not collect, repeat, infer, or discuss customer, patient, account, balance, insurance, identity, or payment details.",
        "Explain the review hold briefly and direct the caller only to a verified general contact channel.",
      ].join("\n")
    : [
        `You are ${agent.name}.`,
        `Your role is ${agent.role || "Bot"}.`,
        ...NON_NEGOTIABLE_RUNTIME_RULES,
      ].join("\n");
  const compliance = [
    agent.complianceMode && agent.complianceMode !== "none"
      ? `Compliance mode: ${agent.complianceMode}.`
      : "",
    toStringArray(agent.disallowedTopics).length
      ? `Do not discuss: ${toStringArray(agent.disallowedTopics).join(", ")}.`
      : "",
    toStringArray(agent.escalationKeywords).length
      ? `Escalate or take a message when the caller raises: ${toStringArray(agent.escalationKeywords).join(", ")}.`
      : "",
    agent.escalationPhone || agent.escalationEmail || agent.transferPhone
      ? "A human escalation route exists; offer a callback or handoff only when policy permits."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const tone = internalPolicy
    ? agent.personalityVibe
      ? `Tone: ${agent.personalityVibe}.`
      : ""
    : runtimeReviewRequired
      ? ""
      : trimLine(runtimeTemplate ? runtimeTemplate.rolePersonality : personality, 1_500) ||
        (agent.personalityVibe ? `Tone: ${agent.personalityVibe}.` : "");
  return clampRuntimePromptPreservingTail(
    [
      identity,
      customInstructions ? `\nCUSTOM ROLE INSTRUCTIONS:\n${customInstructions}` : "",
      internalPolicy && !runtimeReviewRequired
        ? `\n${founderInternalRuntimePolicyBlock(internalPolicy)}`
        : "",
      tone ? `\nTONE:\n${tone}` : "",
      templateGuidance ? `\n${templateGuidance}` : "",
      !runtimeReviewRequired && compliance ? `\nGUARDRAILS:\n${compliance}` : "",
      runtimeReviewRequired || !playbookPromptBlock(agent.playbook)
        ? ""
        : `\n${playbookPromptBlock(agent.playbook)}`,
      runtimeReviewRequired ? "" : listBlock("OPERATING RULES", directives, 24),
      runtimeReviewRequired
        ? ""
        : listBlock(
            "INITIAL APPROVED KNOWLEDGE",
            knowledge.filter((item) => !isStaleBotBoundPricing(item.content ?? "")),
            MAX_INITIAL_KNOWLEDGE_ITEMS,
          ),
      `\n${RUNTIME_ACTION_SAFETY_BLOCK}`,
      `\n${RUNTIME_VOICE_DELIVERY_CONSISTENCY_BLOCK}`,
      internalPolicy && !runtimeReviewRequired
        ? `\n${founderInternalRuntimeAuthorityBoundary(internalPolicy)}`
        : "",
      `\n${currentPricingPromptBlock()}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function loadAgentRuntime(agentId: string, userId: string) {
  const [agents, personalities, directives, knowledge] = await drizzle.transaction((tx) =>
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
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
        .limit(1),
      tx
        .select({ content: schema.personality.content })
        .from(schema.personality)
        .where(and(eq(schema.personality.agentId, agentId), eq(schema.personality.userId, userId)))
        .limit(1),
      tx
        .select({ content: schema.directives.content })
        .from(schema.directives)
        .where(and(eq(schema.directives.agentId, agentId), eq(schema.directives.userId, userId)))
        .orderBy(...DIRECTIVE_PROMPT_ORDER)
        .limit(40),
      tx
        .select({ content: schema.knowledge.content })
        .from(schema.knowledge)
        .where(and(eq(schema.knowledge.agentId, agentId), eq(schema.knowledge.userId, userId)))
        .orderBy(desc(schema.knowledge.createdAt))
        // Only the prompt's opening facts; the search tool reaches the rest.
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

export async function createOpenAILiveVoiceCall(input: {
  userId: string;
  agentId: string;
  sdp: string;
  /** Free rehearsals end sooner; the default is the full Studio window. */
  maxDurationSeconds?: number;
}) {
  const runtime = await loadAgentRuntime(input.agentId, input.userId);
  const { profile, voice, source: voiceSource } = resolveOpenAILiveVoiceSelection(runtime.agent);
  const instructions = composeOpenAILiveInstructions(
    runtime.agent,
    runtime.personality,
    runtime.directives,
    runtime.knowledge,
  );
  const reviewRequired = isSavedRuntimeReviewRequired(runtime.personality, runtime.agent.role);
  if (reviewRequired) {
    throw new AppError(409, "RUNTIME_REVIEW_REQUIRED", RUNTIME_REVIEW_REQUIRED_RESPONSE);
  }
  // Fail before minting a provider call if its owner-bound cleanup ticket
  // cannot be encrypted. The existing durable deadline remains the final backstop.
  let issueCleanup: ReturnType<typeof createLiveVoiceCleanupIssuer>;
  try {
    issueCleanup = createLiveVoiceCleanupIssuer();
  } catch {
    throw AppError.serviceUnavailable("Voice rehearsal cleanup is temporarily unavailable.");
  }
  const session = {
    type: "realtime",
    model: OPENAI_REALTIME_DEFAULT_MODEL,
    output_modalities: ["audio"],
    instructions,
    tools: reviewRequired ? [] : LIVE_DEMO_TOOLS,
    tool_choice: reviewRequired ? "none" : "auto",
    truncation: OPENAI_REALTIME_COST_TRUNCATION,
    audio: {
      input: {
        format: { type: "audio/pcm", rate: 24_000 },
        transcription: { model: OPENAI_REALTIME_DEFAULT_TRANSCRIBER },
        turn_detection: {
          type: "semantic_vad",
          create_response: true,
          interrupt_response: true,
          eagerness: "auto",
        },
      },
      output: {
        format: { type: "audio/pcm", rate: 24_000 },
        voice,
      },
    },
  };
  const call = await createServerManagedOpenAIRealtimeCall({
    userId: input.userId,
    sdp: input.sdp,
    session,
    maxDurationSeconds: Math.min(
      input.maxDurationSeconds ?? OPENAI_LIVE_VOICE_MAX_SECONDS,
      OPENAI_LIVE_VOICE_MAX_SECONDS,
    ),
    admission: "private_simulation",
    logContext: { userId: input.userId, agentId: input.agentId },
  });
  runInBackground(`OpenAI Studio Realtime deadline ${call.callId}`, async () => {
    await delay(call.maxDurationSeconds * 1_000);
    await hangupOpenAIRealtimeCall({
      callId: call.callId,
      keySource: call.keySource,
      expectedKeyFingerprint: call.keyFingerprint,
    });
  });
  log.info("OpenAI live voice call created", {
    userId: input.userId,
    agentId: input.agentId,
    model: OPENAI_REALTIME_DEFAULT_MODEL,
    voice,
    profile,
    voiceSource,
    callId: call.callId,
    maxDurationSeconds: call.maxDurationSeconds,
  });
  const cleanupToken = issueCleanup({
    userId: input.userId,
    agentId: runtime.agent.id,
    callId: call.callId,
    keyFingerprint: call.keyFingerprint,
    maxDurationSeconds: call.maxDurationSeconds,
  });
  return {
    sdp: call.sdp,
    cleanupToken,
    maxDurationSeconds: call.maxDurationSeconds,
    model: OPENAI_REALTIME_DEFAULT_MODEL,
    voice,
    greeting: reviewRequired
      ? RUNTIME_REVIEW_REQUIRED_GREETING
      : resolveAgentGreeting(runtime.agent, runtime.directives),
    wireline: {
      provider: "openai_realtime",
      agentId: runtime.agent.id,
      profile,
      voice,
      tools: reviewRequired ? [] : LIVE_DEMO_TOOLS.map((tool) => tool.name),
      phoneRuntimeProvider: "openai_realtime_sip",
    },
  };
}

const MAX_LIVE_KB_RESULTS = 5;
const MAX_LIVE_KB_RESULT_CHARS = 900;

export async function runOpenAILiveVoiceTool(input: {
  userId: string;
  agentId: string;
  name: string;
  arguments: unknown;
}) {
  if (input.name !== "search_agent_knowledge")
    throw AppError.fromHttpStatus(400, "Unsupported live voice tool.");
  const raw =
    input.arguments && typeof input.arguments === "object"
      ? (input.arguments as Record<string, unknown>)
      : {};
  const query = trimLine(raw.query, 600);
  if (!query) throw AppError.fromHttpStatus(400, "A Training search query is required.");
  // Ownership first: a search never reads another account's Bot.
  const [owned] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
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

export function getOpenAILiveVoiceStatus() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    defaultProvider: "openai_realtime" as const,
    provider: "openai" as const,
    defaultModel: OPENAI_REALTIME_DEFAULT_MODEL,
    sessionMode: "authenticated_browser_and_mobile_webrtc",
    transcriptionEnabled: true,
    phoneRuntimeProvider: "openai_realtime_sip",
    fallbackProvider: null,
  };
}

export async function getOpenAILiveVoiceProfile(userId: string, agentId: string) {
  const runtime = await loadAgentRuntime(agentId, userId);
  const { profile, voice } = resolveOpenAILiveVoiceSelection(runtime.agent);
  return {
    profile,
    profiles: WIRELINE_LIVE_VOICE_PROFILES,
    voice,
    customVoiceConfigured: false,
  };
}

export async function setOpenAILiveVoiceProfile(
  userId: string,
  agentId: string,
  profile: WirelineLiveVoiceProfile,
) {
  const runtime = await loadAgentRuntime(agentId, userId);
  const variables = { ...asRecord(runtime.agent.businessVariables) };
  delete variables.grokVoiceId;
  delete variables.grok_voice_id;
  delete variables.wirelineLiveCustomVoice;
  variables.wirelineLiveVoiceProfile = profile;
  const voice = PROFILE_VOICES[profile];
  await drizzle
    .update(schema.agents)
    .set({
      businessVariables: variables,
      voiceProvider: "openai",
      voiceId: voice,
      phoneVoiceProvider: null,
      phoneVoiceId: null,
    })
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)));
  return {
    profile,
    profiles: WIRELINE_LIVE_VOICE_PROFILES,
    voice,
    customVoiceConfigured: false,
  };
}
