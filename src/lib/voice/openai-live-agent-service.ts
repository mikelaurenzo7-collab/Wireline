import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { AppError } from "../api-error";
import { drizzle, fetchWithTimeout, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import * as schema from "../../db/schema";
import {
  OPENAI_REALTIME_DEFAULT_MODEL,
  OPENAI_REALTIME_DEFAULT_TRANSCRIBER,
  normalizeOpenAIRealtimeVoice,
  type OpenAIRealtimeToolDefinition,
  type OpenAIRealtimeVoice,
} from "./openai-realtime-config";

const OPENAI_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
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
    description: "Search this agent's approved Training rules and knowledge before answering.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The exact policy, product, service, price, or procedure question to verify.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

type AgentRow = {
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
  businessVariables: unknown;
};

type Snippet = { source: "rule" | "knowledge"; content: string };

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
  const normalized = String(value || "").trim().toLowerCase();
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

function buildInstructions(
  agent: AgentRow,
  personality: string,
  directives: Array<{ content: string | null }>,
  knowledge: Array<{ content: string | null }>,
) {
  const customInstructions = trimLine(agent.systemPromptOverride, 8_000);
  const identity = [
    `You are ${agent.name}, a Wireline voice agent.`,
    `Your role is ${agent.role || "agent"}.`,
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
    agent.escalationPhone || agent.escalationEmail
      ? "A human escalation route exists; offer a callback or handoff only when policy permits."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const tone =
    trimLine(personality, 1_500) || (agent.personalityVibe ? `Tone: ${agent.personalityVibe}.` : "");
  return [
    identity,
    customInstructions ? `\nCUSTOM ROLE INSTRUCTIONS:\n${customInstructions}` : "",
    tone ? `\nTONE:\n${tone}` : "",
    compliance ? `\nGUARDRAILS:\n${compliance}` : "",
    listBlock("OPERATING RULES", directives, 24),
    listBlock("INITIAL APPROVED KNOWLEDGE", knowledge, MAX_INITIAL_KNOWLEDGE_ITEMS),
  ]
    .filter(Boolean)
    .join("\n");
}

async function loadAgentRuntime(agentId: string, userId: string) {
  const [agents, personalities, directives, knowledge] = await drizzle.transaction((tx) =>
    Promise.all([
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
        businessVariables: schema.agents.businessVariables,
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
      .orderBy(desc(schema.directives.priority))
      .limit(40),
    tx
      .select({ content: schema.knowledge.content })
      .from(schema.knowledge)
      .where(and(eq(schema.knowledge.agentId, agentId), eq(schema.knowledge.userId, userId)))
      .orderBy(desc(schema.knowledge.createdAt))
      .limit(80),
  ])
  );
  const agent = agents[0] as AgentRow | undefined;
  if (!agent) throw AppError.fromHttpStatus(404, "Agent not found.");
  return {
    agent,
    personality: personalities[0]?.content || "",
    directives,
    knowledge,
  };
}

function safetyIdentifierForUser(userId: string): string {
  return createHash("sha256").update(`wireline:${userId}`).digest("hex");
}

export async function createOpenAILiveVoiceCall(input: {
  userId: string;
  agentId: string;
  sdp: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw AppError.fromHttpStatus(503, "Live voice is not configured yet.");
  const sdp = input.sdp.trim();
  if (sdp.length < 100 || sdp.length > 60_000 || !sdp.startsWith("v="))
    throw AppError.fromHttpStatus(400, "A valid WebRTC offer is required.");

  const runtime = await loadAgentRuntime(input.agentId, input.userId);
  const profile = resolveLiveVoiceProfile(
    runtime.agent.role,
    storedProfile(runtime.agent.businessVariables),
  );
  const voice = normalizeOpenAIRealtimeVoice(PROFILE_VOICES[profile]);
  const instructions = buildInstructions(
    runtime.agent,
    runtime.personality,
    runtime.directives,
    runtime.knowledge,
  );
  const session = {
    type: "realtime",
    model: OPENAI_REALTIME_DEFAULT_MODEL,
    output_modalities: ["audio"],
    instructions,
    tools: LIVE_DEMO_TOOLS,
    tool_choice: "auto",
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
  // GA Realtime WebRTC expects an ephemeral client secret first, then an
  // application/sdp offer against /v1/realtime/calls. Multipart FormData with
  // the platform key is rejected by the current API shape.
  try {
    const secretResponse = await fetchWithTimeout(
      OPENAI_REALTIME_CLIENT_SECRETS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyIdentifierForUser(input.userId),
        },
        body: JSON.stringify({ session }),
      },
      15_000,
    );
    const secretText = await secretResponse.text();
    let secretPayload: { value?: string } = {};
    if (secretText) {
      try {
        secretPayload = JSON.parse(secretText) as { value?: string };
      } catch {
        secretPayload = {};
      }
    }
    const ephemeralKey = secretPayload.value?.trim() || "";
    if (!secretResponse.ok || !ephemeralKey) {
      log.warn("OpenAI Realtime client secret mint failed", {
        userId: input.userId,
        agentId: input.agentId,
        status: secretResponse.status,
        body: secretText.slice(0, 500),
      });
      throw AppError.fromHttpStatus(
        secretResponse.status || 502,
        "Live voice session could not be created. Check OpenAI model access and billing.",
      );
    }

    const response = await fetchWithTimeout(
      OPENAI_REALTIME_CALLS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
          "OpenAI-Safety-Identifier": safetyIdentifierForUser(input.userId),
        },
        body: sdp,
      },
      20_000,
    );
    const answer = await response.text();
    if (!response.ok || !answer.startsWith("v=")) {
      log.warn("OpenAI Realtime WebRTC call creation failed", {
        userId: input.userId,
        agentId: input.agentId,
        status: response.status,
        body: answer.slice(0, 500),
      });
      throw AppError.fromHttpStatus(
        response.status || 502,
        "Live voice session could not be created. Check OpenAI model access and billing.",
      );
    }
    const location = response.headers.get("location") || "";
    const callId = location.split("/").filter(Boolean).pop() || null;
    log.info("OpenAI live voice call created", {
      userId: input.userId,
      agentId: input.agentId,
      model: OPENAI_REALTIME_DEFAULT_MODEL,
      voice,
      profile,
      callId,
    });
    return {
      sdp: answer,
      callId,
      model: OPENAI_REALTIME_DEFAULT_MODEL,
      voice,
      greeting:
        runtime.agent.firstMessage?.trim() ||
        `Hi, this is ${runtime.agent.name}. How can I help?`,
      wireline: {
        provider: "openai_realtime",
        agentId: runtime.agent.id,
        profile,
        voice,
        tools: LIVE_DEMO_TOOLS.map((tool) => tool.name),
        phoneDemoProvider: "vapi",
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error("OpenAI Realtime WebRTC signaling failed", {
      userId: input.userId,
      agentId: input.agentId,
      error: getErrorMessage(error),
    });
    throw AppError.fromHttpStatus(502, "Live voice session request failed.");
  }
}

function tokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]{2,}/g)?.slice(0, 16) || [];
}

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
  const { directives, knowledge } = await loadAgentRuntime(input.agentId, input.userId);
  const normalizedQuery = query.toLowerCase();
  const queryTokens = tokens(query);
  const snippets: Snippet[] = [
    ...directives.map((item) => ({ source: "rule" as const, content: trimLine(item.content, 900) })),
    ...knowledge.map((item) => ({
      source: "knowledge" as const,
      content: trimLine(item.content, 900),
    })),
  ].filter((item) => item.content);
  const matches = snippets
    .map((item) => {
      const content = item.content.toLowerCase();
      const tokenScore = queryTokens.reduce(
        (score, token) => score + (content.includes(token) ? 1 : 0),
        0,
      );
      return { item, score: tokenScore + (content.includes(normalizedQuery) ? 8 : 0) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => row.item);
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
    defaultModel: OPENAI_REALTIME_DEFAULT_MODEL,
    sessionMode: "authenticated_browser_and_mobile_webrtc",
    transcriptionEnabled: true,
    phoneDemoProvider: "vapi",
  };
}

export async function getOpenAILiveVoiceProfile(userId: string, agentId: string) {
  const runtime = await loadAgentRuntime(agentId, userId);
  const profile = resolveLiveVoiceProfile(runtime.agent.role, storedProfile(runtime.agent.businessVariables));
  return {
    profile,
    profiles: WIRELINE_LIVE_VOICE_PROFILES,
    voice: PROFILE_VOICES[profile],
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
  await drizzle
    .update(schema.agents)
    .set({ businessVariables: variables })
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)));
  return {
    profile,
    profiles: WIRELINE_LIVE_VOICE_PROFILES,
    voice: PROFILE_VOICES[profile],
    customVoiceConfigured: false,
  };
}
