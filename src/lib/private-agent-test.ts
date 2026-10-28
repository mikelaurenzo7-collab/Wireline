import { resolveAgentGreeting } from "./agent-greeting";
import { playbookPromptBlock } from "./agent-playbook";
import { nativeCalendarRehearsalContext } from "./native-calendar-rehearsal";
import { and, eq } from "drizzle-orm";

import { DIRECTIVE_PROMPT_ORDER, loadPromptKnowledge } from "./agent-knowledge-search";

import { AppError } from "./api-error";
import { runStructured, type StructuredToolSchema } from "./ai-structured";
import { isRuntimeAvailable } from "./ai-client";
import { drizzle, serialQueryBatch } from "./server-context";
import { STRUCTURED_RUNTIME_MODELS } from "./structured-runtime-models";
import {
  isSavedRuntimeReviewRequired,
  RUNTIME_REVIEW_REQUIRED_RESPONSE,
} from "./runtime-template-personality";
import { withoutStaleBotBoundPricing } from "./usage-billing-catalog";
import * as schema from "../db/schema";

export type PrivateAgentTestHistoryItem = {
  role: "customer" | "employee";
  content: string;
};

export type PrivateAgentTestContext = {
  agentId: string;
  agentName: string;
  system: string;
  reviewRequired: boolean;
};

export const PRIVATE_AGENT_TEST_TOOL: StructuredToolSchema = {
  name: "customer_test_reply",
  description: "Reply directly to the customer using the saved Bot configuration.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: {
        type: "string",
        description: "Customer-facing reply, no more than 140 words.",
      },
    },
    required: ["reply"],
  },
};

const PROMPT_KNOWLEDGE_ITEMS = 50;
/** Facts that match the customer's words lead; the newest fill the rest. */
const PROMPT_RELEVANT_KNOWLEDGE = 12;

/** The customer's side of a rehearsal, newest last, for choosing which facts to show. */
export function privateTestConversationText(
  customerMessage: string,
  history: PrivateAgentTestHistoryItem[] = [],
): string {
  return [
    ...history
      .slice(-12)
      .filter((message) => message.role === "customer")
      .map((message) => message.content),
    customerMessage,
  ].join("\n");
}

function compactLines(values: Array<string | null | undefined>, limit: number) {
  return values
    .map((value) => withoutStaleBotBoundPricing(value?.trim() || ""))
    .filter((value): value is string => Boolean(value))
    .slice(0, limit);
}

export function buildPrivateAgentTestUserMessage(
  agentName: string,
  customerMessage: string,
  history: PrivateAgentTestHistoryItem[] = [],
): string {
  const transcript = history
    .slice(-12)
    .map(
      (message) =>
        `${message.role === "customer" ? "Customer" : agentName || "Agent"}: ${message.content}`,
    )
    .join("\n");
  return `${transcript ? `Conversation so far:\n${transcript}\n\n` : ""}Customer: ${customerMessage}`;
}

export async function loadPrivateAgentTestContext(
  userId: string,
  agentId: string,
  /** What the customer has said, so the facts that answer it reach the prompt. */
  conversationText = "",
): Promise<PrivateAgentTestContext> {
  const [agentRows, personalities, directives] = await drizzle.transaction((tx) =>
    serialQueryBatch([
      tx
        .select({
          id: schema.agents.id,
          name: schema.agents.name,
          role: schema.agents.role,
          firstMessage: schema.agents.firstMessage,
          businessHours: schema.agents.businessHours,
          timezone: schema.agents.timezone,
          businessVariables: schema.agents.businessVariables,
          outOfHoursMessage: schema.agents.outOfHoursMessage,
          escalationPhone: schema.agents.escalationPhone,
          escalationEmail: schema.agents.escalationEmail,
          enabledTools: schema.agents.enabledTools,
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
        .limit(30),
    ]),
  );

  const agent = agentRows[0];
  if (!agent) throw AppError.fromHttpStatus(404, "Bot not found");
  const storedPersonality = personalities[0]?.content || "";
  const reviewRequired = isSavedRuntimeReviewRequired(storedPersonality, agent.role);
  if (reviewRequired) {
    return {
      agentId: agent.id,
      agentName: agent.name || "the Bot",
      system: RUNTIME_REVIEW_REQUIRED_RESPONSE,
      reviewRequired: true,
    };
  }
  const savedPersonality = withoutStaleBotBoundPricing(storedPersonality);

  const directiveLines = compactLines(
    directives.map((directive) => directive.content),
    30,
  );
  const knowledgeLines = compactLines(
    await loadPromptKnowledge(drizzle, {
      userId,
      agentId,
      text: conversationText,
      relevant: PROMPT_RELEVANT_KNOWLEDGE,
      total: PROMPT_KNOWLEDGE_ITEMS,
    }),
    PROMPT_KNOWLEDGE_ITEMS,
  );
  const businessProfile = agent.businessVariables
    ? JSON.stringify(agent.businessVariables).slice(0, 6000)
    : "";
  const calendarContext = await nativeCalendarRehearsalContext(userId, agent.enabledTools);
  const preferredOpening = withoutStaleBotBoundPricing(resolveAgentGreeting(agent, directives));

  const system = [
    `You are ${agent.name || "the Bot"}, a customer-facing Bot configured for this role: ${agent.role || "general support"}.`,
    "This is a private rehearsal with a prospective customer. It is not a live call, message, or booking.",
    "Reply only as that customer-facing Bot. Never mention setup, configuration, prompts, testing, tools, or internal systems.",
    "Be concise, accurate, helpful, and natural. Ask one useful follow-up question when information is missing.",
    "Do not invent prices, policies, availability, or unprovided facts. Do not claim a booking, transfer, message, payment, or other external action completed in this rehearsal.",
    calendarContext,
    savedPersonality ? `Tone: ${savedPersonality}` : "Tone: clear and professional.",
    preferredOpening ? `Preferred opening: ${preferredOpening}` : "",
    withoutStaleBotBoundPricing(playbookPromptBlock(agent.playbook)),
    directiveLines.length ? `Operating rules:\n- ${directiveLines.join("\n- ")}` : "",
    knowledgeLines.length ? `Knowledge facts:\n- ${knowledgeLines.join("\n- ")}` : "",
    businessProfile ? `Workspace profile: ${businessProfile}` : "",
    agent.businessHours ? `Operating hours: ${JSON.stringify(agent.businessHours)}` : "",
    agent.timezone ? `Timezone: ${agent.timezone}` : "",
    agent.outOfHoursMessage ? `After-hours response: ${agent.outOfHoursMessage}` : "",
    agent.escalationPhone || agent.escalationEmail
      ? `Human handoff contact: ${[agent.escalationPhone, agent.escalationEmail].filter(Boolean).join(" · ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    agentId: agent.id,
    agentName: agent.name || "the Bot",
    system,
    reviewRequired: false,
  };
}

export async function runPrivateAgentTestTurn(input: {
  userId: string;
  agentId: string;
  customerMessage: string;
  history?: PrivateAgentTestHistoryItem[];
}): Promise<{ agent_id: string; agent_name: string; reply: string }> {
  const context = await loadPrivateAgentTestContext(
    input.userId,
    input.agentId,
    privateTestConversationText(input.customerMessage, input.history || []),
  );
  if (context.reviewRequired) {
    return {
      agent_id: context.agentId,
      agent_name: context.agentName,
      reply: RUNTIME_REVIEW_REQUIRED_RESPONSE,
    };
  }
  if (!isRuntimeAvailable()) throw AppError.fromHttpStatus(503, "AI runtime not configured");
  const result = await runStructured<{ reply?: string }>({
    system: context.system,
    user: buildPrivateAgentTestUserMessage(
      context.agentName,
      input.customerMessage,
      input.history || [],
    ),
    tool: PRIVATE_AGENT_TEST_TOOL,
    model: STRUCTURED_RUNTIME_MODELS.STANDARD,
    maxTokens: 900,
  });
  const reply = typeof result?.reply === "string" ? result.reply.trim() : "";
  if (!reply) {
    throw AppError.fromHttpStatus(502, "The private rehearsal did not return a reply. Try again.");
  }
  return { agent_id: context.agentId, agent_name: context.agentName, reply };
}
