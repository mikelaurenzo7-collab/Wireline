import { log } from "./server-context";
import { isRuntimeAvailable } from "./ai-client";
import { runStructured, runCompletion, type StructuredToolSchema } from "./ai-structured";

export { withAuditCapture } from "./ai-audit";

/** True when any managed AI provider is configured. */
export const isBrainAvailable = isRuntimeAvailable;

export class KnowledgeIngestionUnavailableError extends Error {
  constructor() {
    super(
      "Knowledge ingestion from URLs and documents is temporarily unavailable. Add knowledge entries directly, or try again after the next platform update.",
    );
    this.name = "KnowledgeIngestionUnavailableError";
  }
}

const ROLE_ANALYSIS_GUIDANCE: Record<string, string> = {
  lead_qualifier:
    "This agent qualifies leads (BANT). Score higher when Budget, Authority, Need, and Timeline were all established. Score low if any pillar is missing. Note which BANT pillars were confirmed or absent.",
  scheduler:
    "This agent books appointments. Score higher when a booking was confirmed with a date, time, and confirmation ID. Note if the appointment was successfully booked, rescheduled, or failed.",
  collections:
    "This agent collects payments. Score higher when a payment commitment, arrangement, or promise-to-pay was obtained. Note amount and timeline if discussed.",
  sales:
    "This agent closes deals. Score higher when genuine interest, objection-handling, and a clear next step (demo, proposal, close) occurred.",
  technical_support:
    "This agent resolves technical issues. Score higher when the customer's problem was fully resolved or a concrete resolution path was set. Note resolution status.",
  marketing:
    "This agent runs outreach campaigns. Score higher when the prospect expressed interest, booked a demo, registered for an event, or agreed to a follow-up.",
  receptionist:
    "This agent routes calls and takes messages. Score higher when the caller was properly routed or a complete, accurate message was captured.",
  customer_service:
    "This agent handles support. Score higher when the customer's issue was resolved and satisfaction expressed. Note any unresolved items.",
};

const POST_CALL_ANALYSIS_TOOL: StructuredToolSchema = {
  name: "record_post_call_analysis",
  description:
    "Record the complete post-call analysis: lead score, intent, sentiment, lessons, action items, compliance flags, and knowledge gaps, all in one structured payload.",
  input_schema: {
    type: "object",
    properties: {
      lead_score: { type: "integer", minimum: 0, maximum: 100 },
      intent_label: { type: "string", enum: ["high", "medium", "low", "none"] },
      sentiment: {
        type: "string",
        enum: ["delighted", "positive", "neutral", "frustrated", "angry"],
      },
      lesson: {
        type: "string",
        description:
          "ONE specific tactical improvement for the agent based on this call. Empty string if no lesson worth promoting.",
      },
      action_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            target_channel: { type: "string", enum: ["email", "phone", "manual", "sms"] },
          },
          required: ["description", "priority", "target_channel"],
          additionalProperties: false,
        },
        description:
          "Follow-up tasks promised on the call or implied by the customer's request. Empty if nothing to do.",
      },
      compliance_flags: {
        type: "array",
        items: { type: "string" },
        description:
          "Potential regulatory or compliance issues (TCPA disclosure missed, GDPR data request, recording consent, refund-policy mismatch, etc).",
      },
      knowledge_gaps: {
        type: "array",
        items: { type: "string" },
        description:
          "Topics the agent could not answer authoritatively. Add these to the knowledge base.",
      },
      coaching_note: {
        type: "string",
        description: "One-sentence note for a human reviewer summarising performance.",
      },
    },
    required: [
      "lead_score",
      "intent_label",
      "sentiment",
      "lesson",
      "action_items",
      "compliance_flags",
      "knowledge_gaps",
      "coaching_note",
    ],
    additionalProperties: false,
  },
};

const BUSINESS_ACTIONS_TOOL: StructuredToolSchema = {
  name: "extract_business_actions",
  description:
    "Extract only concrete business actions promised or explicitly requested in the call. Do not invent dates, recipients, destinations, or permissions.",
  input_schema: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "send_email",
                "send_text_message",
                "schedule_calendar",
                "update_crm_lead",
                "create_internal_task",
              ],
            },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            reasoning: {
              type: "string",
              description: "Why this action is necessary based on explicit transcript evidence.",
            },
            payload: {
              type: "object",
              description:
                "Structured data for the action. send_email: {to, subject, body}. send_text_message: {to, body, channel}. schedule_calendar: {event_name, date, time, timezone, attendees}, where date is YYYY-MM-DD, time is 24-hour HH:mm, and timezone is a confirmed IANA zone such as America/Chicago. Never emit schedule_calendar when any of date, time, or timezone is unresolved; create an internal follow-up instead. update_crm_lead: {customer_number, status, notes}.",
            },
          },
          required: ["type", "priority", "payload", "reasoning"],
          additionalProperties: false,
        },
      },
    },
    required: ["actions"],
    additionalProperties: false,
  },
};

const QA_SCORE_TOOL: StructuredToolSchema = {
  name: "score_call_quality",
  description:
    "Score a call recording/transcript against a 5-dimension QA rubric. Each dimension is 0 to 20 points (total 0 to 100). Be precise and evidence-based. Cite specific moments in the transcript where the score was earned or lost.",
  input_schema: {
    type: "object",
    properties: {
      greeting: {
        type: "integer",
        minimum: 0,
        maximum: 20,
        description:
          "Opening & Greeting: professional, warm, identified company and purpose clearly.",
      },
      discovery: {
        type: "integer",
        minimum: 0,
        maximum: 20,
        description:
          "Problem Discovery: asked thoughtful open-ended questions, understood the customer's actual situation.",
      },
      solution: {
        type: "integer",
        minimum: 0,
        maximum: 20,
        description:
          "Solution Presentation: clear, relevant, directly addressed the customer's stated needs.",
      },
      objection: {
        type: "integer",
        minimum: 0,
        maximum: 20,
        description:
          "Objection Handling: handled pushback calmly, didn't oversell, addressed concerns with evidence.",
      },
      closing: {
        type: "integer",
        minimum: 0,
        maximum: 20,
        description:
          "Closing & Next Steps: strong close, set clear next steps or outcome, no ambiguity.",
      },
      coaching_note: {
        type: "string",
        description:
          "One sentence the operator should act on: the single highest-leverage improvement for this agent.",
      },
      strengths: {
        type: "array",
        items: { type: "string" },
        description: "1 to 3 specific things the agent did well on this call.",
      },
      improvements: {
        type: "array",
        items: { type: "string" },
        description: "1 to 3 specific, actionable improvements for next time.",
      },
    },
    required: ["greeting", "discovery", "solution", "objection", "closing", "coaching_note"],
    additionalProperties: false,
  },
};

export interface PostCallInput {
  agentName: string;
  archetype: string;
  role?: string;
  customerNumber?: string;
  durationSeconds?: number;
  summary: string;
  transcript: string;
}

export interface PostCallAnalysisResult {
  lead_score: number;
  intent_label: "high" | "medium" | "low" | "none";
  sentiment: "delighted" | "positive" | "neutral" | "frustrated" | "angry";
  lesson: string;
  action_items: Array<{
    description: string;
    priority: "high" | "medium" | "low";
    target_channel: "email" | "phone" | "manual" | "sms";
  }>;
  compliance_flags: string[];
  knowledge_gaps: string[];
  coaching_note: string;
}

export async function postCallAnalysis(input: PostCallInput): Promise<PostCallAnalysisResult> {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance)
      log.warn(`postCallAnalysis: unknown role "${input.role}", no scoring lens applied.`, {
        role: input.role,
      });
  }
  const system = `You are a senior call analyst delivering post-call enrichment for an autonomous agent on the Wireline relay. Be evidence-driven and concise:
- score lead intent honestly (0 to 100); if there's no signal, score low.
- extract ONE specific tactical lesson (or empty string if nothing worth promoting).
- list every concrete follow-up the agent promised or the customer asked for.
- flag compliance issues (recording consent, TCPA, GDPR, refund-policy mismatch, etc.).
- list topics the agent couldn't answer authoritatively (knowledge gaps).
${roleGuidance ? `\nRole-specific scoring lens: ${roleGuidance}` : ""}
Use plain English. No jargon, no ALL CAPS, no emoji.`;

  const user = `Agent: ${input.agentName} (archetype: ${input.archetype}${input.role ? `, role: ${input.role}` : ""})
Customer: ${input.customerNumber ?? "(unknown)"}${input.durationSeconds ? ` · ${input.durationSeconds}s` : ""}

--- SUMMARY ---
${input.summary || "(none)"}

--- TRANSCRIPT ---
${input.transcript || "(none)"}
--- END ---`;

  return runStructured<PostCallAnalysisResult>({
    system,
    user,
    tool: POST_CALL_ANALYSIS_TOOL,
    deepThink: true,
    cacheSystem: true,
    maxTokens: 4096,
    complexity: "complex",
  });
}

export interface QaScoreInput {
  direction: "inbound" | "outbound";
  agentRole?: string;
  summary: string;
  transcript: string;
  sentiment?: string;
  durationSeconds?: number;
}

export interface QaScoreResult {
  greeting: number;
  discovery: number;
  solution: number;
  objection: number;
  closing: number;
  coaching_note: string;
  strengths?: string[];
  improvements?: string[];
}

const QA_ROLE_GUIDANCE: Record<string, string> = {
  sales:
    "Sales context: weight discovery and closing heavily. A perfect call has 3+ discovery questions, a compelling pitch tied to the customer's stated pain, and an explicit next step. A failed close (no commitment) is a hard cap on the closing score.",
  lead_qualifier:
    "Lead qualifier context: discovery is the whole job. Score discovery and closing against BANT coverage (Budget, Authority, Need, Timeline). 'Closing' means a clear qualified/disqualified decision + handoff package.",
  collections:
    "Collections context: compliance is paramount. Any FDCPA/TCPA violation (no mini-Miranda, no identity verification, abusive language) → greeting score ≤ 5. Objection handling and payment resolution drive the rest.",
  scheduler:
    "Scheduler context: booking accuracy is the primary metric. A confirmed appointment with date/time/reference ID is a strong close. Failing to check availability before confirming is a critical error.",
  technical_support:
    "Support context: diagnostic rigor is paramount. Award discovery points for structured troubleshooting (one question at a time, systematic elimination). Closing is verified resolution, not just 'let me know if it happens again'.",
  customer_service:
    "Customer service context: emotional acknowledgment and resolution completeness matter most. Award discovery points for understanding the root issue (not just the surface complaint). Closing = customer confirmed satisfaction.",
  receptionist:
    "Receptionist context: routing accuracy and message completeness are everything. Score closing on whether the caller's need was fully addressed: message taken or correct transfer made.",
  marketing:
    "Marketing context: engagement and next-step conversion are the metrics. Score closing based on whether the prospect agreed to any concrete next step (demo, trial, callback). Disengaged exit with no next step = low closing score.",
};

export async function qaScore(input: QaScoreInput): Promise<QaScoreResult> {
  const roleGuidance = input.agentRole ? (QA_ROLE_GUIDANCE[input.agentRole] ?? "") : "";

  const system = `You are a call quality auditor for an enterprise voice AI platform. Evaluate calls objectively and with specificity. Cite concrete moments from the transcript when scoring.${roleGuidance ? `\n\n${roleGuidance}` : ""}`;

  const user = `Score this ${input.direction} call against the 5-dimension QA rubric.

Summary: ${input.summary || "(none)"}
Sentiment: ${input.sentiment || "neutral"}
Duration: ${input.durationSeconds ? Math.round(input.durationSeconds / 60) + " minutes" : "unknown"}
${input.agentRole ? `Agent role: ${input.agentRole.replace(/_/g, " ")}` : ""}

Transcript (up to 3000 chars):
${input.transcript ? input.transcript.slice(0, 3000) + (input.transcript.length > 3000 ? "…" : "") : "(not available)"}

Score each dimension 0 to 20 and provide a concise, actionable coaching note.`;

  return runStructured<QaScoreResult>({
    system,
    user,
    tool: QA_SCORE_TOOL,
    deepThink: false,
    cacheSystem: true,
    maxTokens: 512,
    complexity: "medium",
  });
}

export interface ExtractedBusinessAction {
  type:
    | "send_email"
    | "send_text_message"
    | "schedule_calendar"
    | "update_crm_lead"
    | "create_internal_task";
  priority: "high" | "medium" | "low";
  reasoning: string;
  payload: Record<string, unknown>;
}

export async function extractActions(params: {
  transcript: string;
  summary: string;
  customerNumber?: string;
}): Promise<ExtractedBusinessAction[]> {
  const result = await runStructured<{ actions: ExtractedBusinessAction[] }>({
    system:
      "You are the Wireline Action Engine. Extract only actions explicitly promised or requested. For calendar actions, emit schedule_calendar only when exact YYYY-MM-DD date, 24-hour HH:mm time, and a full IANA timezone are all supported by the call. Otherwise create an internal follow-up task. Never infer a recipient, destination, authorization, or material commitment.",
    user: `Transcript: ${params.transcript}\nSummary: ${params.summary}\nCustomer: ${params.customerNumber || "Unknown"}`,
    tool: BUSINESS_ACTIONS_TOOL,
    cacheSystem: true,
    complexity: "simple",
  });
  return result.actions;
}

export async function synthesizeLesson(params: {
  transcript: string;
  score: number;
  breakdown: unknown;
}): Promise<string> {
  const { text } = await runCompletion({
    system:
      "You are the Wireline Agent Coach. Synthesize ONE tactical lesson for the agent based on their failure. ≤30 words.",
    user: `Score: ${params.score}\nBreakdown: ${JSON.stringify(params.breakdown)}\nTranscript: ${params.transcript}`,
    cacheSystem: true,
    complexity: "medium",
  });
  return text.trim();
}

export interface KnowledgeFromUrlInput {
  url: string;
  agentContext?: string;
  maxEntries?: number;
  maxPages?: number;
}

export interface KnowledgeFromDocumentInput {
  pdfBase64: string;
  fileName?: string;
  agentContext?: string;
  maxEntries?: number;
}

export interface KnowledgeIngestionResult {
  page_summary: string;
  entries: Array<{ fact: string; category: string }>;
}

export async function knowledgeFromUrl(
  _input: KnowledgeFromUrlInput,
): Promise<KnowledgeIngestionResult> {
  throw new KnowledgeIngestionUnavailableError();
}

export async function knowledgeFromDocument(
  _input: KnowledgeFromDocumentInput,
): Promise<KnowledgeIngestionResult> {
  throw new KnowledgeIngestionUnavailableError();
}
