import { runStructured } from "./ai-structured";
import type { StructuredToolSchema } from "./ai-structured";

export type ClientCommunicationReview = {
  approved: boolean;
  subject: string;
  body: string;
  rationale: string;
};

const reviewTool: StructuredToolSchema = {
  name: "review_client_communication",
  description: "Review and, only when necessary, revise a client-facing message. Preserve facts, avoid promises not supported by the supplied context, and keep the message concise.",
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
  const originalBody = String(input.body || "").slice(0, 12000);
  const originalSubject = String(input.subject || "").slice(0, 500);
  if (!originalBody.trim()) return { approved: false, subject: originalSubject, body: originalBody, rationale: "No message body was provided." };
  return runStructured<ClientCommunicationReview>({
    system: "You are Wireline's outbound communications safety and quality reviewer. Preserve the sender's intent and verified facts. Remove unsupported commitments, sensitive data, pressure, or unsafe claims. Return approved=true when the original is suitable; approved=false only when it needs revision or should not be sent.",
    user: `Channel: ${input.channel}\nAgent: ${input.agentName || "Wireline agent"}\nSource: ${input.source}\nPurpose: ${input.purpose}\nRecipient: ${input.recipient || "Unknown"}\nContext: ${input.context || "None"}\nSubject: ${originalSubject}\nBody:\n${originalBody}`,
    tool: reviewTool,
    complexity: "simple",
    maxTokens: 1200,
  });
}
