import { runStructured } from "./ai-structured";
import type { StructuredToolSchema } from "./ai-structured";

export type ClientCommunicationReview = {
  approved: boolean;
  subject: string;
  body: string;
  rationale: string;
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
}): Promise<ClientCommunicationReview> {
  validateRecipient(input.channel, input.recipient);

  const originalBody = String(input.body || "").slice(0, 12000);
  const originalSubject = String(input.subject || "").slice(0, 500);
  if (!originalBody.trim()) {
    throw new ClientCommunicationBlockedError("No message body was provided.");
  }

  const senderName = clientFacingAgentName(input.agentName);
  const businessName = clientFacingAgentName(input.businessName);
  const reviewed = await runStructured<ClientCommunicationReview>({
    system:
      "You are BotBound's outbound communications safety and quality reviewer. Preserve the sender's intent and verified facts. Remove unsupported commitments, sensitive data, pressure, or unsafe claims. Return approved=true whenever the SUBJECT AND BODY YOU RETURN are safe and ready to send, including when you revised the original. Return approved=false only when the communication must be blocked because it cannot be safely repaired without inventing facts, authority, consent, or commitments. The message is sent by the business named below, not by BotBound: do not add a signature or sign-off (one is appended automatically), and do not mention BotBound, AI models, or internal systems unless the original does.",
    user: `Channel: ${input.channel}\nBusiness: ${businessName || "Unknown"}\nAgent: ${senderName || "the business's Bot"}\nSource: ${input.source}\nPurpose: ${input.purpose}\nRecipient: ${input.recipient || "Unknown"}\nContext: ${input.context || "None"}\nSubject: ${originalSubject}\nBody:\n${originalBody}`,
    tool: reviewTool,
    complexity: "simple",
    maxTokens: reviewOutputTokenBudget(originalSubject, originalBody),
  });

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
