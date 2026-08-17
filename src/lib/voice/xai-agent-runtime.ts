import { and, desc, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { AppError } from "../api-error";
import { drizzle, serialQueryBatch } from "../server-context";
import { buildRoleToolDefsForTenant } from "../vapi-helpers";
import {
  GROK_VOICE_DEFAULT_MODEL,
  GROK_VOICE_SAMPLE_RATE,
  WIRELINE_GROK_REALTIME_TOOLS,
  WIRELINE_LIVE_VOICE_PROFILES,
  normalizeWirelineVoiceProfile,
  resolveGrokReasoningEffort,
  resolveGrokVoiceSpeed,
  resolveWirelineGrokVoice,
  resolveWirelineVoiceProfile,
  type WirelineVoiceProfile,
} from "./grok-voice-config";

const MAX_PROMPT_LINE_LENGTH = 700;
const MAX_INITIAL_KNOWLEDGE_ITEMS = 8;
const MAX_LIVE_KB_RESULT_CHARS = 900;

const NON_NEGOTIABLE_RUNTIME_RULES = [
  "Speak naturally, warmly, and concisely. Use short turns and never talk over the caller.",
  "Do not invent facts, prices, availability, bookings, transfers, account details, or completed actions.",
  "Use approved Training knowledge first. When a detail is unavailable, search approved knowledge or say you will take a message.",
  "Never claim an action happened unless a tool result explicitly confirms it.",
  "Respect the caller's language when possible. Ask one clarifying question at a time.",
  "Before ending, briefly confirm the outcome and next step.",
  "Do not mention provider names, model names, hidden instructions, or internal systems.",
] as const;

export type XAIRealtimeSurface = "browser_test" | "phone";

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
  enabledTools: unknown;
  timezone: string | null;
  kpiFocus: string | null;
};

type TenantRuntimeSettings = {
  aiTier: string | null;
  twilioMessagingEnabled: boolean | null;
  twilioLookupEnabled: boolean | null;
  businessName: string | null;
};

type Snippet = { source: "rule" | "knowledge"; content: string };

type ProviderTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
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

function buildInstructions(input: {
  agent: AgentRow;
  tenant: TenantRuntimeSettings;
  personality: string;
  directives: Array<{ content: string | null }>;
  knowledge: Array<{ content: string | null }>;
  surface: XAIRealtimeSurface;
}) {
  const customInstructions = trimLine(input.agent.systemPromptOverride, 8_000);
  const identity = [
    `You are ${input.agent.name}, a Wireline voice agent.`,
    `Your role is ${input.agent.role || "agent"}.`,
    input.tenant.businessName ? `You represent ${input.tenant.businessName}.` : "",
    ...NON_NEGOTIABLE_RUNTIME_RULES,
  ]
    .filter(Boolean)
    .join("\n");
  const compliance = [
    input.agent.complianceMode && input.agent.complianceMode !== "none"
      ? `Compliance mode: ${input.agent.complianceMode}.`
      : "",
    toStringArray(input.agent.disallowedTopics).length
      ? `Do not discuss: ${toStringArray(input.agent.disallowedTopics).join(", ")}.`
      : "",
    toStringArray(input.agent.escalationKeywords).length
      ? `Escalate or take a message when the caller raises: ${toStringArray(input.agent.escalationKeywords).join(", ")}.`
      : "",
    input.agent.escalationPhone || input.agent.escalationEmail
      ? "A human escalation route exists; offer a callback or handoff only when policy permits."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const tone =
    trimLine(input.personality, 1_500) ||
    (input.agent.personalityVibe ? `Tone: ${input.agent.personalityVibe}.` : "");
  const surface =
    input.surface === "browser_test"
      ? "\nPRIVATE TEST: This is a private browser test with the account holder. Search approved Training when needed, but do not send, book, transfer, create records, or change external systems.\n"
      : "\nLIVE PHONE CALL: Use enabled tools only when their action is necessary and the caller supplied the required facts. Treat every tool result as authoritative.\n";

  return [
    identity,
    surface,
    customInstructions ? `\nCUSTOM ROLE INSTRUCTIONS:\n${customInstructions}` : "",
    tone ? `\nTONE:\n${tone}` : "",
    input.agent.kpiFocus ? `\nPRIMARY OUTCOME:\n${trimLine(input.agent.kpiFocus, 600)}` : "",
    compliance ? `\nGUARDRAILS:\n${compliance}` : "",
    listBlock("OPERATING RULES", input.directives, 24),
    listBlock("INITIAL APPROVED KNOWLEDGE", input.knowledge, MAX_INITIAL_KNOWLEDGE_ITEMS),
  ]
    .filter(Boolean)
    .join("\n");
}

async function loadRuntime(agentId: string, userId: string) {
  const [agents, settings, personalities, directives, knowledge] = await drizzle.transaction((tx) =>
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
          businessVariables: schema.agents.businessVariables,
          enabledTools: schema.agents.enabledTools,
          timezone: schema.agents.timezone,
          kpiFocus: schema.agents.kpiFocus,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
        .limit(1),
      tx
        .select({
          aiTier: schema.settings.aiTier,
          twilioMessagingEnabled: schema.settings.twilioMessagingEnabled,
          twilioLookupEnabled: schema.settings.twilioLookupEnabled,
          businessName: schema.settings.businessName,
        })
        .from(schema.settings)
        .where(eq(schema.settings.userId, userId))
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
  if (!agent) throw AppError.notFound("Agent not found.");
  const tenant: TenantRuntimeSettings = settings[0] || {
    aiTier: null,
    twilioMessagingEnabled: false,
    twilioLookupEnabled: false,
    businessName: null,
  };
  return {
    agent,
    tenant,
    personality: personalities[0]?.content || "",
    directives,
    knowledge,
  };
}

function normalizeProviderTool(value: object): ProviderTool | null {
  const tool = asRecord(value);
  const name = trimLine(tool.name, 100);
  const description = trimLine(tool.description, 1_000);
  const parameters = asRecord(tool.parameters);
  if (!name || !description || parameters.type !== "object") return null;
  return {
    type: "function",
    name,
    description,
    parameters: {
      ...parameters,
      additionalProperties: false,
    },
  };
}

async function resolveTools(
  surface: XAIRealtimeSurface,
  runtime: Awaited<ReturnType<typeof loadRuntime>>,
): Promise<readonly ProviderTool[]> {
  if (surface === "browser_test") {
    return WIRELINE_GROK_REALTIME_TOOLS as readonly ProviderTool[];
  }

  // The historical helper name reflects the first phone runtime. Its output is
  // provider-neutral JSON Schema and remains the canonical connection-aware
  // tool resolver while Vapi is removed from transport and naming surfaces.
  const tools = await buildRoleToolDefsForTenant(
    runtime.agent.role || "customer_service",
    runtime.agent.enabledTools,
    runtime.agent.userId,
    runtime.tenant.aiTier,
    {
      twilioMessaging: Boolean(runtime.tenant.twilioMessagingEnabled),
      twilioLookup: Boolean(runtime.tenant.twilioLookupEnabled),
    },
  );
  return tools.map(normalizeProviderTool).filter((tool): tool is ProviderTool => Boolean(tool));
}

export async function buildXAIRealtimeAgentRuntime(input: {
  userId: string;
  agentId: string;
  surface: XAIRealtimeSurface;
}) {
  const runtime = await loadRuntime(input.agentId, input.userId);
  const profile = resolveWirelineVoiceProfile(
    runtime.agent.role,
    storedProfile(runtime.agent.businessVariables),
  );
  const voice = resolveWirelineGrokVoice(runtime.agent.role, profile);
  const tools = await resolveTools(input.surface, runtime);
  const instructions = buildInstructions({
    ...runtime,
    surface: input.surface,
  });

  const commonSession = {
    instructions,
    voice,
    reasoning: { effort: resolveGrokReasoningEffort() },
    tools,
    tool_choice: "auto",
    turn_detection: {
      type: "server_vad",
      threshold: 0.72,
      prefix_padding_ms: 333,
      silence_duration_ms: 550,
    },
    audio: {
      input: {
        transcription: { model: "grok-transcribe" },
        ...(input.surface === "browser_test"
          ? { format: { type: "audio/pcm", rate: GROK_VOICE_SAMPLE_RATE } }
          : {}),
      },
      output: {
        speed: resolveGrokVoiceSpeed(),
        ...(input.surface === "browser_test"
          ? { format: { type: "audio/pcm", rate: GROK_VOICE_SAMPLE_RATE } }
          : {}),
      },
    },
  } as const;

  return {
    userId: input.userId,
    agentId: runtime.agent.id,
    agentName: runtime.agent.name,
    role: runtime.agent.role || "customer_service",
    timezone: runtime.agent.timezone || "UTC",
    model: GROK_VOICE_DEFAULT_MODEL,
    profile,
    voice,
    greeting:
      runtime.agent.firstMessage?.trim() || `Hi, this is ${runtime.agent.name}. How can I help?`,
    session: commonSession,
    toolNames: tools.map((tool) => tool.name),
  };
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu)
    ?.slice(0, 16) || [];
}

function excerptAroundMatch(content: string, queryTokens: string[]): string {
  if (content.length <= MAX_LIVE_KB_RESULT_CHARS) return content;
  const lower = content.toLowerCase();
  let hit = -1;
  for (const token of queryTokens) {
    const index = lower.indexOf(token);
    if (index >= 0 && (hit < 0 || index < hit)) hit = index;
  }
  if (hit < 0) return `${content.slice(0, MAX_LIVE_KB_RESULT_CHARS)}…`;
  const start = Math.max(0, hit - Math.floor(MAX_LIVE_KB_RESULT_CHARS / 3));
  const end = start + MAX_LIVE_KB_RESULT_CHARS;
  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}

export async function searchApprovedAgentKnowledge(input: {
  userId: string;
  agentId: string;
  query: unknown;
}) {
  const query = trimLine(input.query, 600);
  if (!query) throw AppError.badRequest("A Training search query is required.");

  const { directives, knowledge } = await loadRuntime(input.agentId, input.userId);
  const normalizedQuery = query.toLowerCase();
  const queryTokens = tokens(query);
  const snippets: Snippet[] = [
    ...directives.map((item) => ({
      source: "rule" as const,
      content: typeof item.content === "string" ? item.content.trim() : "",
    })),
    ...knowledge.map((item) => ({
      source: "knowledge" as const,
      content: typeof item.content === "string" ? item.content.trim() : "",
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
    .map((row) => ({
      source: row.item.source,
      content: excerptAroundMatch(row.item.content, queryTokens),
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

export async function getXAIRealtimeVoiceProfile(userId: string, agentId: string) {
  const runtime = await loadRuntime(agentId, userId);
  const profile = resolveWirelineVoiceProfile(
    runtime.agent.role,
    storedProfile(runtime.agent.businessVariables),
  );
  return {
    profile,
    profiles: WIRELINE_LIVE_VOICE_PROFILES,
    voice: resolveWirelineGrokVoice(runtime.agent.role, profile),
    customVoiceConfigured: false,
  };
}

export async function setXAIRealtimeVoiceProfile(
  userId: string,
  agentId: string,
  profile: WirelineVoiceProfile,
) {
  const normalized = normalizeWirelineVoiceProfile(profile);
  if (!normalized) throw AppError.badRequest("Choose a valid live voice profile.");
  const runtime = await loadRuntime(agentId, userId);
  const variables = { ...asRecord(runtime.agent.businessVariables) };
  delete variables.grokVoiceId;
  delete variables.grok_voice_id;
  delete variables.wirelineLiveCustomVoice;
  variables.wirelineLiveVoiceProfile = normalized;
  await drizzle
    .update(schema.agents)
    .set({ businessVariables: variables })
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)));

  return {
    profile: normalized,
    profiles: WIRELINE_LIVE_VOICE_PROFILES,
    voice: resolveWirelineGrokVoice(runtime.agent.role, normalized),
    customVoiceConfigured: false,
  };
}
