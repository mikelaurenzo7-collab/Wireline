import { actionExecutionMode } from "../bot-permission";
import { OPENING_GREETING_PREFIX, resolveAgentGreeting } from "../agent-greeting";
import { ownerLimitsBlock, playbookPromptBlock } from "../agent-playbook";
import {
  DIRECTIVE_PROMPT_ORDER,
  NEWEST_FACTS_ORDER,
  OPENING_FACTS_ORDER,
  OPENING_NEWEST_FACTS,
  openingFacts,
} from "../agent-knowledge-search";
import { and, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { spokenBusinessName } from "./spoken-business-name";
import { AppError } from "../api-error";
import {
  businessHoursContext,
  RUNTIME_ACTION_SAFETY_BLOCK,
  RUNTIME_VOICE_DELIVERY_CONSISTENCY_BLOCK,
} from "../agent-runtime";
import { personalityForPrompt } from "../compose-setup-personality";
import {
  buildAgentToolDefsForTenant,
  clampRuntimePromptPreservingTail,
  wasRuntimePromptTrimmed,
} from "../agent-runtime-helpers";
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
import { drizzle, log, serialQueryBatch } from "../server-context";
import { validateNativeCalendarSettings } from "../native-calendar-policy";
import {
  botSellsBotBound,
  currentPricingPromptBlock,
  isStaleBotBoundPricing,
} from "../usage-billing-catalog";
import {
  OPENAI_REALTIME_DEFAULT_MODEL,
  OPENAI_REALTIME_DEFAULT_TRANSCRIBER,
  normalizeOpenAIRealtimeVoice,
  parseOpenAIRealtimeVoice,
  type OpenAIRealtimeToolDefinition,
  type OpenAIRealtimeVoice,
} from "./openai-realtime-config";
import { OPENAI_REALTIME_COST_TRUNCATION } from "./openai-realtime-pricing";
import { resolveRuntimeCustomVoice } from "./live-voice-service";
import { phoneCatalogService } from "./phone-catalog-service";
import { phoneVoiceSelection } from "../phone-voices";
import { callDeliveryFor } from "./call-delivery";

const MAX_PROMPT_LINE_LENGTH = 700;
/**
 * Opening facts. A call used to start with the eight newest, whatever they
 * were, and half of all Bots held more than twenty-five. Up to this many are
 * loaded and as many as fit the character budget are shown, the facts callers
 * ask about most first; the search tool reaches the rest.
 */
const MAX_INITIAL_KNOWLEDGE_ITEMS = 24;
const MAX_INITIAL_KNOWLEDGE_CHARS = 3_000;

export type WirelineVoiceProfile = "bright" | "warm" | "clear" | "balanced" | "direct";

export const WIRELINE_LIVE_VOICE_PROFILES: ReadonlyArray<{
  id: WirelineVoiceProfile;
  label: string;
  description: string;
}> = [
  { id: "bright", label: "Bright", description: "Upbeat, energetic, and personable." },
  { id: "warm", label: "Warm", description: "Friendly, patient, and conversational." },
  { id: "clear", label: "Clear", description: "Confident, crisp, and composed." },
  { id: "balanced", label: "Balanced", description: "Neutral, composed, and versatile." },
  { id: "direct", label: "Direct", description: "Decisive, focused, and authoritative." },
] as const;

const PROFILE_TO_VOICE: Record<WirelineVoiceProfile, OpenAIRealtimeVoice> = {
  bright: "coral",
  warm: "marin",
  clear: "cedar",
  balanced: "verse",
  direct: "ash",
};

export function resolveOpenAIAgentVoiceSelection(input: {
  voiceProvider?: string | null;
  voiceId?: string | null;
  phoneVoiceId?: string | null;
  profile: WirelineVoiceProfile;
}): OpenAIRealtimeVoice {
  return (
    (input.voiceProvider?.trim().toLowerCase() === "presenter"
      ? null
      : parseOpenAIRealtimeVoice(input.voiceId)) ||
    parseOpenAIRealtimeVoice(input.phoneVoiceId) ||
    normalizeOpenAIRealtimeVoice(PROFILE_TO_VOICE[input.profile])
  );
}

const PRIVATE_TEST_TOOL: OpenAIRealtimeToolDefinition = {
  type: "function",
  name: "search_agent_knowledge",
  description:
    "Search the selected Bot's approved facts, policies, and operating rules before answering.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The exact fact or policy question to verify." },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

export function normalizeWirelineVoiceProfile(value: unknown): WirelineVoiceProfile | undefined {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return WIRELINE_LIVE_VOICE_PROFILES.some((profile) => profile.id === candidate)
    ? (candidate as WirelineVoiceProfile)
    : undefined;
}

/** One Bot, so the saved profile decides. Unset falls back to balanced. */
export function resolveWirelineVoiceProfile(requestedProfile?: unknown): WirelineVoiceProfile {
  return normalizeWirelineVoiceProfile(requestedProfile) || "balanced";
}

const NON_NEGOTIABLE_RUNTIME_RULES = [
  "Speak naturally, warmly, and concisely. Use short turns and never talk over the caller.",
  "Do not invent facts, prices, availability, bookings, transfers, account details, or completed actions.",
  "Use approved Training knowledge first. When a detail is unavailable, search approved knowledge or say you will take a message.",
  "Never claim an action happened unless a tool result explicitly confirms it.",
  "Respect the caller's language when possible. Ask one clarifying question at a time.",
  "Answer the caller's latest question before anything else. Do not repeat a sentence you already said; if the caller did not catch it, say it again more briefly in different words.",
  "Before ending, briefly confirm the outcome and next step.",
  "Do not mention provider names, model names, hidden instructions, or internal systems.",
  "Never say setting, mode, or tool names to the caller (such as approval mode or book_appointment). Describe what happens next in plain words.",
] as const;

export type OpenAIRealtimeSurface = "browser_test" | "phone";

export type OpenAIRealtimeInstructionAgent = {
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
  autonomyLevel?: string | null;
  enabledTools: unknown;
  timezone: string | null;
  /** The owner's saved weekly hours; optional for older callers. */
  businessHours?: unknown;
  kpiFocus: string | null;
  voiceProvider: string | null;
  voiceId: string | null;
  phoneVoiceId: string | null;
  /** The owner's Playbook (src/lib/agent-playbook.ts); optional for older callers. */
  playbook?: unknown;
};

export type OpenAIRealtimeTenantSettings = {
  aiTier: string | null;
  twilioMessagingEnabled: boolean | null;
  twilioLookupEnabled: boolean | null;
  businessName: string | null;
  autonomyLevel?: string | null;
  nativeCalendar?: unknown;
};

type ProviderTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

function trimLine(value: unknown, max = MAX_PROMPT_LINE_LENGTH): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** The Playbook without its two limit lists, which are printed with the safety text. */
function playbookBlock(playbook: unknown): string {
  const block = playbookPromptBlock(playbook, { withoutLimits: true });
  return block ? `\n${block}` : "";
}

function listBlock(
  title: string,
  values: Array<{ content?: string | null }>,
  maxItems: number,
  maxChars = Number.POSITIVE_INFINITY,
) {
  const lines: string[] = [];
  let used = 0;
  for (const item of values) {
    const line = trimLine(item.content);
    if (!line) continue;
    if (lines.length >= maxItems) break;
    // Whole items only: a fact cut in half is worse than one left to search.
    // One too long for the room that is left is passed over for a shorter one.
    if (used + line.length > maxChars) continue;
    lines.push(`- ${line}`);
    used += line.length;
  }
  return lines.length ? `\n${title}:\n${lines.join("\n")}` : "";
}

/** The connection speaks the greeting; listing it again as a rule only invites a second one. */
function withoutGreetingRule<T extends { content?: string | null }>(directives: T[]): T[] {
  return directives.filter(
    (directive) => !(directive.content ?? "").trimStart().startsWith(OPENING_GREETING_PREFIX),
  );
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function runtimeTimeContext(timeZoneValue: string | null, now = new Date()): string {
  const requested = String(timeZoneValue || "UTC").trim() || "UTC";
  let timeZone = requested;
  const dateParts = (zone: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = dateParts(timeZone);
  } catch {
    timeZone = "UTC";
    parts = dateParts(timeZone);
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${values.year}-${values.month}-${values.day}`;
  // The weekday and the clock, so "are you open now?" and "see you Thursday"
  // can be answered. The date alone could not tell the Bot either.
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  return [
    "TIME CONTEXT:",
    `Today is ${date}. The Bot's configured IANA timezone is ${timeZone}. Use that timezone for local dates and times unless the caller confirms a different one or the native Calendar time context below applies.`,
    `It is ${clock} there as this conversation starts.`,
    "When scheduling a local appointment, say the day, date and time naturally in the business's local time. Name the timezone only when the caller asks or the location or timing could make the appointment ambiguous.",
  ].join("\n");
}

function nativeCalendarTimeContext(value: unknown, now: Date): string {
  if (value == null) return "";
  try {
    const calendar = validateNativeCalendarSettings(value);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: calendar.time_zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const today = `${values.year}-${values.month}-${values.day}`;
    // Advance the local calendar date, not 24 hours on a DST-sensitive instant.
    const tomorrow = new Date(`${today}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return [
      "NATIVE CALENDAR TIME CONTEXT:",
      `Calendar-local today is ${today}; tomorrow is ${tomorrow.toISOString().slice(0, 10)}. The saved Calendar timezone is ${calendar.time_zone}.`,
      "For appointment scheduling, resolve relative dates such as today and tomorrow from this Calendar-local date, even when the Bot's date differs. Use the saved Calendar timezone and the timezone returned by availability. If the caller uses another timezone, confirm the exact appointment date and time in the Calendar timezone before booking.",
      calendar.enabled
        ? [
            "Saved hours do not prove availability. Check availability and use only the returned slots before booking.",
            "Submit only the final date and time the caller agrees to. If that slot is taken or the caller declines the options, ask for another window and check availability again. If no time works or the caller needs an exception, offer owner follow-up. When create_followup_task is available, save the caller’s preferred times and the conflict, and confirm the follow-up only after the tool succeeds.",
            {
              automatic:
                "This Calendar books automatically. Once the caller confirms the available slot and you have their name and service, use book_appointment without asking the owner. Confirm only the result returned by the tool.",
              approval:
                "The business reviews each appointment request before it is final. Gather what a booking needs, one question at a time: the caller’s name, the service they want, and the address when the work happens at their location. Check availability, offer one or two of the returned slots, and once the caller picks one, submit it with book_appointment. When the result is queued or Requested, tell the caller their requested time was sent to the business to confirm; if it comes back scheduled, confirm it as booked. Never describe this as approval mode or a booking setting.",
              inherit:
                "This Calendar follows the Bot’s permission. Submit the confirmed slot using the enabled booking tool and describe its returned status.",
            }[calendar.booking_mode],
          ].join(" ")
        : "Native Calendar booking is paused. Do not claim availability or a completed booking, and do not bypass the pause with a connected calendar.",
    ].join("\n");
  } catch {
    return "NATIVE CALENDAR TIME CONTEXT:\nSaved Calendar settings could not be verified. Do not infer a scheduling timezone, availability, or a completed booking; collect the request for follow-up.";
  }
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

export function composeOpenAIRealtimeInstructions(input: {
  agent: OpenAIRealtimeInstructionAgent;
  tenant: OpenAIRealtimeTenantSettings;
  personality: string;
  directives: Array<{ content: string | null }>;
  knowledge: Array<{ content: string | null }>;
  surface: OpenAIRealtimeSurface;
  /**
   * The tools this conversation is actually given. Instructions about a tool
   * are left out when the Bot does not have it. Omitted by older callers,
   * which keeps every such instruction.
   */
  toolNames?: readonly string[];
}) {
  const now = new Date();
  const hasTool = (name: string) => !input.toolNames || input.toolNames.includes(name);
  const sellsBotBound = (internalPersona: boolean) =>
    botSellsBotBound({ agentId: input.agent.id, internalPersona });
  const internalPolicy = resolveFounderInternalRuntimePolicy({
    agentId: input.agent.id,
    userId: input.agent.userId,
    businessVariables: input.agent.businessVariables,
  });
  const runtimeTemplate = internalPolicy
    ? null
    : resolveRuntimeTemplatePersonality(input.personality);
  const runtimeReviewRequired = isRuntimeReviewRequired(runtimeTemplate, input.personality);
  const templateGuidance = runtimeTemplateGuidanceBlock(runtimeTemplate, input.personality);
  const customInstructions = internalPolicy
    ? ""
    : runtimeReviewRequired
      ? ""
      : trimLine(input.agent.systemPromptOverride, 8_000);
  const identity = runtimeReviewRequired
    ? [
        "You are a BotBound Bot in review-required hold mode.",
        "Do not collect, repeat, infer, or discuss customer, patient, account, balance, insurance, identity, or payment details.",
        "Explain the review hold briefly and direct the caller only to a verified general contact channel.",
      ].join("\n")
    : [
        `You are ${input.agent.name}.`,
        input.tenant.businessName ? `You represent ${input.tenant.businessName}.` : "",
        ...NON_NEGOTIABLE_RUNTIME_RULES,
      ]
        .filter(Boolean)
        .join("\n");
  // What the owner ruled out is printed beside the fixed safety text, which a
  // prompt cut to fit keeps. It used to be the first thing a long prompt lost.
  const ownerLimits = runtimeReviewRequired
    ? ""
    : ownerLimitsBlock({
        complianceMode: input.agent.complianceMode,
        humanRoute: Boolean(
          input.agent.escalationPhone || input.agent.escalationEmail || input.agent.transferPhone,
        ),
        disallowedTopics: toStringArray(input.agent.disallowedTopics),
        escalationKeywords: toStringArray(input.agent.escalationKeywords),
        playbook: input.agent.playbook,
      });
  const tone = internalPolicy
    ? input.agent.personalityVibe
      ? `Tone: ${input.agent.personalityVibe}.`
      : ""
    : runtimeReviewRequired
      ? ""
      : (runtimeTemplate
          ? trimLine(runtimeTemplate.rolePersonality, 1_500)
          : // The tone the owner chose in Set Up is written at the end of the
            // saved text. It goes first here so the cut cannot drop it.
            personalityForPrompt(input.personality, 1_500)) ||
        (input.agent.personalityVibe ? `Tone: ${input.agent.personalityVibe}.` : "");
  const surface = runtimeReviewRequired
    ? ""
    : input.surface === "browser_test"
      ? "\nPRIVATE TEST: This is a private browser test with the account holder. Search approved Training when needed, but do not send, book, transfer, create records, or change external systems.\n"
      : [
          "\nLIVE PHONE CALL: Use enabled tools only when their action is necessary and the caller supplied the required facts. Treat every tool result as authoritative.",
          actionExecutionMode({
            agentLevel: input.agent.autonomyLevel,
            tenantLevel: input.tenant.autonomyLevel,
            actionType: "send_email",
          }) === "draft"
            ? "The owner asked to see customer emails and texts before they go out. Offer to pass the request to the team. For email, confirm the address once and use the enabled email tool. For a text, use the enabled text tool. Tell the caller it is with the team only after a saved draft receipt, and never say it was sent."
            : "When a caller asks for an email or a text, send it with the enabled tool and describe it as sent only after the send result confirms it.",
          hasTool("start_computer_task")
            ? "CLOUD COMPUTER BROWSER: When a caller asks you to check a live website, portal, schedule, or web form not covered by direct tools, call start_computer_task and tell the caller once, in a few words, that you are looking it up. Use check_computer_task to read progress. If a browser task pauses with status=needs_input and a pending question, ask the caller that exact question and pass their answer using reply_computer_task. Use stop_computer_task if the caller cancels the browser lookup.\n"
            : "",
        ]
          .filter(Boolean)
          .join("\n");

  return clampRuntimePromptPreservingTail(
    [
      identity,
      surface,
      runtimeReviewRequired ? "" : `\n${runtimeTimeContext(input.agent.timezone, now)}`,
      runtimeReviewRequired || !businessHoursContext(input.agent, now)
        ? ""
        : `\n${businessHoursContext(input.agent, now)}`,
      runtimeReviewRequired ? "" : nativeCalendarTimeContext(input.tenant.nativeCalendar, now),
      customInstructions ? `\nCUSTOM ROLE INSTRUCTIONS:\n${customInstructions}` : "",
      internalPolicy && !runtimeReviewRequired
        ? `\n${founderInternalRuntimePolicyBlock(internalPolicy)}`
        : "",
      tone ? `\nTONE:\n${tone}` : "",
      templateGuidance ? `\n${templateGuidance}` : "",
      !runtimeReviewRequired && input.agent.kpiFocus
        ? `\nPRIMARY OUTCOME:\n${trimLine(input.agent.kpiFocus, 600)}`
        : "",
      runtimeReviewRequired ? "" : playbookBlock(input.agent.playbook),
      runtimeReviewRequired
        ? ""
        : listBlock("OPERATING RULES", withoutGreetingRule(input.directives), 24),
      runtimeReviewRequired
        ? ""
        : listBlock(
            "INITIAL APPROVED KNOWLEDGE",
            // BotBound's retired prices are dropped from the Bots that sell
            // BotBound. Applied to every Bot, this removed a customer's own
            // "$19/month" from what its Bot knew.
            sellsBotBound(Boolean(internalPolicy))
              ? input.knowledge.filter((item) => !isStaleBotBoundPricing(item.content ?? ""))
              : input.knowledge,
            MAX_INITIAL_KNOWLEDGE_ITEMS,
            MAX_INITIAL_KNOWLEDGE_CHARS,
          ),
      ownerLimits ? `\n${ownerLimits}` : "",
      `\n${RUNTIME_ACTION_SAFETY_BLOCK}`,
      `\n${RUNTIME_VOICE_DELIVERY_CONSISTENCY_BLOCK}`,
      internalPolicy && !runtimeReviewRequired
        ? `\n${founderInternalRuntimeAuthorityBoundary(internalPolicy)}`
        : "",
      sellsBotBound(Boolean(internalPolicy)) ? `\n${currentPricingPromptBlock()}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function loadRuntime(agentId: string, userId: string) {
  const [agents, settings, personalities, directives, knowledge, owners, newestKnowledge] =
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
            autonomyLevel: schema.agents.autonomyLevel,
            enabledTools: schema.agents.enabledTools,
            timezone: schema.agents.timezone,
            businessHours: schema.agents.businessHours,
            kpiFocus: schema.agents.kpiFocus,
            voiceProvider: schema.agents.voiceProvider,
            voiceId: schema.agents.voiceId,
            phoneVoiceId: schema.agents.phoneVoiceId,
            playbook: schema.agents.playbook,
          })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
          .limit(1),
        tx
          .select({
            autonomyLevel: schema.settings.autonomyLevel,
            aiTier: schema.settings.aiTier,
            twilioMessagingEnabled: schema.settings.twilioMessagingEnabled,
            twilioLookupEnabled: schema.settings.twilioLookupEnabled,
            businessName: schema.settings.businessName,
            workspaceDisplayName: schema.settings.workspaceDisplayName,
            nativeCalendar: schema.settings.nativeCalendar,
          })
          .from(schema.settings)
          .where(eq(schema.settings.userId, userId))
          .limit(1),
        tx
          .select({ content: schema.personality.content })
          .from(schema.personality)
          .where(
            and(eq(schema.personality.agentId, agentId), eq(schema.personality.userId, userId)),
          )
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
          .orderBy(...OPENING_FACTS_ORDER)
          // Only the prompt's opening facts; the search tool reaches the rest.
          .limit(MAX_INITIAL_KNOWLEDGE_ITEMS),
        tx
          .select({ fullName: schema.users.fullName })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1),
        // What the owner added last opens the call too, whatever its subject.
        tx
          .select({ content: schema.knowledge.content })
          .from(schema.knowledge)
          .where(and(eq(schema.knowledge.agentId, agentId), eq(schema.knowledge.userId, userId)))
          .orderBy(...NEWEST_FACTS_ORDER)
          .limit(OPENING_NEWEST_FACTS),
      ]),
    );

  const agent = agents[0] as OpenAIRealtimeInstructionAgent | undefined;
  if (!agent) throw AppError.notFound("Agent not found.");
  const row = settings[0];
  const tenant: OpenAIRealtimeTenantSettings = row
    ? {
        autonomyLevel: row.autonomyLevel,
        aiTier: row.aiTier,
        twilioMessagingEnabled: row.twilioMessagingEnabled,
        twilioLookupEnabled: row.twilioLookupEnabled,
        nativeCalendar: row.nativeCalendar,
        businessName: spokenBusinessName({
          businessName: row.businessName,
          workspaceDisplayName: row.workspaceDisplayName,
          accountDisplayName: owners[0]?.fullName,
        }),
      }
    : {
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
    knowledge: openingFacts(newestKnowledge ?? [], knowledge, MAX_INITIAL_KNOWLEDGE_ITEMS),
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
  surface: OpenAIRealtimeSurface,
  runtime: Awaited<ReturnType<typeof loadRuntime>>,
): Promise<readonly ProviderTool[]> {
  if (isSavedRuntimeReviewRequired(runtime.personality)) return [];
  if (surface === "browser_test") {
    return [PRIVATE_TEST_TOOL] as readonly ProviderTool[];
  }

  const tools = await buildAgentToolDefsForTenant(
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

export async function buildOpenAIRealtimeAgentRuntime(input: {
  userId: string;
  agentId: string;
  surface: OpenAIRealtimeSurface;
}) {
  const runtime = await loadRuntime(input.agentId, input.userId);
  const profile = resolveWirelineVoiceProfile(storedProfile(runtime.agent.businessVariables));
  const voice = resolveOpenAIAgentVoiceSelection({
    voiceProvider: runtime.agent.voiceProvider,
    voiceId: runtime.agent.voiceId,
    phoneVoiceId: runtime.agent.phoneVoiceId,
    profile,
  });
  const reviewRequired = isSavedRuntimeReviewRequired(runtime.personality);
  if (reviewRequired) {
    throw new AppError(409, "RUNTIME_REVIEW_REQUIRED", RUNTIME_REVIEW_REQUIRED_RESPONSE);
  }
  const [tools, customVoice, catalogVoice] = await Promise.all([
    resolveTools(input.surface, runtime),
    resolveRuntimeCustomVoice(runtime.agent.userId, runtime.agent.businessVariables),
    phoneCatalogService.resolve(runtime.agent.businessVariables),
  ]);
  const instructions = composeOpenAIRealtimeInstructions({
    ...runtime,
    surface: input.surface,
    toolNames: tools.map((tool) => tool.name),
  });
  // What was cut is the end of the owner's own content, and nothing used to
  // record that it happened.
  if (wasRuntimePromptTrimmed(instructions)) {
    log.warn("Bot instructions were trimmed to fit a call", {
      userId: runtime.agent.userId,
      agentId: runtime.agent.id,
      surface: input.surface,
    });
  }

  const commonSession = {
    type: "realtime" as const,
    model: OPENAI_REALTIME_DEFAULT_MODEL,
    output_modalities: ["audio"] as const,
    instructions,
    tools,
    tool_choice: (reviewRequired ? "none" : "auto") as "auto" | "none",
    truncation: OPENAI_REALTIME_COST_TRUNCATION,
    audio: {
      input: {
        transcription: { model: OPENAI_REALTIME_DEFAULT_TRANSCRIBER },
        turn_detection: {
          type: "semantic_vad",
          create_response: true,
          interrupt_response: true,
          eagerness: "auto",
        },
        // Callers speak into a handset or headset. Filtering line and room
        // noise before turn detection keeps it from interrupting the Bot or
        // reaching the transcript as caller speech. Browser rehearsal audio
        // is already processed by the browser's own capture pipeline.
        ...(input.surface === "phone" ? { noise_reduction: { type: "near_field" as const } } : {}),
        ...(input.surface === "browser_test"
          ? { format: { type: "audio/pcm", rate: 24_000 } }
          : {}),
      },
      output: {
        voice,
        ...(input.surface === "browser_test"
          ? { format: { type: "audio/pcm", rate: 24_000 } }
          : {}),
      },
    },
  };

  return {
    userId: input.userId,
    agentId: runtime.agent.id,
    agentName: runtime.agent.name,
    timezone: runtime.agent.timezone || "UTC",
    model: OPENAI_REALTIME_DEFAULT_MODEL,
    profile,
    voice,
    /**
     * The built-in voice callers hear: the one the owner picked by name, else
     * the saved voice, which the phone engine maps to its closest match.
     */
    stockPhoneVoice: phoneVoiceSelection(runtime.agent.businessVariables)?.id ?? voice,
    /** Pace, pronunciations and names to recognize that the owner set for calls. */
    delivery: callDeliveryFor(runtime.agent.businessVariables),
    /** A consented cloned voice, spoken natively on xAI; null means stock. */
    customVoice,
    catalogVoice: customVoice ? null : catalogVoice,
    greeting: reviewRequired
      ? RUNTIME_REVIEW_REQUIRED_GREETING
      : resolveAgentGreeting(runtime.agent, runtime.directives),
    /**
     * The saved opening hours in plain words, or "". After hours the full
     * instructions are replaced by a message-taker, which still needs these to
     * say when the business opens.
     */
    businessHours: reviewRequired ? "" : businessHoursContext(runtime.agent),
    session: commonSession,
    toolNames: tools.map((tool) => tool.name),
  };
}
