/**
 * Wireline Claude Brain
 * ---------------------------------------------------------------------------
 * Server-side helper that wraps the Anthropic SDK with the patterns this app
 * needs across every Claude-powered endpoint: prompt caching for the stable
 * agent persona+knowledge prefix, tool-use for structured JSON, and adaptive
 * thinking on the deep-analysis paths. All of this is centralized here so the
 * endpoints stay short and consistent.
 *
 * Default model: claude-opus-4-7 (current most-capable; adaptive thinking only).
 */

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-opus-4-7";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ClaudeUnavailableError();
    }
    _client = new Anthropic();
  }
  return _client;
}

export class ClaudeUnavailableError extends Error {
  status = 503;
  constructor() {
    super(
      "Claude Brain is offline — set ANTHROPIC_API_KEY to enable advanced features.",
    );
    this.name = "ClaudeUnavailableError";
  }
}

export function isClaudeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/* ────────────────────────────────────────────────────────────────────────
 *  Tool-call helpers — getting structured JSON out of Claude.
 *  We use tool-use rather than `output_config.format` because tool descriptions
 *  steer Claude better for these structured-extraction workloads.
 * ──────────────────────────────────────────────────────────────────── */

type ToolSchema = Anthropic.Tool;

interface StructuredOptions {
  system: string;
  user: string;
  tool: ToolSchema;
  /** Adds adaptive thinking + xhigh effort for tough analyses. */
  deepThink?: boolean;
  /** Marks `system` as the cacheable prefix. Recommended when system is
   *  large and re-used across calls (e.g. an agent's persona+knowledge). */
  cacheSystem?: boolean;
  model?: string;
  /** Whether the prefix changes per-request (skip caching if so). */
  maxTokens?: number;
}

/**
 * Run a single tool-call and return the parsed input. The tool is `tool_choice`
 * forced so Claude must produce a structured payload.
 */
export async function runStructured<T = any>(opts: StructuredOptions): Promise<T> {
  const client = getClient();
  const body: Anthropic.MessageCreateParams = {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.cacheSystem
      ? [
          {
            type: "text",
            text: opts.system,
            cache_control: { type: "ephemeral" },
          },
        ]
      : opts.system,
    tools: [opts.tool],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [{ role: "user", content: opts.user }],
  };

  if (opts.deepThink) {
    body.thinking = { type: "adaptive" };
    body.output_config = { effort: "high" };
  }

  const response = await client.messages.create(body);
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === opts.tool.name) {
      return block.input as T;
    }
  }
  throw new Error(
    `Claude returned no ${opts.tool.name} tool_use block (stop_reason=${response.stop_reason})`,
  );
}

/* ────────────────────────────────────────────────────────────────────────
 *  Plain text completion — for free-form generation (drafts, emails).
 * ──────────────────────────────────────────────────────────────────── */

interface CompletionOptions {
  system: string;
  user: string;
  cacheSystem?: boolean;
  model?: string;
  maxTokens?: number;
  /** When true, asks Claude for a structured response by example, but returns plain text. */
  prefill?: undefined;
}

export async function runCompletion(opts: CompletionOptions): Promise<{
  text: string;
  cacheRead: number;
  cacheCreate: number;
}> {
  const client = getClient();
  const response = await client.messages.create({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.cacheSystem
      ? [
          {
            type: "text",
            text: opts.system,
            cache_control: { type: "ephemeral" },
          },
        ]
      : opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  return {
    text,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
    cacheCreate: response.usage.cache_creation_input_tokens ?? 0,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 *  Pre-built tool schemas — one per recipe.
 * ──────────────────────────────────────────────────────────────────── */

export const TOOLS = {
  /** Pre-call briefing — what to lead with, what to anticipate, how to close. */
  brief: {
    name: "deliver_brief",
    description:
      "Deliver a tactical pre-call briefing for an outbound carrier signal.",
    input_schema: {
      type: "object",
      properties: {
        opening_line: {
          type: "string",
          description: "First sentence the agent should say (≤25 words).",
        },
        intent_hypothesis: {
          type: "string",
          description: "Best guess at why this lead matters / what they need.",
        },
        key_questions: {
          type: "array",
          items: { type: "string" },
          description: "3–5 questions to qualify the lead, in order of priority.",
        },
        objections_to_anticipate: {
          type: "array",
          items: {
            type: "object",
            properties: {
              objection: { type: "string" },
              response: { type: "string" },
            },
            required: ["objection", "response"],
            additionalProperties: false,
          },
          description: "2–4 likely objections + concise rebuttals.",
        },
        value_props: {
          type: "array",
          items: { type: "string" },
          description: "Top 2–3 value propositions to emphasize.",
        },
        closing_strategy: {
          type: "string",
          description: "How to land the meeting / next step.",
        },
        risk_flags: {
          type: "array",
          items: { type: "string" },
          description: "Anything to watch out for (compliance, escalation, etc.).",
        },
      },
      required: [
        "opening_line",
        "intent_hypothesis",
        "key_questions",
        "objections_to_anticipate",
        "value_props",
        "closing_strategy",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** BANT lead qualification — Budget, Authority, Need, Timeline. */
  qualify: {
    name: "score_qualification",
    description:
      "Score a lead against BANT (Budget / Authority / Need / Timeline) plus an aggregate score.",
    input_schema: {
      type: "object",
      properties: {
        budget: {
          type: "object",
          properties: {
            score: { type: "integer", minimum: 0, maximum: 100 },
            evidence: { type: "string" },
          },
          required: ["score", "evidence"],
          additionalProperties: false,
        },
        authority: {
          type: "object",
          properties: {
            score: { type: "integer", minimum: 0, maximum: 100 },
            evidence: { type: "string" },
          },
          required: ["score", "evidence"],
          additionalProperties: false,
        },
        need: {
          type: "object",
          properties: {
            score: { type: "integer", minimum: 0, maximum: 100 },
            evidence: { type: "string" },
          },
          required: ["score", "evidence"],
          additionalProperties: false,
        },
        timeline: {
          type: "object",
          properties: {
            score: { type: "integer", minimum: 0, maximum: 100 },
            evidence: { type: "string" },
          },
          required: ["score", "evidence"],
          additionalProperties: false,
        },
        total_score: { type: "integer", minimum: 0, maximum: 100 },
        qualification_label: {
          type: "string",
          enum: ["hot", "warm", "cool", "cold", "disqualified"],
        },
        recommended_next_step: { type: "string" },
        reasoning: { type: "string" },
      },
      required: [
        "budget",
        "authority",
        "need",
        "timeline",
        "total_score",
        "qualification_label",
        "recommended_next_step",
        "reasoning",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Objection-drill — practice scenarios for an agent. */
  objectionDrill: {
    name: "compose_drill",
    description:
      "Compose realistic objection-handling drills — scenario, prospect line, recommended agent response, and a coaching note.",
    input_schema: {
      type: "object",
      properties: {
        scenarios: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              prospect_says: { type: "string" },
              recommended_response: { type: "string" },
              coaching_note: { type: "string" },
              difficulty: {
                type: "string",
                enum: ["easy", "medium", "hard"],
              },
            },
            required: [
              "title",
              "prospect_says",
              "recommended_response",
              "coaching_note",
              "difficulty",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["scenarios"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Cold-email composer. */
  coldEmail: {
    name: "compose_cold_email",
    description: "Compose a cold-outreach email tailored to a lead.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Subject line (≤60 chars)." },
        body: { type: "string", description: "Email body (plain text, no signature)." },
        personalization_notes: {
          type: "array",
          items: { type: "string" },
          description: "Bullet list of which lead facts shaped the message.",
        },
        suggested_followup_date: {
          type: "string",
          description: "ISO date for follow-up if no reply (e.g. 2026-05-09).",
        },
      },
      required: ["subject", "body", "personalization_notes"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Persona cloning — convert sample messages into a personality block. */
  personaClone: {
    name: "compile_persona",
    description:
      "Distill a personality block from sample messages, capturing tone, do/don't rules, and a usable persona prompt.",
    input_schema: {
      type: "object",
      properties: {
        persona_block: {
          type: "string",
          description: "A self-contained personality block to drop into the agent's system prompt.",
        },
        tone_summary: { type: "string" },
        signature_phrases: {
          type: "array",
          items: { type: "string" },
        },
        do_rules: {
          type: "array",
          items: { type: "string" },
        },
        dont_rules: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "persona_block",
        "tone_summary",
        "signature_phrases",
        "do_rules",
        "dont_rules",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Email-thread summarizer with action items + sentiment. */
  threadSummary: {
    name: "summarize_thread",
    description:
      "Summarize an email thread, extracting key points, action items, sentiment, and recommended next step.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "1–2 sentence overall summary." },
        key_points: {
          type: "array",
          items: { type: "string" },
        },
        action_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              owner: {
                type: "string",
                enum: ["us", "customer"],
              },
              description: { type: "string" },
              due_hint: { type: "string" },
            },
            required: ["owner", "description"],
            additionalProperties: false,
          },
        },
        sentiment: {
          type: "string",
          enum: ["positive", "neutral", "frustrated", "angry", "delighted"],
        },
        urgency: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
        },
        recommended_next_step: { type: "string" },
      },
      required: [
        "summary",
        "key_points",
        "action_items",
        "sentiment",
        "urgency",
        "recommended_next_step",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Intent router — fast classification. */
  intent: {
    name: "route_intent",
    description: "Classify the message intent for routing.",
    input_schema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: [
            "sales_inquiry",
            "support_request",
            "billing_question",
            "appointment_booking",
            "complaint",
            "spam",
            "escalation",
            "general_info",
          ],
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        rationale: { type: "string" },
      },
      required: ["intent", "confidence", "rationale"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Deep agent performance review. */
  agentReview: {
    name: "deliver_review",
    description:
      "Deliver a deep performance review of an autonomous voice agent, with concrete tactical recommendations.",
    input_schema: {
      type: "object",
      properties: {
        overall_grade: {
          type: "string",
          enum: ["A+", "A", "B", "C", "D", "F"],
        },
        executive_summary: { type: "string" },
        strengths: {
          type: "array",
          items: { type: "string" },
        },
        weaknesses: {
          type: "array",
          items: { type: "string" },
        },
        suggested_directives: {
          type: "array",
          items: {
            type: "object",
            properties: {
              priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
              directive: { type: "string" },
              rationale: { type: "string" },
            },
            required: ["priority", "directive", "rationale"],
            additionalProperties: false,
          },
        },
        suggested_knowledge_entries: {
          type: "array",
          items: { type: "string" },
        },
        suggested_archetype: {
          type: "string",
          enum: ["Receptionist", "The Closer", "Support Tech", "The Empath"],
        },
        risk_alerts: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "overall_grade",
        "executive_summary",
        "strengths",
        "weaknesses",
        "suggested_directives",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,
} as const;

/* ────────────────────────────────────────────────────────────────────────
 *  Convenience wrappers — one per recipe.
 * ──────────────────────────────────────────────────────────────────── */

export interface BriefInput {
  agentName: string;
  agentArchetype: string;
  customerName?: string;
  customerNumber?: string;
  reasonForCall: string;
  knowledgeBase?: string[];
  pastInteractionSummary?: string;
}

export async function brief(input: BriefInput) {
  const system = `You are a senior tactical sales coach drafting a pre-call brief for an autonomous voice agent on the Wireline relay.

Agent: ${input.agentName} — Archetype: ${input.agentArchetype}.
Be terse, decisive, and tactical. Every recommendation must be specific. No generic platitudes. Use plain English (no jargon, no ALL CAPS, no emoji).

Knowledge base (use to ground every recommendation):
${(input.knowledgeBase ?? []).map((k) => `• ${k}`).join("\n") || "(none provided)"}`;

  const user = `Customer: ${input.customerName ?? "Unknown"} (${input.customerNumber ?? "no number"})
Reason for call: ${input.reasonForCall}
${input.pastInteractionSummary ? `Past interaction summary: ${input.pastInteractionSummary}` : ""}

Brief the agent for this call now.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.brief,
    deepThink: true,
    cacheSystem: true,
    maxTokens: 6144,
  });
}

export interface QualifyInput {
  source: "voice_call" | "email_thread";
  transcript: string;
  metadata?: Record<string, any>;
}

export async function qualify(input: QualifyInput) {
  const system = `You are a senior B2B sales qualification analyst. Score leads against BANT (Budget / Authority / Need / Timeline). Be evidence-driven — every score must reference a specific phrase or signal in the transcript. Be honest: if there's no evidence, score low. Aggregate score is the weighted average (Need 35%, Timeline 25%, Authority 20%, Budget 20%).`;

  const user = `Source: ${input.source}
${input.metadata ? `Metadata: ${JSON.stringify(input.metadata)}` : ""}

--- TRANSCRIPT ---
${input.transcript}
--- END ---

Qualify this lead now.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.qualify,
    deepThink: true,
    maxTokens: 4096,
  });
}

export interface ObjectionDrillInput {
  agentName: string;
  archetype: string;
  topic: string;
  count?: number;
}

export async function objectionDrill(input: ObjectionDrillInput) {
  const system = `You are a sales-coaching AI generating objection-handling drills for the autonomous agent "${input.agentName}" (archetype: ${input.archetype}). Make drills realistic, varied in difficulty, and tied to a recommended response that respects the archetype's tone. Coaching notes should explain *why* the response works.`;

  const user = `Topic: ${input.topic}
Generate ${input.count ?? 5} drills covering a range of difficulties.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.objectionDrill,
    maxTokens: 4096,
  });
}

export interface ColdEmailInput {
  leadName?: string;
  leadCompany?: string;
  leadRole?: string;
  leadHook?: string;
  ourCompany: string;
  valueProp: string;
  tone?: "warm" | "professional" | "punchy" | "consultative";
  callToAction?: string;
}

export async function coldEmail(input: ColdEmailInput) {
  const system = `You are an elite cold-outreach copywriter. Write emails that get replies. Rules:
- Subject line: 4–7 words, no clickbait, hint at value.
- Body: ≤120 words, three short paragraphs max.
- Open with personalization, not "I hope this finds you well".
- One clear call-to-action.
- Plain text only. No markdown.
- Tone: ${input.tone ?? "professional"}.`;

  const user = `Lead: ${input.leadName ?? "(unknown)"} — ${input.leadRole ?? ""} at ${input.leadCompany ?? "(unknown)"}.
Lead hook (specific reason to reach out): ${input.leadHook ?? "(none — write a generic-but-strong opener)"}.
Our company: ${input.ourCompany}.
Value prop: ${input.valueProp}.
CTA: ${input.callToAction ?? "ask for a 15-minute intro call"}.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.coldEmail,
    maxTokens: 2048,
  });
}

export interface PersonaCloneInput {
  description: string;
  samples: string[];
}

export async function personaClone(input: PersonaCloneInput) {
  const system = `You are a voice-cloning prompt engineer. Given samples of how a real person communicates, distill them into a personality block that can drop directly into an LLM's system prompt. Capture tone, cadence, signature phrases, and explicit do/don't rules. Be specific — the resulting persona block must be usable verbatim.`;

  const user = `Person description: ${input.description}

Samples:
${input.samples.map((s, i) => `[Sample ${i + 1}]\n${s}`).join("\n\n")}

Produce the persona now.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.personaClone,
    deepThink: true,
    maxTokens: 4096,
  });
}

export interface ThreadSummaryInput {
  subject: string;
  messages: Array<{ role: string; content: string }>;
}

export async function threadSummary(input: ThreadSummaryInput) {
  const system = `You are an executive assistant summarizing email threads for a busy operator. Be ruthlessly concise. Extract action items with explicit owners. If urgency or sentiment is unclear, mark them honestly.`;

  const user = `Subject: ${input.subject}

${input.messages
  .map((m, i) => `[${i + 1}] ${m.role.toUpperCase()}\n${m.content}`)
  .join("\n\n")}

Summarize now.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.threadSummary,
    maxTokens: 3072,
  });
}

export interface IntentInput {
  text: string;
}

export async function routeIntent(input: IntentInput) {
  return runStructured({
    system: `You classify customer messages into intents for routing. Be decisive. If uncertain between two, pick the more actionable one and lower confidence accordingly.`,
    user: input.text,
    tool: TOOLS.intent,
    maxTokens: 1024,
  });
}

export interface AgentReviewInput {
  agentName: string;
  archetype: string;
  callLogs: Array<{ summary: string; transcript?: string; lead_score?: number; intent_label?: string }>;
}

export async function agentReview(input: AgentReviewInput) {
  const system = `You are a senior fleet operator reviewing the performance of an autonomous voice agent. Use evidence from the call logs. Be specific, tactical, and willing to be critical. Recommended directives should be concrete instructions the agent can immediately follow — not vague advice. Knowledge entries should be facts/policies that prevent recurring failures.`;

  const user = `Agent: ${input.agentName} (archetype: ${input.archetype})

--- LAST ${input.callLogs.length} CALLS ---
${input.callLogs
  .map(
    (l, i) =>
      `Call ${i + 1}${l.lead_score !== undefined ? ` [score ${l.lead_score}, ${l.intent_label ?? "?"}]` : ""}\nSummary: ${l.summary}${
        l.transcript ? `\nTranscript: ${l.transcript.slice(0, 1500)}${l.transcript.length > 1500 ? "…" : ""}` : ""
      }`,
  )
  .join("\n\n")}
--- END ---

Deliver the review now.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.agentReview,
    deepThink: true,
    maxTokens: 8192,
  });
}

export interface SmartDraftInput {
  agentName: string;
  agentTone: string;
  agentSignature?: string;
  knowledgeBase: string[];
  directives: string[];
  threadSubject: string;
  threadMessages: Array<{ role: string; content: string }>;
  userInstructions?: string;
}

export async function smartDraft(input: SmartDraftInput) {
  // Stable cacheable prefix: persona + knowledge + directives.
  // Volatile suffix: thread + user instructions.
  const system = `## IDENTITY
You are ${input.agentName}, an autonomous email agent for the company.
Tone: ${input.agentTone}.

## ABSOLUTE RULES
${input.directives.length ? input.directives.map((d) => `- ${d}`).join("\n") : "(none — exercise good judgment)"}

## KNOWLEDGE BASE
${input.knowledgeBase.length ? input.knowledgeBase.map((k) => `- ${k}`).join("\n") : "(none — be conservative; never invent prices, dates, or policies)"}

## STYLE GUARDRAILS
- Plain text only. No markdown.
- ≤120 words unless the customer's question genuinely demands more.
- Acknowledge the customer's actual question; don't preamble.
- Never invent facts that aren't in the knowledge base — say "I'll check with the team" instead.`;

  const user = `Subject: ${input.threadSubject}

THREAD:
${input.threadMessages
  .map((m, i) => `[${i + 1}] ${m.role.toUpperCase()}\n${m.content}`)
  .join("\n\n")}

${input.userInstructions ? `OPERATOR INSTRUCTIONS: ${input.userInstructions}` : "Draft a reply that advances the conversation."}

Output the email body only — no subject, no signature.`;

  const result = await runCompletion({
    system,
    user,
    cacheSystem: true,
    maxTokens: 2048,
  });

  const body = input.agentSignature
    ? `${result.text.trim()}\n\n${input.agentSignature}`
    : result.text.trim();

  return {
    draft: body,
    cacheRead: result.cacheRead,
    cacheCreate: result.cacheCreate,
  };
}
