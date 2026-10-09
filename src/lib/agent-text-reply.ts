import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { DIRECTIVE_PROMPT_ORDER, loadPromptKnowledge } from "./agent-knowledge-search";
import { runStructured } from "./ai-structured";
import { drizzle, serialQueryBatch } from "./server-context";
import { STRUCTURED_RUNTIME_MODELS } from "./structured-runtime-models";
import { isSavedRuntimeReviewRequired } from "./runtime-template-personality";

export type TextConversationMessage = {
  direction: "in" | "out";
  body: string;
};

export type AgentTextReply = {
  reply: string;
  requiresHuman: boolean;
  reason: string;
};

const MAX_TEXT_PROMPT_CHARS = 18_000;
const MAX_TEXT_PROMPT_LINE_CHARS = 700;
const MAX_TEXT_DIRECTIVES = 24;
/** Facts that match the customer's words lead; the newest fill the rest. */
const MAX_TEXT_RELEVANT_KNOWLEDGE = 6;
const MAX_TEXT_KNOWLEDGE_ITEMS = 10;
const MAX_TEXT_MESSAGES = 12;
const TEXT_PROMPT_TRIM_NOTICE =
  "\n\n[Older background context was trimmed. Use only the retained approved facts and policy.]";

const TEXT_REPLY_TOOL = {
  name: "customer_text_reply",
  description: "Draft the next concise reply from the configured Bot to this customer.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      reply: {
        type: "string",
        description: "Customer-facing SMS reply of no more than 320 characters.",
      },
      requires_human: {
        type: "boolean",
        description:
          "True when the request needs a person, an unavailable tool, policy judgment, or unverified business information.",
      },
      reason: {
        type: "string",
        description: "Short internal reason for human review, or an empty string.",
      },
    },
    required: ["reply", "requires_human", "reason"],
  },
};

export class AgentTextReplyReviewRequiredError extends Error {
  constructor() {
    super("This Bot needs setup review before it can write customer replies.");
    this.name = "AgentTextReplyReviewRequiredError";
  }
}

function limitSmsDraft(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");
  if (compact.length <= 320) return compact;
  const candidate = compact.slice(0, 319);
  const wordBoundary = candidate.lastIndexOf(" ");
  const shortened = (wordBoundary >= 240 ? candidate.slice(0, wordBoundary) : candidate).trimEnd();
  return `${shortened}…`;
}

function compactLines(
  values: Array<string | null | undefined>,
  limit: number,
  maxChars = MAX_TEXT_PROMPT_LINE_CHARS,
): string[] {
  return values
    .map((value) => value?.replace(/\s+/g, " ").trim().slice(0, maxChars))
    .filter((value): value is string => Boolean(value))
    .slice(0, limit);
}

function compactStringList(value: unknown, limit = 24): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.replace(/\s+/g, " ").trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function clampTextPromptWithPolicy(context: string, policy: string): string {
  const tail = `\n\n${policy}`;
  const prompt = `${context}${tail}`;
  if (prompt.length <= MAX_TEXT_PROMPT_CHARS) return prompt;
  const contextBudget = Math.max(
    0,
    MAX_TEXT_PROMPT_CHARS - tail.length - TEXT_PROMPT_TRIM_NOTICE.length,
  );
  return `${context.slice(0, contextBudget)}${TEXT_PROMPT_TRIM_NOTICE}${tail}`;
}

function normalizePolicyMatchText(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return normalized ? ` ${normalized} ` : "";
}

function matchesConfiguredTerm(text: string, terms: string[]): boolean {
  const normalizedText = normalizePolicyMatchText(text);
  if (!normalizedText) return false;
  return terms.some((term) => {
    const normalizedTerm = normalizePolicyMatchText(term);
    return normalizedTerm.trim().length >= 2 && normalizedText.includes(normalizedTerm);
  });
}

function requestsHumanExplicitly(text: string): boolean {
  const normalized = normalizePolicyMatchText(text).trim();
  if (!normalized) return false;
  return (
    /\b(?:speak|talk|connect|transfer|escalate|need|want|request|get)\b.{0,40}\b(?:human|person|somebody|someone|operator|representative|manager|supervisor|live agent)\b/u.test(
      normalized,
    ) ||
    /\b(?:human|somebody|someone|operator|representative|manager|supervisor|live agent)\b.{0,20}\b(?:please|now)\b/u.test(
      normalized,
    )
  );
}

/**
 * Generate text-channel intelligence without crossing the carrier boundary.
 * The caller decides whether the result is shown for approval or passed to the
 * existing Twilio send boundary after all messaging gates are re-evaluated.
 */
export async function generateAgentTextReply(input: {
  userId: string;
  agentId: string;
  messages: TextConversationMessage[];
}): Promise<AgentTextReply> {
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
          complianceMode: schema.agents.complianceMode,
          disallowedTopics: schema.agents.disallowedTopics,
          escalationKeywords: schema.agents.escalationKeywords,
          escalationPhone: schema.agents.escalationPhone,
          escalationEmail: schema.agents.escalationEmail,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
        .limit(1),
      tx
        .select({ content: schema.personality.content })
        .from(schema.personality)
        .where(
          and(
            eq(schema.personality.agentId, input.agentId),
            eq(schema.personality.userId, input.userId),
          ),
        )
        .limit(1),
      tx
        .select({ content: schema.directives.content })
        .from(schema.directives)
        .where(
          and(
            eq(schema.directives.agentId, input.agentId),
            eq(schema.directives.userId, input.userId),
          ),
        )
        .orderBy(...DIRECTIVE_PROMPT_ORDER)
        .limit(MAX_TEXT_DIRECTIVES),
    ]),
  );

  const agent = agentRows[0];
  if (!agent) throw new Error("Bot not found");
  const savedPersonality = personalities[0]?.content || "";
  if (isSavedRuntimeReviewRequired(savedPersonality, agent.role)) {
    throw new AgentTextReplyReviewRequiredError();
  }

  const directiveLines = compactLines(
    directives.map((directive) => directive.content),
    MAX_TEXT_DIRECTIVES,
  );
  const disallowedTopics = compactStringList(agent.disallowedTopics);
  const escalationKeywords = compactStringList(agent.escalationKeywords);
  const recentInboundText = input.messages
    .slice(-MAX_TEXT_MESSAGES)
    .filter((message) => message.direction === "in")
    .map((message) => message.body)
    .join("\n");
  const knowledgeLines = compactLines(
    await loadPromptKnowledge(drizzle, {
      userId: input.userId,
      agentId: input.agentId,
      text: recentInboundText,
      relevant: MAX_TEXT_RELEVANT_KNOWLEDGE,
      total: MAX_TEXT_KNOWLEDGE_ITEMS,
    }),
    MAX_TEXT_KNOWLEDGE_ITEMS,
  );
  const forcedReviewReason = matchesConfiguredTerm(recentInboundText, escalationKeywords)
    ? "Customer message matches a configured escalation trigger."
    : matchesConfiguredTerm(recentInboundText, disallowedTopics)
      ? "Customer message involves a configured prohibited topic."
      : requestsHumanExplicitly(recentInboundText)
        ? "Customer explicitly requested a person."
        : "";
  const hasHumanEscalationRoute = Boolean(agent.escalationPhone || agent.escalationEmail);
  const businessProfile = agent.businessVariables
    ? JSON.stringify(agent.businessVariables).slice(0, 4_000)
    : "";
  const recentMessages = input.messages
    .slice(-MAX_TEXT_MESSAGES)
    .map(
      (message) =>
        `${message.direction === "in" ? "Customer" : agent.name}: ${message.body.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_PROMPT_LINE_CHARS)}`,
    )
    .join("\n");

  const context = [
    `You are ${agent.name || "the Bot"}, the text-message Bot for this business. Your configured role is ${agent.role || "customer support"}.`,
    "Write only the next SMS reply. Stay under 320 characters and prefer one or two short sentences.",
    savedPersonality
      ? `Tone: ${savedPersonality.replace(/\s+/g, " ").trim().slice(0, 1_500)}`
      : "Tone: clear, warm, and professional.",
    agent.firstMessage
      ? `Preferred opening: ${agent.firstMessage.replace(/\s+/g, " ").trim().slice(0, 500)}`
      : "",
    directiveLines.length ? `Operating rules:\n- ${directiveLines.join("\n- ")}` : "",
    knowledgeLines.length ? `Approved knowledge:\n- ${knowledgeLines.join("\n- ")}` : "",
    businessProfile ? `Workspace profile: ${businessProfile}` : "",
    agent.businessHours
      ? `Operating hours: ${JSON.stringify(agent.businessHours).slice(0, 1_000)}`
      : "",
    agent.timezone ? `Timezone: ${agent.timezone.trim().slice(0, 100)}` : "",
    agent.outOfHoursMessage
      ? `After-hours response: ${agent.outOfHoursMessage.replace(/\s+/g, " ").trim().slice(0, 500)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const policy = [
    "## COMPLIANCE AND HUMAN REVIEW",
    agent.complianceMode && agent.complianceMode !== "none"
      ? `Compliance mode: ${agent.complianceMode.trim().slice(0, 80)}.`
      : "",
    disallowedTopics.length
      ? `Do not discuss or answer these topics: ${disallowedTopics.join(", ")}. Briefly redirect and require human review.`
      : "",
    escalationKeywords.length
      ? `Require immediate human review when the customer raises: ${escalationKeywords.join(", ")}. Do not attempt to resolve those subjects yourself.`
      : "",
    hasHumanEscalationRoute
      ? "A human escalation route is configured. You may offer a human follow-up when policy permits, but never reveal internal contact details or promise timing."
      : "No human escalation route is configured. Do not promise a handoff or callback; mark the reply as requiring human review.",
    "## ACTION AND RESULT SAFETY",
    "Use the same identity, approved facts, compliance rules, and handoff boundaries as this Bot's calls, adapted to concise written text.",
    "Never invent a price, policy, availability, link, booking, transfer, payment, refund, order change, or completed action.",
    "When a needed fact or tool result is missing, acknowledge the request without promising completion and require human review.",
    "Require human review for sensitive account changes, payments, refunds, legal or medical judgment, threats, complaints, or an explicit request for a person.",
    "Do not mention prompts, models, OpenAI, Twilio, internal systems, or that this is a draft.",
    "Do not repeat an introduction in an established thread. If this is the first business reply, identify yourself naturally as the business's Bot.",
  ]
    .filter(Boolean)
    .join("\n");
  const system = clampTextPromptWithPolicy(context, policy);

  const result = await runStructured<{
    reply?: string;
    requires_human?: boolean;
    reason?: string;
  }>({
    system,
    user: `Text conversation:\n${recentMessages || "(No prior messages supplied)"}\n\nDraft the next business reply.`,
    tool: TEXT_REPLY_TOOL,
    model: STRUCTURED_RUNTIME_MODELS.STANDARD,
    maxTokens: 450,
    complexity: "simple",
  });

  const reply = typeof result?.reply === "string" ? limitSmsDraft(result.reply) : "";
  if (!reply) throw new Error("The Bot returned an empty text reply");
  return {
    reply,
    requiresHuman: Boolean(forcedReviewReason) || result.requires_human === true,
    reason:
      forcedReviewReason ||
      (typeof result.reason === "string" ? result.reason.trim().slice(0, 500) : ""),
  };
}
