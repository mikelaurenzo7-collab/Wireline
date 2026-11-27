import { runStructured } from "./ai-structured";
import type { StructuredToolSchema } from "./ai-structured";

export type ClientCommunicationReview = {
  approved: boolean;
  subject: string;
  body: string;
  rationale: string;
  /**
   * Set when a Bot on Auto decides its owner should see this message before
   * it goes: what the owner has to decide, in a sentence written for the
   * owner. `approved` is then false and the subject and body are the message
   * as the Bot wrote it. The caller holds the message; it must not send it.
   */
  ownerDecision?: string;
};

/**
 * Asks the review to also decide whether the owner would want a say. Passed
 * only for a Bot on Auto, and only for a message nobody has chosen to send.
 */
export type OwnerDecisionRequest = {
  /** The owner's own "check with me first when…" rules, in their words. */
  rules: readonly string[];
};

export class ClientCommunicationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientCommunicationBlockedError";
  }
}

const reviewTool: StructuredToolSchema = {
  name: "review_client_communication",
  description:
    "Review and, when necessary, revise a client-facing message. Preserve facts, avoid unsupported promises, and return send-ready copy whenever a safe repair is possible.",
  input_schema: {
    type: "object",
    properties: {
      approved: { type: "boolean" },
      subject: { type: "string" },
      body: { type: "string" },
      rationale: { type: "string" },
    },
    required: ["approved", "subject", "body", "rationale"],
    additionalProperties: false,
  },
};

const reviewWithOwnerDecisionTool: StructuredToolSchema = {
  name: "review_client_communication",
  description:
    "Review and, when necessary, revise a client-facing message, and decide whether the business owner must see it before it is sent.",
  input_schema: {
    type: "object",
    properties: {
      approved: { type: "boolean" },
      subject: { type: "string" },
      body: { type: "string" },
      rationale: { type: "string" },
      needs_owner: { type: "boolean" },
      owner_reason: { type: "string" },
    },
    required: ["approved", "subject", "body", "rationale", "needs_owner", "owner_reason"],
    additionalProperties: false,
  },
};

const REVIEW_SYSTEM =
  "You are BotBound's outbound communications safety and quality reviewer. Preserve the sender's intent and verified facts. Remove unsupported commitments, sensitive data, pressure, or unsafe claims. Return approved=true whenever the SUBJECT AND BODY YOU RETURN are safe and ready to send, including when you revised the original. Return approved=false only when the communication must be blocked because it cannot be safely repaired without inventing facts, authority, consent, or commitments. The message is sent by the business named below, not by BotBound: do not add a signature or sign-off (one is appended automatically), and do not mention BotBound, AI models, or internal systems unless the original does.";

/**
 * The owner let this Bot send on its own and wants to be asked only when it
 * matters, so the list of reasons to ask is short and the default is to send.
 * A reason to ask is never a reason to rewrite: the owner sees what the Bot
 * meant to say.
 */
const OWNER_DECISION_SYSTEM =
  "The business owner lets this assistant send messages without asking, and wants to be asked only when it matters. Also decide whether the owner must see this message before it is sent. Set needs_owner=true only when at least one of these is true: (1) one of the owner's check-first rules listed below applies to it; (2) it offers or agrees to something only the owner can grant: a discount, a refund or credit, a price negotiated for this customer, a guarantee, a deadline, or an exception to the business's usual terms; (3) it answers a complaint, a disputed charge, or a legal, medical or safety question. A routine message does not need the owner: an address, opening hours, a standard price, a link, a booking time, a confirmation of what was said, a thank-you. When in doubt between routine and not, it is routine. When needs_owner=true, do not remove the part the owner has to decide and do not block the message for that reason: return the subject and body as written, and write owner_reason as one short sentence addressed to the owner that says what they need to decide. When needs_owner=false, owner_reason is an empty string.";

function ownerRulesBlock(rules: readonly string[]): string {
  const listed = rules
    .map((rule) =>
      String(rule || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200),
    )
    .filter(Boolean)
    .slice(0, 10);
  return `Owner's check-first rules:\n${listed.length ? listed.map((rule) => `- ${rule}`).join("\n") : "None"}`;
}

function validateRecipient(channel: "email" | "sms" | "whatsapp", recipient?: string | null): void {
  const value = String(recipient || "").trim();
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new ClientCommunicationBlockedError(
      "A valid confirmed email address is required before sending.",
    );
  }
}

/**
 * Never expose UUIDs, database keys, or internal agent IDs in customer copy.
 * An id or a blank becomes "" so callers fall back to the business's own name
 * rather than the platform's: the customer is writing to the business.
 */
export function clientFacingAgentName(value?: string | null): string {
  const candidate = String(value || "").trim();
  if (!candidate) return "";
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(candidate)) return "";
  if (/^(?:agent|director|tool)-[a-z0-9_-]{6,}$/i.test(candidate)) return "";
  return candidate.slice(0, 80);
}

/**
 * The reviewer returns the whole message, so its output cap must fit the
 * longest body it may echo (12,000 characters) plus the rationale. About three
 * characters per token keeps the estimate conservative; a fixed 1,200 tokens
 * truncated long emails into unparseable output on every provider.
 */
export function reviewOutputTokenBudget(subject: string, body: string): number {
  const estimate = Math.ceil((subject.length + body.length) / 3) + 800;
  return Math.min(6000, Math.max(1500, estimate));
}

export async function superviseClientCommunication(input: {
  channel: "email" | "sms" | "whatsapp";
  agentName?: string | null;
  /** The business the customer is hearing from; preferred for the fallback subject. */
  businessName?: string | null;
  source: string;
  purpose: string;
  recipient?: string | null;
  subject?: string | null;
  body?: string | null;
  context?: string | null;
  ownerDecision?: OwnerDecisionRequest;
}): Promise<ClientCommunicationReview> {
  validateRecipient(input.channel, input.recipient);

  const originalBody = String(input.body || "").slice(0, 12000);
  const originalSubject = String(input.subject || "").slice(0, 500);
  if (!originalBody.trim()) {
    throw new ClientCommunicationBlockedError("No message body was provided.");
  }

  const senderName = clientFacingAgentName(input.agentName);
  const businessName = clientFacingAgentName(input.businessName);
  const reviewed = await runStructured<
    ClientCommunicationReview & { needs_owner?: unknown; owner_reason?: unknown }
  >({
    system: input.ownerDecision ? `${REVIEW_SYSTEM}\n\n${OWNER_DECISION_SYSTEM}` : REVIEW_SYSTEM,
    user: `Channel: ${input.channel}\nBusiness: ${businessName || "Unknown"}\nAgent: ${senderName || "the business's Bot"}\nSource: ${input.source}\nPurpose: ${input.purpose}\nRecipient: ${input.recipient || "Unknown"}\nContext: ${input.context || "None"}${input.ownerDecision ? `\n${ownerRulesBlock(input.ownerDecision.rules)}` : ""}\nSubject: ${originalSubject}\nBody:\n${originalBody}`,
    tool: input.ownerDecision ? reviewWithOwnerDecisionTool : reviewTool,
    complexity: "simple",
    maxTokens: reviewOutputTokenBudget(originalSubject, originalBody),
  });

  // Holding is always safe: nothing is sent. So the Bot's decision to ask is
  // honoured even when the review would also have blocked or rewritten the
  // message, and the owner sees what the Bot meant to say.
  if (input.ownerDecision && reviewed.needs_owner === true) {
    const reason = String(reviewed.owner_reason || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
    return {
      approved: false,
      subject: originalSubject,
      body: originalBody,
      rationale: reviewed.rationale || "Held for the owner.",
      ownerDecision: reason || "Your Bot was not sure you would want this sent without seeing it.",
    };
  }

  const finalBody = String(reviewed.body || "").trim();
  const fallbackSender = businessName || senderName;
  const finalSubject =
    String(reviewed.subject || originalSubject).trim() ||
    (input.channel === "email"
      ? fallbackSender
        ? `Follow-up from ${fallbackSender}`
        : "Follow-up"
      : "");

  if (!reviewed.approved || !finalBody) {
    throw new ClientCommunicationBlockedError(
      reviewed.rationale?.trim() || "The communication was not safe to send.",
    );
  }

  return {
    approved: true,
    subject: finalSubject,
    body: finalBody,
    rationale: reviewed.rationale || "Approved for delivery.",
  };
}
