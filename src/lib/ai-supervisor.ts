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

export async function superviseClientCommunication(input: {
  channel: "email" | "sms" | "whatsapp";
  agentName?: string | null;
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

  const reviewed = await runStructured<ClientCommunicationReview>({
    system:
      "You are Wireline's outbound communications safety and quality reviewer. Preserve the sender's intent and verified facts. Remove unsupported commitments, sensitive data, pressure, or unsafe claims. Return approved=true whenever the SUBJECT AND BODY YOU RETURN are safe and ready to send, including when you revised the original. Return approved=false only when the communication must be blocked because it cannot be safely repaired without inventing facts, authority, consent, or commitments.",
    user: `Channel: ${input.channel}\nAgent: ${input.agentName || "Wireline agent"}\nSource: ${input.source}\nPurpose: ${input.purpose}\nRecipient: ${input.recipient || "Unknown"}\nContext: ${input.context || "None"}\nSubject: ${originalSubject}\nBody:\n${originalBody}`,
    tool: reviewTool,
    complexity: "simple",
    maxTokens: 1200,
  });

  const finalBody = String(reviewed.body || "").trim();
  const finalSubject =
    String(reviewed.subject || originalSubject).trim() ||
    (input.channel === "email" ? `Follow-up from ${input.agentName || "Wireline"}` : "");

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
