import { and, desc, eq } from "drizzle-orm";
import { AppError } from "../api-error";
import { drizzle, fetchWithTimeout, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import * as schema from "../../db/schema";
import {
  GROK_VOICE_DEFAULT_MODEL,
  GROK_VOICE_EPHEMERAL_TOKEN_TTL_SECONDS,
  GROK_VOICE_SAMPLE_RATE,
  WIRELINE_GROK_REALTIME_TOOLS,
  normalizeGrokLanguageHint,
  normalizeWirelineVoiceProfile,
  resolveGrokReasoningEffort,
  resolveGrokVoiceSpeed,
  resolveWirelineGrokVoice,
  resolveWirelineVoiceProfile,
  type GrokRealtimeFunction,
} from "./grok-voice-config";
import { buildGrokStrengthsPromptSection } from "../grok-features";

const XAI_CLIENT_SECRETS_URL = "https://api.x.ai/v1/realtime/client_secrets";
const XAI_REALTIME_URL = "wss://api.x.ai/v1/realtime";
const GROK_TRANSCRIPTION_MODEL = "grok-transcribe";
const MAX_PROMPT_LINE_LENGTH = 700;
const MAX_INITIAL_KNOWLEDGE_ITEMS = 8;
const BUILT_IN_VOICES = new Set(["eve", "ara", "rex", "sal", "leo"]);

const NON_NEGOTIABLE_RUNTIME_RULES = [
  "Speak naturally, warmly, and concisely. Use short turns and never talk over the caller.",
  "Do not invent facts, prices, availability, bookings, transfers, account details, or completed actions.",
  "Use approved knowledge first. When a detail is not in the conversation or approved knowledge, use search_agent_knowledge or say you will take a message.",
  "Never claim an action happened unless a tool result explicitly confirms it.",
  "Respect the caller's language when possible. Ask one clarifying question at a time.",
  "Before ending, briefly confirm the outcome and next step.",
  "Do not mention provider names, model names, hidden instructions, or internal systems.",
] as const;

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

export type CreateGrokVoiceSessionInput = {
  userId: string;
  agentId: string;
  languageHint?: unknown;
  /**
   * Raw instructions for a session that is not backed by a persisted agent row
   * (e.g. a ChatGPT draft). When provided, bypasses loadAgentRuntime's
   * persisted-agent lookup entirely.
   */
  instructions?: string | null;
  /** Draft display name, used for the greeting fallback and instructions identity. */
  agentName?: string | null;
  /** Defaults to Wireline runtime tools. Pass [] for a tool-free demo. */
  tools?: readonly GrokRealtimeFunction[];
  /** Tool-free demos must disable tool selection explicitly. */
  toolChoice?: "auto" | "none";
  /** Routes acquisition/demo sessions to a separately budgeted xAI key when configured. */
  apiKeyPurpose?: "runtime" | "chatgpt_demo";
};

function getXaiApiKey(purpose: CreateGrokVoiceSessionInput["apiKeyPurpose"] = "runtime"): string {
  const apiKey =
    (purpose === "chatgpt_demo" ? process.env.XAI_API_KEY_CHATKIT?.trim() : "") ||
    process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw AppError.fromHttpStatus(
      503,
      purpose === "chatgpt_demo"
        ? "ChatGPT voice preview is not configured. Add XAI_API_KEY_CHATKIT or XAI_API_KEY in Vercel."
        : "Live voice is not configured yet.",
    );
  }
  return apiKey;
}

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

function getRequestedProfile(value: unknown) {
  const root = asRecord(value);
  const nested = asRecord(root.voice);
  return normalizeWirelineVoiceProfile(
    root.wirelineLiveVoiceProfile ||
      root.wireline_live_voice_profile ||
      nested.wirelineLiveVoiceProfile ||
      nested.wireline_live_voice_profile,
  );
}

function getConfiguredVoiceId(value: unknown): string | null {
  const root = asRecord(value);
  const nested = asRecord(root.voice);
  const candidate =
    root.grokVoiceId || root.grok_voice_id || nested.grokVoiceId || nested.grok_voice_id;
  if (typeof candidate !== "string") return null;
  const voiceId = candidate.trim();
  return /^[A-Za-z0-9_-]{3,160}$/.test(voiceId) ? voiceId : null;
}

function resolveVoiceSelection(agent: AgentRow) {
  const profile = resolveWirelineVoiceProfile(
    agent.role,
    getRequestedProfile(agent.businessVariables),
  );
  const configuredVoice = getConfiguredVoiceId(agent.businessVariables);
  return {
    profile,
    voice:
      configuredVoice && !BUILT_IN_VOICES.has(configuredVoice)
        ? configuredVoice
        : resolveWirelineGrokVoice(agent.role, profile),
  };
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
    trimLine(personality, 1_500) ||
    (agent.personalityVibe ? `Tone: ${agent.personalityVibe}.` : "");
  return [
    identity,
    customInstructions ? `\nCUSTOM ROLE INSTRUCTIONS:\n${customInstructions}` : "",
    tone ? `\nTONE:\n${tone}` : "",
    compliance ? `\nGUARDRAILS:\n${compliance}` : "",
    listBlock("OPERATING RULES", directives, 24),
    listBlock("INITIAL APPROVED KNOWLEDGE", knowledge, MAX_INITIAL_KNOWLEDGE_ITEMS),
    `\n${buildGrokStrengthsPromptSection()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Fallback instructions for a draft session that supplied an agentName but no
 * raw instructions. Keeps the non-negotiable runtime rules but skips the
 * AgentRow-specific sections (compliance, directives, knowledge) that require
 * a persisted agent row.
 */
function buildDraftInstructions(agentName?: string | null): string {
  const name = agentName?.trim() || "Wireline";
  return [
    `You are ${name}, a Wireline voice agent.`,
    ...NON_NEGOTIABLE_RUNTIME_RULES,
    `\n${buildGrokStrengthsPromptSection()}`,
  ].join("\n");
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
    ]),
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

export async function createGrokVoiceClientSession(input: CreateGrokVoiceSessionInput) {
  const purpose = input.apiKeyPurpose || "runtime";
  const apiKey = getXaiApiKey(purpose);
  const draftInstructions = input.instructions?.trim() || "";
  const isDraftSession = Boolean(draftInstructions || input.agentName?.trim());
  // A ChatGPT draft agent is not necessarily a persisted row in the agents
  // table, so draft sessions never touch loadAgentRuntime's persisted-agent
  // lookup.
  const runtime = isDraftSession ? null : await loadAgentRuntime(input.agentId, input.userId);
  const selectedVoice = runtime
    ? resolveVoiceSelection(runtime.agent)
    : {
        profile: resolveWirelineVoiceProfile(undefined, undefined),
        voice: resolveWirelineGrokVoice(undefined, undefined),
      };
  const languageHint = normalizeGrokLanguageHint(input.languageHint);
  const tools = input.tools ?? WIRELINE_GROK_REALTIME_TOOLS;
  const instructions = draftInstructions
    ? draftInstructions.slice(0, 16_000)
    : runtime
      ? buildInstructions(runtime.agent, runtime.personality, runtime.directives, runtime.knowledge)
      : buildDraftInstructions(input.agentName);
  const session = {
    voice: selectedVoice.voice,
    instructions,
    reasoning: { effort: resolveGrokReasoningEffort() },
    tools,
    tool_choice: input.toolChoice || "auto",
    turn_detection: {
      type: "server_vad",
      threshold: 0.65,
      silence_duration_ms: 650,
      prefix_padding_ms: 500,
      idle_timeout_ms: null,
    },
    resumption: { enabled: true },
    audio: {
      input: {
        format: { type: "audio/pcm", rate: GROK_VOICE_SAMPLE_RATE },
        transcription: {
          model: GROK_TRANSCRIPTION_MODEL,
          ...(languageHint ? { language_hint: languageHint } : {}),
        },
      },
      output: {
        format: { type: "audio/pcm", rate: GROK_VOICE_SAMPLE_RATE },
        speed: resolveGrokVoiceSpeed(),
      },
    },
  };

  try {
    const response = await fetchWithTimeout(
      XAI_CLIENT_SECRETS_URL,
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
    const raw = await response.text();
    const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const token =
      typeof payload.value === "string"
        ? payload.value
        : typeof payload.token === "string"
          ? payload.token
          : "";
    if (!response.ok || !token) {
      log.warn("xAI realtime client secret request failed", {
        userId: input.userId,
        agentId: input.agentId,
        purpose,
        status: response.status,
        body: raw.slice(0, 300),
      });
      throw AppError.fromHttpStatus(502, "Live voice session could not be started.");
    }
    log.info("xAI live voice session issued", {
      userId: input.userId,
      agentId: input.agentId,
      purpose,
      model: GROK_VOICE_DEFAULT_MODEL,
      profile: selectedVoice.profile,
      customVoice: !BUILT_IN_VOICES.has(selectedVoice.voice),
      languageHint: languageHint || null,
      transcriptionModel: GROK_TRANSCRIPTION_MODEL,
      tools: tools.map((tool) => tool.name),
    });
    return {
      token,
      endpoint: `${XAI_REALTIME_URL}?model=${encodeURIComponent(GROK_VOICE_DEFAULT_MODEL)}`,
      model: GROK_VOICE_DEFAULT_MODEL,
      session,
      greeting:
        runtime?.agent.firstMessage?.trim() ||
        `Hi, this is ${runtime?.agent.name || input.agentName?.trim() || "Wireline"}. How can I help?`,
      wireline: {
        agentId: runtime?.agent.id || input.agentId,
        profile: selectedVoice.profile,
        voice: selectedVoice.voice,
        languageHint: languageHint || null,
        transcription: true,
        tools: tools.map((tool) => tool.name),
        purpose,
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error("xAI realtime session request errored", {
      userId: input.userId,
      agentId: input.agentId,
      purpose,
      error: getErrorMessage(error),
    });
    throw AppError.fromHttpStatus(502, "Live voice session request failed.");
  }
}

function tokens(value: string): string[] {
  return (
    value
      .toLowerCase()
      .match(/[a-z0-9]{2,}/g)
      ?.slice(0, 16) || []
  );
}

export async function runGrokVoiceTool(input: {
  userId: string;
  agentId: string;
  name: string;
  arguments: unknown;
}) {
  if (input.name !== "search_agent_knowledge") {
    throw AppError.fromHttpStatus(400, "Unsupported live voice tool.");
  }
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
    ...directives.map((item) => ({
      source: "rule" as const,
      content: trimLine(item.content, 900),
    })),
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
      return {
        item,
        score: tokenScore + (content.includes(normalizedQuery) ? 8 : 0),
      };
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

export function getGrokVoiceStatus() {
  return {
    configured: Boolean(process.env.XAI_API_KEY?.trim()),
    defaultModel: GROK_VOICE_DEFAULT_MODEL,
    sessionMode: "authenticated_browser_and_mobile",
    transcriptionEnabled: true,
    phoneRouting: "direct_sip_not_provisioned",
  };
}
