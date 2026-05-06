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
import { AsyncLocalStorage } from "node:async_hooks";

const DEFAULT_MODEL = "claude-opus-4-7";

/* ────────────────────────────────────────────────────────────────────────
 *  Audit capture — every Claude API round trip pushes its meta into the
 *  active AsyncLocalStorage context (if any). Endpoints wrap their work
 *  with `withAuditCapture` to collect the records, then flush them to
 *  wireline_audit_log. Zero-cost when no context is active.
 * ──────────────────────────────────────────────────────────────────── */

export interface ClaudeCallMeta {
  model: string;
  provider: "anthropic";
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
  latency_ms: number;
}

export interface AuditContext { records: ClaudeCallMeta[]; }
const auditCtx = new AsyncLocalStorage<AuditContext>();

/** Capture all Claude usage performed inside `fn`, then return it. */
export async function withAuditCapture<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; records: ClaudeCallMeta[] }> {
  const ctx: AuditContext = { records: [] };
  return new Promise((resolve, reject) => {
    auditCtx.run(ctx, async () => {
      try {
        const result = await fn();
        resolve({ result, records: ctx.records });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/** Lower-level helpers for express middleware use. The middleware
 *  creates a context BEFORE the route handler runs and flushes the
 *  records on `res.on('finish')`. */
export function createAuditContext(): AuditContext { return { records: [] }; }
export function runInAuditContext<T>(ctx: AuditContext, fn: () => T): T {
  return auditCtx.run(ctx, fn);
}

/** Estimate cost in USD from Anthropic usage. Defaults to Opus 4.7 pricing.
 *  Sonnet 4.6 / Haiku 4.5 have different rates; pass the model to scale. */
export function estimateCost(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}, model: string = DEFAULT_MODEL): number {
  const rates = (() => {
    if (model.includes("haiku")) return { in: 1, out: 5 };
    if (model.includes("sonnet")) return { in: 3, out: 15 };
    return { in: 5, out: 25 }; // Opus 4.x
  })();
  const cacheRead = rates.in * 0.10;   // ~10% of input
  const cacheWrite = rates.in * 1.25;  // 1.25x of input (5-min TTL)
  const total =
    (usage.input_tokens || 0) * rates.in +
    (usage.output_tokens || 0) * rates.out +
    (usage.cache_read_input_tokens || 0) * cacheRead +
    (usage.cache_creation_input_tokens || 0) * cacheWrite;
  return total / 1_000_000;
}

function recordUsage(model: string, response: { usage: any }, latencyMs: number) {
  const ctx = auditCtx.getStore();
  if (!ctx) return;
  ctx.records.push({
    model,
    provider: "anthropic",
    input_tokens: response.usage?.input_tokens ?? 0,
    output_tokens: response.usage?.output_tokens ?? 0,
    cache_read_tokens: response.usage?.cache_read_input_tokens ?? 0,
    cache_create_tokens: response.usage?.cache_creation_input_tokens ?? 0,
    latency_ms: latencyMs,
  });
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ClaudeUnavailableError();
    }
    // Per-request timeout: a stalled Anthropic call would otherwise tie up
    // an Express handler indefinitely. 120s is long enough for adaptive
    // thinking on the deep-analysis paths, short enough to fail fast on
    // network blips. The SDK retries idempotent failures up to maxRetries
    // within that budget.
    _client = new Anthropic({
      timeout: 120_000,
      maxRetries: 2,
    });
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

  const t0 = Date.now();
  const response = await client.messages.create(body);
  recordUsage(opts.model ?? DEFAULT_MODEL, response, Date.now() - t0);
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
  const model = opts.model ?? DEFAULT_MODEL;
  const t0 = Date.now();
  const response = await client.messages.create({
    model,
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
  recordUsage(model, response, Date.now() - t0);
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

  /** Single-pass post-call analysis — replaces 3 separate Gemini calls. */
  postCallAnalysis: {
    name: "record_post_call_analysis",
    description:
      "Record the complete post-call analysis: lead score, intent, sentiment, lessons, action items, compliance flags, and knowledge gaps — all in one structured payload.",
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
              target_channel: {
                type: "string",
                enum: ["email", "phone", "manual"],
              },
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
            "Topics the agent could not answer authoritatively — should be added to the knowledge base.",
        },
        coaching_note: {
          type: "string",
          description:
            "One-sentence note for a human reviewer summarising performance.",
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
  } as ToolSchema,

  /** Live in-call coach — looks at a partial/full transcript and tells the operator what to do next. */
  coach: {
    name: "deliver_live_coaching",
    description:
      "Deliver real-time coaching for an in-progress or completed call. Identify what is working, what is at risk, and what the agent should say next.",
    input_schema: {
      type: "object",
      properties: {
        sentiment: {
          type: "string",
          enum: ["delighted", "positive", "neutral", "frustrated", "angry"],
        },
        engagement: {
          type: "string",
          enum: ["high", "medium", "low", "disengaged"],
        },
        escalation_risk: {
          type: "string",
          enum: ["none", "low", "medium", "high", "imminent"],
        },
        whats_working: { type: "array", items: { type: "string" } },
        whats_at_risk: { type: "array", items: { type: "string" } },
        missed_opportunities: { type: "array", items: { type: "string" } },
        suggested_next_words: {
          type: "string",
          description:
            "What the agent should say next, written verbatim. ≤30 words.",
        },
        compliance_alerts: { type: "array", items: { type: "string" } },
      },
      required: [
        "sentiment",
        "engagement",
        "escalation_risk",
        "whats_working",
        "whats_at_risk",
        "missed_opportunities",
        "suggested_next_words",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Agent Forge — synthesize a full agent design from a goal. */
  agentForge: {
    name: "design_complete_agent",
    description:
      "Design a complete autonomous voice/email agent given a goal: name, archetype, first message, personality block, directives, and seed knowledge.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        archetype: {
          type: "string",
          enum: ["Receptionist", "The Closer", "Support Tech", "The Empath"],
        },
        first_message: {
          type: "string",
          description: "What the agent says when answering or starting a call. ≤25 words.",
        },
        personality_block: {
          type: "string",
          description:
            "A self-contained personality block to drop into the agent's system prompt.",
        },
        suggested_voice_tone: { type: "string" },
        directives: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string" },
              priority: { type: "integer", minimum: 1, maximum: 10 },
            },
            required: ["content", "priority"],
            additionalProperties: false,
          },
          description: "5–8 absolute rules / tactical directives.",
        },
        seed_knowledge: {
          type: "array",
          items: { type: "string" },
          description:
            "5–10 atomic knowledge entries the agent needs to do its job. If specific facts aren't known, write them as TODO placeholders the operator can fill in.",
        },
        success_metrics: {
          type: "array",
          items: { type: "string" },
          description: "How the operator will know this agent is working.",
        },
        reasoning: { type: "string" },
      },
      required: [
        "name",
        "archetype",
        "first_message",
        "personality_block",
        "directives",
        "seed_knowledge",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Daily executive brief — Claude's morning take. */
  dailyBrief: {
    name: "deliver_daily_brief",
    description:
      "Deliver a concise executive brief summarizing the previous day's agent activity for an SMB owner.",
    input_schema: {
      type: "object",
      properties: {
        headline: { type: "string", description: "≤14 words. The day's story in one line." },
        mood: { type: "string", enum: ["green", "yellow", "red"] },
        key_metrics_takeaway: { type: "string", description: "1–2 sentences interpreting the headline numbers." },
        highlights: {
          type: "array",
          items: { type: "string" },
          description: "Wins, breakthroughs, surprises (2–4 items).",
        },
        concerns: {
          type: "array",
          items: { type: "string" },
          description: "Risks, regressions, things to watch (0–4 items).",
        },
        action_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              urgency: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["description", "urgency"],
            additionalProperties: false,
          },
          description: "Concrete things the operator should do today (1–4 items).",
        },
      },
      required: [
        "headline",
        "mood",
        "key_metrics_takeaway",
        "highlights",
        "concerns",
        "action_items",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Topic clustering across recent transcripts/summaries. */
  topicClusters: {
    name: "cluster_topics",
    description:
      "Cluster the recent calls/emails into a small set of meaningful topics with counts and example quotes.",
    input_schema: {
      type: "object",
      properties: {
        topics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Short topic name (≤4 words)." },
              count: { type: "integer", minimum: 1 },
              category: {
                type: "string",
                enum: [
                  "sales",
                  "support",
                  "complaint",
                  "info",
                  "billing",
                  "appointment",
                  "other",
                ],
              },
              example_quote: { type: "string" },
              trend: {
                type: "string",
                enum: ["new", "growing", "steady", "declining"],
              },
            },
            required: ["name", "count", "category", "example_quote"],
            additionalProperties: false,
          },
        },
        total_analyzed: { type: "integer", minimum: 0 },
      },
      required: ["topics", "total_analyzed"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Failure-mode clustering across low-score / escalated calls. */
  failureModes: {
    name: "cluster_failure_modes",
    description:
      "Cluster reasons calls fail (low intent, escalations, knowledge gaps, transfer requests) and recommend a fix per cluster.",
    input_schema: {
      type: "object",
      properties: {
        modes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              failure_type: { type: "string", description: "Short name (≤6 words)." },
              count: { type: "integer", minimum: 1 },
              severity: {
                type: "string",
                enum: ["critical", "high", "medium", "low"],
              },
              description: { type: "string" },
              recommended_fix: { type: "string" },
              fix_target: {
                type: "string",
                enum: ["directive", "knowledge", "personality", "process", "other"],
              },
            },
            required: [
              "failure_type",
              "count",
              "severity",
              "description",
              "recommended_fix",
              "fix_target",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["modes"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Knowledge dedupe — clusters near-duplicate facts across an
   *  operator's agents and recommends a canonical version per cluster.
   *  Each item references the input fact's `id` so the UI / server can
   *  apply the keep/delete decision via the existing CRUD endpoints. */
  knowledgeDedupe: {
    name: "cluster_knowledge_duplicates",
    description:
      "Find clusters of near-duplicate or contradictory knowledge facts. Use the input ids verbatim. Skip facts that have no plausible duplicates.",
    input_schema: {
      type: "object",
      properties: {
        clusters: {
          type: "array",
          description:
            "Groups of 2+ facts that say the same thing or contradict each other. Don't include singletons. Don't repeat ids across clusters.",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["duplicate", "near_duplicate", "contradiction"],
                description:
                  "duplicate = essentially identical wording. near_duplicate = same fact, different phrasing. contradiction = facts disagree.",
              },
              reason: {
                type: "string",
                description: "1-sentence explanation of why these belong together.",
              },
              recommended_keep_id: {
                type: "integer",
                description:
                  "Which fact id to keep (most accurate / clearest). MUST be one of the ids in this cluster.",
              },
              suggested_canonical_content: {
                type: "string",
                description:
                  "Optional improved version that consolidates the cluster. Operator can choose to apply this as an edit to the kept fact.",
              },
              members: {
                type: "array",
                minItems: 2,
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    note: {
                      type: "string",
                      description:
                        "Brief note about this specific member — e.g. 'redundant', 'older phrasing', 'contradicts the others on price'.",
                    },
                  },
                  required: ["id"],
                  additionalProperties: false,
                },
              },
            },
            required: ["kind", "reason", "recommended_keep_id", "members"],
            additionalProperties: false,
          },
        },
        total_analyzed: { type: "integer", minimum: 0 },
      },
      required: ["clusters", "total_analyzed"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Pre-call lead enrichment — Claude searches the web before the
   *  operator dials, returns identity + relevance + hooks. Pairs with
   *  the web_search server tool in messages.create. */
  enrichLead: {
    name: "deliver_lead_enrichment",
    description:
      "Deliver the structured pre-call enrichment after web-searching. Be honest about confidence — low is fine when the data is thin.",
    input_schema: {
      type: "object",
      properties: {
        research_confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "high = found specific person + employer on a reputable source. medium = likely match. low = couldn't pin down.",
        },
        identity_summary: {
          type: "string",
          description: "1-2 sentence working hypothesis for who this is. If confidence is low, say so.",
        },
        company_name: { type: "string" },
        role: { type: "string", description: "Job title or function." },
        industry: { type: "string" },
        company_size: {
          type: "string",
          description: "e.g. '11-50 employees', 'Fortune 500', 'mom-and-pop', 'unknown'.",
        },
        recent_signals: {
          type: "array",
          items: { type: "string" },
          description: "Notable recent activity — funding, press, hiring, product launches, layoffs. Empty array if none found.",
        },
        conversation_hooks: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
          description: "3-5 specific things to mention to build rapport or relevance. Always at least one.",
        },
        likely_objections: {
          type: "array",
          items: { type: "string" },
          description: "2-3 objections this person might raise based on role/industry. Empty array if confidence is too low to guess.",
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "Up to 6 source URLs that informed this enrichment. Empty if no sources used.",
        },
      },
      required: [
        "research_confidence",
        "identity_summary",
        "conversation_hooks",
        "likely_objections",
        "recent_signals",
        "sources",
      ],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Used by the URL-based knowledge ingestion path. */
  knowledgeFromUrl: {
    name: "deliver_knowledge_entries",
    description:
      "After fetching the page, deliver atomic knowledge entries the agent can use.",
    input_schema: {
      type: "object",
      properties: {
        page_summary: { type: "string" },
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fact: { type: "string" },
              category: {
                type: "string",
                enum: [
                  "service",
                  "pricing",
                  "hours",
                  "contact",
                  "policy",
                  "faq",
                  "general",
                ],
              },
            },
            required: ["fact", "category"],
            additionalProperties: false,
          },
        },
      },
      required: ["page_summary", "entries"],
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

  /** Quick email reply suggestions — 3 short, ready-to-send reply options. */
  quickReplies: {
    name: "deliver_quick_replies",
    description: "Deliver 3 short, distinct, ready-to-send email reply options for the latest customer message.",
    input_schema: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          description: "Exactly 3 reply options.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short 2-4 word action label shown as a chip (e.g. 'Confirm & proceed')." },
              body: { type: "string", description: "Complete email body, ≤60 words, plain text, no placeholders." },
            },
            required: ["label", "body"],
            additionalProperties: false,
          },
          minItems: 3,
          maxItems: 3,
        },
      },
      required: ["suggestions"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Call quality scoring — 5 dimensions × 20 pts = 100 total. */
  qaScore: {
    name: "score_call_quality",
    description:
      "Score a call recording/transcript against a 5-dimension QA rubric. Each dimension is 0–20 points (total 0–100). Be precise and evidence-based — cite specific moments in the transcript where the score was earned or lost.",
    input_schema: {
      type: "object",
      properties: {
        greeting: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description: "Opening & Greeting — professional, warm, identified company and purpose clearly.",
        },
        discovery: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description: "Problem Discovery — asked thoughtful open-ended questions, understood the customer's actual situation.",
        },
        solution: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description: "Solution Presentation — clear, relevant, directly addressed the customer's stated needs.",
        },
        objection: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description: "Objection Handling — handled pushback calmly, didn't oversell, addressed concerns with evidence.",
        },
        closing: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description: "Closing & Next Steps — strong close, set clear next steps or outcome, no ambiguity.",
        },
        coaching_note: {
          type: "string",
          description: "One sentence the operator should act on — the single highest-leverage improvement for this agent.",
        },
        strengths: {
          type: "array",
          items: { type: "string" },
          description: "1–3 specific things the agent did well on this call.",
        },
        improvements: {
          type: "array",
          items: { type: "string" },
          description: "1–3 specific, actionable improvements for next time.",
        },
      },
      required: ["greeting", "discovery", "solution", "objection", "closing", "coaching_note"],
      additionalProperties: false,
    },
  } as ToolSchema,

  /** Call playbook — branching script for a role + scenario. */
  callPlaybook: {
    name: "build_call_playbook",
    description:
      "Build a complete call playbook for an agent role and scenario: opening hook, discovery questions, value prop delivery, objection handlers, closing variants, and a voicemail script. Make every line ready to say verbatim.",
    input_schema: {
      type: "object",
      properties: {
        opening_hook: {
          type: "string",
          description: "The exact words the agent should say when the call connects (≤25 words). Warm, specific, and professional.",
        },
        purpose_statement: {
          type: "string",
          description: "One sentence explaining the call's purpose after the greeting (≤20 words).",
        },
        discovery_questions: {
          type: "array",
          description: "4–6 open-ended questions to uncover needs, in order of priority.",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The exact question to ask." },
              intent: { type: "string", description: "What this question is designed to uncover (≤10 words)." },
              follow_up: { type: "string", description: "A natural follow-up if the answer is vague (≤15 words)." },
            },
            required: ["question", "intent"],
            additionalProperties: false,
          },
        },
        value_prop_script: {
          type: "string",
          description: "The core value proposition delivered in 2–3 sentences. Outcome-first, proof point included.",
        },
        objection_handlers: {
          type: "array",
          description: "Top 4 objections with a scripted response for each.",
          items: {
            type: "object",
            properties: {
              objection: { type: "string", description: "Exact words or paraphrase of the objection." },
              response: { type: "string", description: "Complete scripted response (2–4 sentences)." },
              technique: {
                type: "string",
                enum: ["acknowledge_redirect", "reframe_roi", "social_proof", "feel_felt_found", "clarifying_question"],
              },
            },
            required: ["objection", "response", "technique"],
            additionalProperties: false,
          },
        },
        closing_variants: {
          type: "array",
          description: "3 closing scripts — assumptive, alternative-choice, and soft ask.",
          items: {
            type: "object",
            properties: {
              style: {
                type: "string",
                enum: ["assumptive", "alternative_choice", "soft_ask"],
              },
              script: { type: "string", description: "Complete closing line (≤30 words)." },
            },
            required: ["style", "script"],
            additionalProperties: false,
          },
          minItems: 3,
          maxItems: 3,
        },
        voicemail_script: {
          type: "string",
          description: "A 15–20 second voicemail script (spoken aloud) for when nobody answers. Includes name, company, reason, callback number placeholder.",
        },
        success_criteria: {
          type: "string",
          description: "What a 'win' looks like on this type of call in one sentence.",
        },
      },
      required: [
        "opening_hook",
        "purpose_statement",
        "discovery_questions",
        "value_prop_script",
        "objection_handlers",
        "closing_variants",
        "voicemail_script",
        "success_criteria",
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
  role?: string;
  customerName?: string;
  customerNumber?: string;
  reasonForCall: string;
  knowledgeBase?: string[];
  pastInteractionSummary?: string;
}

export async function brief(input: BriefInput) {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance) console.warn(`[claude-brain] brief: unknown role "${input.role}" — no role lens applied.`);
  }
  const system = `You are a senior tactical sales coach drafting a pre-call brief for an autonomous voice agent on the Wireline relay.

Agent: ${input.agentName} — Archetype: ${input.agentArchetype}${input.role ? ` — Role: ${input.role}` : ""}.
Be terse, decisive, and tactical. Every recommendation must be specific. No generic platitudes. Use plain English (no jargon, no ALL CAPS, no emoji).${roleGuidance ? `\n\nRole-specific brief lens — ${roleGuidance} The opening line, key questions, and objections you anticipate must reflect what this role actually faces on calls.` : ""}

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
  role?: string;
}

export async function qualify(input: QualifyInput) {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance) console.warn(`[claude-brain] qualify: unknown role "${input.role}" — no role lens applied.`);
  }
  const system = `You are a senior B2B sales qualification analyst. Score leads against BANT (Budget / Authority / Need / Timeline). Be evidence-driven — every score must reference a specific phrase or signal in the transcript. Be honest: if there's no evidence, score low. Aggregate score is the weighted average (Need 35%, Timeline 25%, Authority 20%, Budget 20%).${roleGuidance ? `\n\nRole-specific qualification lens — ${roleGuidance}` : ""}`;

  const user = `Source: ${input.source}${input.role ? ` · agent role: ${input.role}` : ""}
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
  role?: string;
  topic: string;
  count?: number;
}

export async function objectionDrill(input: ObjectionDrillInput) {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance) console.warn(`[claude-brain] objectionDrill: unknown role "${input.role}" — no role lens applied.`);
  }
  const system = `You are a sales-coaching AI generating objection-handling drills for the autonomous agent "${input.agentName}" (archetype: ${input.archetype}${input.role ? `, role: ${input.role}` : ""}). Make drills realistic, varied in difficulty, and tied to a recommended response that respects the archetype's tone. Coaching notes should explain *why* the response works.${roleGuidance ? `\n\nRole-specific drill lens — ${roleGuidance} Drills should reflect the objections, edge cases, and compliance pitfalls this role actually encounters.` : ""}`;

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
  agentRole?: string;
}

export async function coldEmail(input: ColdEmailInput) {
  let roleGuidance = "";
  if (input.agentRole) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.agentRole] ?? "";
    if (!roleGuidance) console.warn(`[claude-brain] coldEmail: unknown role "${input.agentRole}" — no role lens applied.`);
  }
  const system = `You are an elite cold-outreach copywriter. Write emails that get replies. Rules:
- Subject line: 4–7 words, no clickbait, hint at value.
- Body: ≤120 words, three short paragraphs max.
- Open with personalization, not "I hope this finds you well".
- One clear call-to-action.
- Plain text only. No markdown.
- Tone: ${input.tone ?? "professional"}.${roleGuidance ? `\n\nSending agent role — ${roleGuidance} The body, hook, and CTA must reflect what this role actually pursues; do not pitch outside its mandate.` : ""}`;

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
  role?: string;
  callLogs: Array<{ summary: string; transcript?: string; lead_score?: number; intent_label?: string }>;
}

export async function agentReview(input: AgentReviewInput) {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance) console.warn(`[claude-brain] agentReview: unknown role "${input.role}" — no role lens applied.`);
  }
  const system = `You are a senior fleet operator reviewing the performance of an autonomous voice agent. Use evidence from the call logs. Be specific, tactical, and willing to be critical. Recommended directives should be concrete instructions the agent can immediately follow — not vague advice. Knowledge entries should be facts/policies that prevent recurring failures.${roleGuidance ? `\n\nRole-specific review lens — ${roleGuidance}` : ""}`;

  const user = `Agent: ${input.agentName} (archetype: ${input.archetype}${input.role ? `, role: ${input.role}` : ""})

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
  agentRole?: string;
  agentSignature?: string;
  knowledgeBase: string[];
  directives: string[];
  threadSubject: string;
  threadMessages: Array<{ role: string; content: string }>;
  userInstructions?: string;
}

export async function smartDraft(input: SmartDraftInput) {
  let roleGuidance = "";
  if (input.agentRole) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.agentRole] ?? "";
    if (!roleGuidance) console.warn(`[claude-brain] smartDraft: unknown role "${input.agentRole}" — no role lens applied.`);
  }
  // Stable cacheable prefix: persona + knowledge + directives.
  // Volatile suffix: thread + user instructions.
  const system = `## IDENTITY
You are ${input.agentName}, an autonomous email agent for the company.
Tone: ${input.agentTone}.${input.agentRole ? `\nRole: ${input.agentRole}.${roleGuidance ? ` ${roleGuidance}` : ""}` : ""}

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

/* ────────────────────────────────────────────────────────────────────────
 *  Single-pass post-call analysis — replaces the 3 Gemini calls in the
 *  vapi webhook with one Claude tool-call returning everything at once.
 * ──────────────────────────────────────────────────────────────────── */

// Role-specific scoring lenses applied on top of the generic analysis prompt.
const ROLE_ANALYSIS_GUIDANCE: Record<string, string> = {
  lead_qualifier:    "This agent qualifies leads (BANT). Score higher when Budget, Authority, Need, and Timeline were all established. Score low if any pillar is missing. Note which BANT pillars were confirmed or absent.",
  scheduler:         "This agent books appointments. Score higher when a booking was confirmed with a date, time, and confirmation ID. Note if the appointment was successfully booked, rescheduled, or failed.",
  collections:       "This agent collects payments. Score higher when a payment commitment, arrangement, or promise-to-pay was obtained. Note amount and timeline if discussed.",
  sales:             "This agent closes deals. Score higher when genuine interest, objection-handling, and a clear next step (demo, proposal, close) occurred.",
  technical_support: "This agent resolves technical issues. Score higher when the customer's problem was fully resolved or a concrete resolution path was set. Note resolution status.",
  marketing:         "This agent runs outreach campaigns. Score higher when the prospect expressed interest, booked a demo, registered for an event, or agreed to a follow-up.",
  receptionist:      "This agent routes calls and takes messages. Score higher when the caller was properly routed or a complete, accurate message was captured.",
  customer_service:  "This agent handles support. Score higher when the customer's issue was resolved and satisfaction expressed. Note any unresolved items.",
  hr_screener:       "This agent screens candidates. Score higher when work authorization, relevant experience, availability, and compensation alignment were confirmed, and a clear next step (interview booked or graceful decline) was communicated. Note EEOC compliance — flag any legally prohibited questions.",
  retention_specialist: "This agent prevents churn. Score higher when the root cause of dissatisfaction was identified, a specific retention offer was made, and the customer committed to staying. Score moderately when a callback or review was agreed upon. Note win-back vs. save context.",
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

export async function postCallAnalysis(input: PostCallInput) {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance) console.warn(`[claude-brain] postCallAnalysis: unknown role "${input.role}" — no scoring lens applied.`);
  }
  const system = `You are a senior call analyst delivering post-call enrichment for an autonomous agent on the Wireline relay. Be evidence-driven and concise:
- score lead intent honestly (0–100); if there's no signal, score low.
- extract ONE specific tactical lesson (or empty string if nothing worth promoting).
- list every concrete follow-up the agent promised or the customer asked for.
- flag compliance issues (recording consent, TCPA, GDPR, refund-policy mismatch, etc.).
- list topics the agent couldn't answer authoritatively (knowledge gaps).
${roleGuidance ? `\nRole-specific scoring lens — ${roleGuidance}` : ""}
Use plain English. No jargon, no ALL CAPS, no emoji.`;

  const user = `Agent: ${input.agentName} (archetype: ${input.archetype}${input.role ? `, role: ${input.role}` : ""})
Customer: ${input.customerNumber ?? "(unknown)"}${input.durationSeconds ? ` · ${input.durationSeconds}s` : ""}

--- SUMMARY ---
${input.summary || "(none)"}

--- TRANSCRIPT ---
${input.transcript || "(none)"}
--- END ---`;

  return runStructured({
    system,
    user,
    tool: TOOLS.postCallAnalysis,
    deepThink: true,
    maxTokens: 4096,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Live coaching — fast, single-pass.
 * ──────────────────────────────────────────────────────────────────── */

export interface CoachInput {
  agentName: string;
  archetype: string;
  role?: string;
  transcript: string;
  isLive?: boolean;
}

export async function coach(input: CoachInput) {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance) console.warn(`[claude-brain] coach: unknown role "${input.role}" — no role context applied.`);
  }
  const system = `You are a real-time call coach watching ${input.isLive ? "an in-progress" : "a completed"} call. Identify what is working, what is at risk, and exactly what the agent should say next. Suggested-next-words must be ≤30 words and ready to read aloud verbatim. Be tactical and concise.${roleGuidance ? `\n\nRole context — ${roleGuidance}` : ""}`;
  const user = `Agent: ${input.agentName} (${input.archetype}${input.role ? `, ${input.role}` : ""})

--- TRANSCRIPT ---
${input.transcript}
--- END ---

Coach this conversation now.`;
  return runStructured({
    system,
    user,
    tool: TOOLS.coach,
    deepThink: false,
    maxTokens: 2048,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Agent Forge — synthesize a complete agent from a goal description.
 * ──────────────────────────────────────────────────────────────────── */

export interface AgentForgeInput {
  goal: string;
  industry?: string;
  companyName?: string;
  websiteUrl?: string;
  voicePreference?: string;
}

export async function forgeAgent(input: AgentForgeInput) {
  const system = `You are a senior conversation designer. Given a goal, design a complete autonomous voice/email agent end-to-end: a memorable name, the right archetype, a snappy first message, a self-contained personality block, 5–8 priority-ranked directives, and 5–10 seed knowledge entries. Be opinionated, specific, and brand-appropriate. If a fact isn't known, write a clearly-marked TODO placeholder so the operator can fill it in.`;
  const user = `Goal: ${input.goal}
${input.companyName ? `Company: ${input.companyName}` : ""}
${input.industry ? `Industry: ${input.industry}` : ""}
${input.websiteUrl ? `Website: ${input.websiteUrl}` : ""}
${input.voicePreference ? `Voice preference: ${input.voicePreference}` : ""}

Design the agent now.`;
  return runStructured({
    system,
    user,
    tool: TOOLS.agentForge,
    deepThink: true,
    maxTokens: 6144,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Knowledge ingestion from URL — Claude fetches the page server-side
 *  via web_fetch, then returns structured knowledge entries.
 * ──────────────────────────────────────────────────────────────────── */

export interface KnowledgeFromUrlInput {
  url: string;
  agentContext?: string;
  maxEntries?: number;
  /**
   * Multi-page site crawl. When > 1, instructs Claude to follow nav links
   * from the root URL and fetch up to maxPages pages, combining the
   * extracted entries into a single deduplicated list.
   *
   * Defaults to 1 (single-page fetch — original behavior).
   */
  maxPages?: number;
}

export async function knowledgeFromUrl(input: KnowledgeFromUrlInput) {
  const client = getClient();
  const maxPages = Math.max(1, Math.min(input.maxPages ?? 1, 25));
  const isCrawl = maxPages > 1;

  const system = isCrawl
    ? `You are a knowledge-base curator for an autonomous voice/email agent. Crawl the given site by:
1. Fetching the root URL first.
2. Identifying the most important nav/footer links (about, services, products, pricing, hours, contact, faq, policies, locations).
3. Fetching up to ${maxPages} TOTAL pages (including the root). Stop early if you've covered the high-value pages.
4. Stay on the same domain. Never follow outbound or social links.
5. Skip duplicate content (e.g. blog index, search pages, login pages).

After crawling, extract every concrete fact a customer-service agent would need: services, pricing, hours, contact info, return/refund policies, FAQ answers, business address, key personnel. Each entry must be atomic, self-contained, and useful in isolation (the agent will quote it verbatim). Skip marketing fluff. **Deduplicate entries that say the same thing across multiple pages.** ${input.maxEntries ? `Limit to ~${input.maxEntries} entries.` : ""} The page_summary should describe the SITE as a whole, not just one page. Then call deliver_knowledge_entries.`
    : `You are a knowledge-base curator for an autonomous voice/email agent. Fetch the URL and extract every concrete fact a customer-service agent would need: services, pricing, hours, contact info, return/refund policies, FAQ answers, business address, key personnel. Each entry must be atomic, self-contained, and useful in isolation (the agent will quote it verbatim). Skip marketing fluff. ${input.maxEntries ? `Limit to ~${input.maxEntries} entries.` : ""} After fetching, call deliver_knowledge_entries with the result.`;

  const userPrompt = isCrawl
    ? `Crawl ${input.url} (up to ${maxPages} pages).${input.agentContext ? ` Context for the agent: ${input.agentContext}.` : ""} Then call deliver_knowledge_entries.`
    : `Fetch ${input.url}.${input.agentContext ? ` Context for the agent: ${input.agentContext}.` : ""} Then call deliver_knowledge_entries.`;

  // Crawls need much more headroom for both the assistant text + multiple
  // server-tool round trips before the final structured output.
  const maxTokens = isCrawl ? 16384 : 8192;

  const tools: Anthropic.Tool[] = [
    { type: "web_fetch_20260209", name: "web_fetch" } as any,
    TOOLS.knowledgeFromUrl,
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  let _t = Date.now();
  let response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: maxTokens,
    system,
    tools,
    messages,
  });
  recordUsage("claude-opus-4-7", response, Date.now() - _t);

  // Server-side tool loop — `pause_turn` means Claude hit the per-request
  // server-side iteration cap (10 by default) and needs us to re-send the
  // assistant turn so it can continue fetching. Bigger crawls need more
  // headroom; cap at 8 retries to bound latency / cost.
  const safetyCap = isCrawl ? 8 : 3;
  let safety = safetyCap;
  while (response.stop_reason === "pause_turn" && safety-- > 0) {
    messages.push({ role: "assistant", content: response.content });
    _t = Date.now();
    response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: maxTokens,
      system,
      tools,
      messages,
    });
    recordUsage("claude-opus-4-7", response, Date.now() - _t);
  }

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "deliver_knowledge_entries") {
      return block.input as { page_summary: string; entries: Array<{ fact: string; category: string }> };
    }
  }
  throw new Error(
    `Claude did not return structured knowledge (stop_reason=${response.stop_reason}). Try again or narrow the URL/crawl scope.`,
  );
}

/* ────────────────────────────────────────────────────────────────────────
 *  Knowledge ingestion from a PDF document — uses Claude's native PDF
 *  document content block. The operator uploads a brochure / menu /
 *  policy doc / FAQ; Claude reads it and extracts atomic agent facts.
 * ──────────────────────────────────────────────────────────────────── */

export interface KnowledgeFromDocumentInput {
  /** Base64-encoded PDF (no data: prefix). */
  pdfBase64: string;
  fileName?: string;
  agentContext?: string;
  maxEntries?: number;
}

export async function knowledgeFromDocument(input: KnowledgeFromDocumentInput) {
  const client = getClient();
  const system = `You are a knowledge-base curator for an autonomous voice/email agent. Read the provided document and extract every concrete fact a customer-service agent would need: services, pricing, hours, contact info, return/refund policies, FAQ answers, business address, key personnel. Each entry must be atomic, self-contained, and useful in isolation (the agent will quote it verbatim). Skip marketing fluff. ${input.maxEntries ? `Limit to ~${input.maxEntries} entries.` : ""} Then call deliver_knowledge_entries with the result.`;

  const t0 = Date.now();
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8192,
    system,
    tools: [TOOLS.knowledgeFromUrl],
    tool_choice: { type: "tool", name: "deliver_knowledge_entries" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: input.pdfBase64,
            },
            ...(input.fileName ? { title: input.fileName } : {}),
          },
          {
            type: "text",
            text: `${input.agentContext ? `Context for the agent: ${input.agentContext}.\n\n` : ""}Extract knowledge entries from this document.`,
          },
        ],
      },
    ],
  });

  recordUsage("claude-opus-4-7", response, Date.now() - t0);
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "deliver_knowledge_entries") {
      return block.input as { page_summary: string; entries: Array<{ fact: string; category: string }> };
    }
  }
  throw new Error(
    `Claude did not return structured knowledge (stop_reason=${response.stop_reason}).`,
  );
}

/* ────────────────────────────────────────────────────────────────────────
 *  Email auto-responder — replaces the legacy Gemini Pro path in
 *  /api/emails/sync. Manual tool-use loop so operators can plug in
 *  calendar/booking tool implementations from the Express handler.
 * ──────────────────────────────────────────────────────────────────── */

export interface SmartEmailReplyInput {
  agentName: string;
  agentTone: string;
  agentArchetype: string;
  agentRole?: string;
  knowledgeBase: string[];
  directives: string[];
  fromEmail: string;
  subject: string;
  emailBody: string;
  /** Resolves to a human-readable string describing what's booked. */
  onCheckCalendar?: (date: string) => Promise<string>;
  /** Returns { success, reference_id?, error? }. */
  onBookAppointment?: (args: {
    date: string;
    time: string;
    customer_name: string;
    service_type: string;
  }) => Promise<{ success: boolean; reference_id?: string; error?: string }>;
}

export async function smartEmailReply(input: SmartEmailReplyInput): Promise<{
  replyText: string;
  bookedRef?: string;
}> {
  const client = getClient();

  const tools: Anthropic.Tool[] = [];
  if (input.onCheckCalendar) {
    tools.push({
      name: "check_calendar_availability",
      description: "Check what times are already booked on a specific date.",
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string", description: "The date to check (e.g., 'October 15')." },
        },
        required: ["date"],
      },
    });
  }
  if (input.onBookAppointment) {
    tools.push({
      name: "book_appointment",
      description:
        "Book a service appointment. ONLY call this AFTER confirming the time is open via check_calendar_availability.",
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string" },
          time: { type: "string" },
          customer_name: { type: "string" },
          service_type: { type: "string" },
        },
        required: ["date", "time", "customer_name", "service_type"],
      },
    });
  }

  // Stable cache prefix: persona + KB + directives. The volatile email
  // body lives in the user message, after the cache breakpoint.
  let roleGuidance = "";
  if (input.agentRole) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.agentRole] ?? "";
    if (!roleGuidance) console.warn(`[claude-brain] smartEmailReply: unknown role "${input.agentRole}" — no role lens applied.`);
  }
  const system = `## IDENTITY
You are ${input.agentName}, an autonomous email agent.
Tone: ${input.agentTone}. Archetype: ${input.agentArchetype}.${input.agentRole ? `\nRole: ${input.agentRole}.${roleGuidance ? ` ${roleGuidance}` : ""}` : ""}

## ABSOLUTE RULES
${input.directives.length ? input.directives.map((d) => `- ${d}`).join("\n") : "(none — exercise good judgment)"}

## KNOWLEDGE BASE
${input.knowledgeBase.length ? input.knowledgeBase.map((k) => `- ${k}`).join("\n") : "(none — be conservative; never invent prices, dates, or policies)"}

## STYLE GUARDRAILS
- Plain text only. No markdown.
- ≤120 words unless the customer's question genuinely demands more.
- Acknowledge the customer's actual question; don't preamble.
- Never invent facts that aren't in the knowledge base — say "I'll check with the team" instead.
- If they want an appointment, use your tools to check availability and book it if confirmed.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `From: ${input.fromEmail}\nSubject: ${input.subject}\n\n${input.emailBody}`,
    },
  ];

  let bookedRef: string | undefined;
  let safety = 8;

  while (safety-- > 0) {
    const body: Anthropic.MessageCreateParams = {
      model: "claude-opus-4-7",
      max_tokens: 4096,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      messages,
    };
    if (tools.length) body.tools = tools;

    const _t = Date.now();
    const response = await client.messages.create(body);
    recordUsage("claude-opus-4-7", response, Date.now() - _t);

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        let result = "Tool not implemented.";
        try {
          const args = block.input as any;
          if (block.name === "check_calendar_availability" && input.onCheckCalendar) {
            result = await input.onCheckCalendar(args.date);
          } else if (block.name === "book_appointment" && input.onBookAppointment) {
            const r = await input.onBookAppointment(args);
            if (r.success) {
              bookedRef = r.reference_id;
              result = `Booked. Reference ID: ${r.reference_id ?? "(none)"}.`;
            } else {
              result = r.error || "Booking failed.";
            }
          }
        } catch (e: any) {
          result = `Error: ${e?.message ?? e}`;
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    // end_turn / max_tokens / stop_sequence — extract reply text.
    let replyText = "";
    for (const block of response.content) {
      if (block.type === "text") replyText += block.text;
    }
    return { replyText: replyText.trim() || "I'll follow up shortly.", bookedRef };
  }

  // Tool loop exceeded safety cap — return whatever's accumulated.
  return { replyText: "I'll follow up shortly.", bookedRef };
}

/* ────────────────────────────────────────────────────────────────────────
 *  Email intent scoring — drop-in replacement for the legacy Gemini path.
 * ──────────────────────────────────────────────────────────────────── */

export const SCORE_INTENT_TOOL: ToolSchema = {
  name: "score_intent",
  description: "Score business / buying intent.",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "integer", minimum: 0, maximum: 100 },
      label: { type: "string", enum: ["high", "medium", "low", "none"] },
      reasoning: { type: "string" },
    },
    required: ["score", "label"],
    additionalProperties: false,
  },
};

export async function scoreIntent(input: { subject?: string; body: string }) {
  return runStructured<{ score: number; label: string; reasoning?: string }>({
    system:
      "You are a B2B intent analyst. Score the message's buying / business intent (0–100) honestly — if there's no signal, score low. Use the score_intent tool.",
    user: `${input.subject ? `Subject: ${input.subject}\n\n` : ""}${input.body}`,
    tool: SCORE_INTENT_TOOL,
    deepThink: false,
    maxTokens: 512,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Daily executive brief — feeds Claude yesterday's stats + recent
 *  highlights/lowlights and asks for an SMB-friendly morning summary.
 * ──────────────────────────────────────────────────────────────────── */

export interface DailyBriefInput {
  yesterdayStats: {
    total_calls: number;
    total_minutes: number;
    avg_lead_score: number;
    high_intent_count: number;
    cost: number;
    appointments_booked: number;
    pending_tasks: number;
    new_leads: number;
  };
  weekDelta: {
    calls_pct: number;
    score_pct: number;
    cost_pct: number;
  };
  recentWinSamples: Array<{ customer: string; score: number; summary: string }>;
  recentLossSamples: Array<{ customer: string; score: number; summary: string }>;
  openTasks: Array<{ priority: string; description: string }>;
  ownerName?: string;
}

export async function dailyBrief(input: DailyBriefInput) {
  const system = `You are the chief of staff for a small-business owner running an autonomous voice/email agent fleet on the Wireline relay. Deliver a tight morning brief: what happened yesterday, what's working, what's at risk, and what to do today. Plain English, no jargon, no emoji.`;

  const user = `${input.ownerName ? `Operator: ${input.ownerName}\n` : ""}YESTERDAY (vs 7-day avg):
- Calls: ${input.yesterdayStats.total_calls} (${input.weekDelta.calls_pct >= 0 ? "+" : ""}${input.weekDelta.calls_pct.toFixed(0)}%)
- Avg lead score: ${input.yesterdayStats.avg_lead_score} (${input.weekDelta.score_pct >= 0 ? "+" : ""}${input.weekDelta.score_pct.toFixed(0)}%)
- High-intent leads: ${input.yesterdayStats.high_intent_count}
- Total minutes on the wire: ${input.yesterdayStats.total_minutes}
- Cost: $${input.yesterdayStats.cost.toFixed(2)} (${input.weekDelta.cost_pct >= 0 ? "+" : ""}${input.weekDelta.cost_pct.toFixed(0)}%)
- Appointments booked: ${input.yesterdayStats.appointments_booked}
- New outbound leads queued: ${input.yesterdayStats.new_leads}
- Open tasks: ${input.yesterdayStats.pending_tasks}

WIN SAMPLES:
${input.recentWinSamples.map((s) => `- ${s.customer} (score ${s.score}): ${s.summary}`).join("\n") || "(none)"}

LOSS SAMPLES:
${input.recentLossSamples.map((s) => `- ${s.customer} (score ${s.score}): ${s.summary}`).join("\n") || "(none)"}

TOP OPEN TASKS:
${input.openTasks.map((t) => `- [${t.priority}] ${t.description}`).join("\n") || "(none)"}

Deliver the daily brief now.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.dailyBrief,
    deepThink: true,
    maxTokens: 3072,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Topic clustering across recent calls.
 * ──────────────────────────────────────────────────────────────────── */

export interface TopicClustersInput {
  summaries: Array<{ summary: string; intent_label?: string }>;
  windowDays?: number;
}

export async function clusterTopics(input: TopicClustersInput) {
  const system = `You are a customer-conversation analyst. Cluster the provided call/email summaries into a SHORT list (5–8 max) of meaningful topics. Use plain English topic names that an SMB owner would understand. Estimate trend ('new' / 'growing' / 'steady' / 'declining') based on whether each topic appears more/less in the recent half vs the older half of the data.`;
  const user = `Window: last ${input.windowDays ?? 14} days. ${input.summaries.length} samples.

${input.summaries.map((s, i) => `${i + 1}. [${s.intent_label || "?"}] ${s.summary}`).join("\n")}`;

  return runStructured({
    system,
    user,
    tool: TOOLS.topicClusters,
    deepThink: false,
    maxTokens: 4096,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Failure-mode clustering — feeds the worst calls to Claude for fix
 *  recommendations.
 * ──────────────────────────────────────────────────────────────────── */

export interface FailureModesInput {
  failedCalls: Array<{
    summary: string;
    transcript?: string;
    lead_score?: number;
    intent_label?: string;
  }>;
}

export async function clusterFailureModes(input: FailureModesInput) {
  const system = `You are a senior agent-operations analyst. Identify recurring failure modes from the provided calls (low lead score, escalations, knowledge gaps, transfer requests). Cluster them, count occurrences, recommend a specific fix per cluster, and tag what kind of fix it is (directive / knowledge / personality / process / other).`;
  const user = `${input.failedCalls.length} failing calls:

${input.failedCalls
  .map(
    (c, i) =>
      `[${i + 1}] score=${c.lead_score ?? "?"} intent=${c.intent_label ?? "?"}\nSummary: ${c.summary}${
        c.transcript ? `\nTranscript: ${c.transcript.slice(0, 1200)}${c.transcript.length > 1200 ? "…" : ""}` : ""
      }`,
  )
  .join("\n\n")}`;

  return runStructured({
    system,
    user,
    tool: TOOLS.failureModes,
    deepThink: true,
    maxTokens: 4096,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Knowledge dedupe — find near-duplicate or contradictory facts in an
 *  operator's cross-agent knowledge base. Returns clusters + a
 *  recommended canonical so the UI can present a one-click keep/delete.
 * ──────────────────────────────────────────────────────────────────── */

export interface KnowledgeDedupeInput {
  facts: Array<{
    id: number;
    agent_name?: string;
    content: string;
  }>;
}

export async function findKnowledgeDuplicates(input: KnowledgeDedupeInput) {
  const system = `You audit an SMB operator's agent knowledge base for clutter. Cluster facts that:
- DUPLICATE: essentially identical wording (whitespace / punctuation / capitalization differences only).
- NEAR_DUPLICATE: same factual content with different phrasing (e.g. "Hours: 9-5" vs "We're open from 9 AM to 5 PM").
- CONTRADICTION: claims that disagree (e.g. "Free shipping over $50" vs "Free shipping over $75").

Rules:
- Use input ids VERBATIM. Never invent ids.
- A cluster MUST have ≥ 2 members. Skip singletons.
- An id should appear in AT MOST one cluster.
- Choose recommended_keep_id from the cluster's members — pick the clearest, most precise wording.
- Provide a suggested_canonical_content that consolidates the cluster ONLY when it materially improves clarity; otherwise omit it.
- Be conservative: when in doubt, do NOT cluster. False positives waste operator time.`;
  const user = `${input.facts.length} facts across the operator's fleet:

${input.facts.map(f => `[id=${f.id}${f.agent_name ? ` · ${f.agent_name}` : ""}] ${f.content}`).join("\n")}`;

  return runStructured<{
    clusters: Array<{
      kind: "duplicate" | "near_duplicate" | "contradiction";
      reason: string;
      recommended_keep_id: number;
      suggested_canonical_content?: string;
      members: Array<{ id: number; note?: string }>;
    }>;
    total_analyzed: number;
  }>({
    system,
    user,
    tool: TOOLS.knowledgeDedupe,
    deepThink: false,
    maxTokens: 4096,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Lead enrichment — Claude uses the server-side web_search tool to
 *  research a name / phone before the operator dials, then returns a
 *  structured pre-call brief. Mirrors the knowledgeFromUrl pause_turn
 *  loop pattern.
 * ──────────────────────────────────────────────────────────────────── */

export interface EnrichLeadInput {
  customer_number: string;
  customer_name?: string | null;
  context?: string | null;
  /** Operator hint about the deal — speeds Claude up by narrowing the search. */
  industry_hint?: string | null;
}

export interface EnrichLeadResult {
  research_confidence: "high" | "medium" | "low";
  identity_summary: string;
  company_name?: string;
  role?: string;
  industry?: string;
  company_size?: string;
  recent_signals: string[];
  conversation_hooks: string[];
  likely_objections: string[];
  sources: string[];
}

export async function enrichLead(input: EnrichLeadInput): Promise<EnrichLeadResult> {
  const client = getClient();

  const system = `You are a B2B research assistant for an SMB sales operator about to dial a lead. Search the public web and return a structured pre-call enrichment brief.

Search strategy:
- Run 3-5 targeted web_search queries; stop early once you have enough.
- Search for the name + phone area code's likely region for company / role context.
- If you identify a company, search recent news / press / funding signals.
- Skip socially noisy results (paywalled gossip, low-trust forums) unless they corroborate a primary source.

Be honest about confidence:
- HIGH: you found the specific person + employer on a reputable source (LinkedIn, company site, Crunchbase, press).
- MEDIUM: you found a likely match (common name, but role + region / industry context fits).
- LOW: you couldn't pin them down — return what you can about the likely region, industry patterns, or general guidance.

Never fabricate names, employers, or signals — when in doubt, drop confidence and say so in identity_summary. After researching, call deliver_lead_enrichment.`;

  const userPrompt = `Research this lead before the operator dials:
- Phone: ${input.customer_number}
- Name: ${input.customer_name || "(unknown)"}
- Operator context: ${input.context || "(none)"}
- Industry hint: ${input.industry_hint || "(none)"}

Search the web, then call deliver_lead_enrichment.`;

  const tools: Anthropic.Tool[] = [
    { type: "web_search_20250305", name: "web_search", max_uses: 5 } as any,
    TOOLS.enrichLead,
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  const model = "claude-opus-4-7";
  const maxTokens = 4096;

  let _t = Date.now();
  let response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    tools,
    messages,
  });
  recordUsage(model, response, Date.now() - _t);

  // Server-side tool loop. The `web_search` tool has its own per-request
  // iteration cap; pause_turn means Claude wants another turn to keep
  // searching. Cap retries to bound latency / cost.
  let safety = 4;
  while (response.stop_reason === "pause_turn" && safety-- > 0) {
    messages.push({ role: "assistant", content: response.content });
    _t = Date.now();
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools,
      messages,
    });
    recordUsage(model, response, Date.now() - _t);
  }

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "deliver_lead_enrichment") {
      return block.input as EnrichLeadResult;
    }
  }
  throw new Error(
    `Claude did not return enrichment (stop_reason=${response.stop_reason}). Try again with more operator context.`,
  );
}

/* ────────────────────────────────────────────────────────────────────────
 *  Quick Reply Suggestions — returns 3 short, ready-to-send reply options
 *  for an email thread. Used by the Email Inbox to surface one-click drafts.
 * ──────────────────────────────────────────────────────────────────── */

export interface QuickRepliesInput {
  agentName: string;
  agentTone: string;
  agentRole?: string;
  agentSignature?: string;
  knowledgeBase: string[];
  threadSubject: string;
  threadMessages: Array<{ role: string; content: string }>;
}

export interface QuickRepliesResult {
  suggestions: Array<{ label: string; body: string }>;
}

export async function quickReplies(input: QuickRepliesInput): Promise<QuickRepliesResult> {
  const system = `You are ${input.agentName}, an email agent${input.agentRole ? ` (${input.agentRole.replace(/_/g, " ")})` : ""}. Tone: ${input.agentTone}.
${input.knowledgeBase.length ? `Knowledge base:\n${input.knowledgeBase.map(k => `- ${k}`).join("\n")}` : ""}

Generate exactly 3 distinct quick-reply options for the latest customer message.
Each reply must be complete, ready-to-send as-is (≤60 words), with no placeholders or brackets.
Make each option clearly different in approach (e.g., confirming, requesting info, offering alternatives).
Plain text only — no markdown, no lists inside the body.
${input.agentSignature ? `Append this signature to each:\n${input.agentSignature}` : ""}`;

  const lastFew = input.threadMessages.slice(-6);
  const user = `Subject: ${input.threadSubject}

RECENT THREAD:
${lastFew.map((m, i) => `[${i + 1}] ${m.role.toUpperCase()}\n${m.content}`).join("\n\n")}

Deliver 3 quick-reply options using the deliver_quick_replies tool.`;

  return runStructured<QuickRepliesResult>({
    system,
    user,
    tool: TOOLS.quickReplies,
    cacheSystem: true,
    maxTokens: 1024,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  QA Scoring — structured 5-dimension call quality evaluation.
 *  Replaces the fragile runCompletion+regex-JSON path in the QA endpoint.
 * ──────────────────────────────────────────────────────────────────── */

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

export async function qaScore(input: QaScoreInput): Promise<QaScoreResult> {
  let roleGuidance = "";
  if (input.agentRole) {
    const guidance: Record<string, string> = {
      sales:             "Sales context: weight discovery and closing heavily. A perfect call has 3+ discovery questions, a compelling pitch tied to the customer's stated pain, and an explicit next step. A failed close (no commitment) is a hard cap on the closing score.",
      lead_qualifier:    "Lead qualifier context: discovery is the whole job. Score discovery and closing against BANT coverage (Budget, Authority, Need, Timeline). 'Closing' means a clear qualified/disqualified decision + handoff package.",
      collections:       "Collections context: compliance is paramount. Any FDCPA/TCPA violation (no mini-Miranda, no identity verification, abusive language) → greeting score ≤ 5. Objection handling and payment resolution drive the rest.",
      scheduler:         "Scheduler context: booking accuracy is the primary metric. A confirmed appointment with date/time/reference ID is a strong close. Failing to check availability before confirming is a critical error.",
      technical_support: "Support context: diagnostic rigor is paramount. Award discovery points for structured troubleshooting (one question at a time, systematic elimination). Closing is verified resolution — not just 'let me know if it happens again'.",
      customer_service:  "Customer service context: emotional acknowledgment and resolution completeness matter most. Award discovery points for understanding the root issue (not just the surface complaint). Closing = customer confirmed satisfaction.",
      receptionist:      "Receptionist context: routing accuracy and message completeness are everything. Score closing on whether the caller's need was fully addressed — message taken or correct transfer made.",
      marketing:         "Marketing context: engagement and next-step conversion are the metrics. Score closing based on whether the prospect agreed to any concrete next step (demo, trial, callback). Disengaged exit with no next step = low closing score.",
    };
    roleGuidance = guidance[input.agentRole] ?? "";
  }

  const system = `You are a call quality auditor for an enterprise voice AI platform. Evaluate calls objectively and with specificity — cite concrete moments from the transcript when scoring.${roleGuidance ? `\n\n${roleGuidance}` : ""}`;

  const user = `Score this ${input.direction} call against the 5-dimension QA rubric.

Summary: ${input.summary || "(none)"}
Sentiment: ${input.sentiment || "neutral"}
Duration: ${input.durationSeconds ? Math.round(input.durationSeconds / 60) + " minutes" : "unknown"}
${input.agentRole ? `Agent role: ${input.agentRole.replace(/_/g, " ")}` : ""}

Transcript (up to 3000 chars):
${input.transcript ? input.transcript.slice(0, 3000) + (input.transcript.length > 3000 ? "…" : "") : "(not available)"}

Score each dimension 0–20 and provide a concise, actionable coaching note.`;

  return runStructured<QaScoreResult>({
    system,
    user,
    tool: TOOLS.qaScore,
    deepThink: false,
    maxTokens: 512,
    model: "claude-opus-4-7",
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Call Playbook Builder — generates a complete branching call script for
 *  a given agent role + scenario. Useful for AgentTraining and operators
 *  who want to preview exactly how their agents should handle calls.
 * ──────────────────────────────────────────────────────────────────── */

export interface CallPlaybookInput {
  agentName: string;
  agentRole: string;
  scenario: string;
  knowledgeBase?: string[];
  directives?: string[];
  companyName?: string;
  /** Vague or specific — e.g. "B2B SaaS", "home services", etc. */
  industry?: string;
}

export interface CallPlaybookResult {
  opening_hook: string;
  purpose_statement: string;
  discovery_questions: Array<{
    question: string;
    intent: string;
    follow_up?: string;
  }>;
  value_prop_script: string;
  objection_handlers: Array<{
    objection: string;
    response: string;
    technique: string;
  }>;
  closing_variants: Array<{
    style: "assumptive" | "alternative_choice" | "soft_ask";
    script: string;
  }>;
  voicemail_script: string;
  success_criteria: string;
}

export async function buildCallPlaybook(input: CallPlaybookInput): Promise<CallPlaybookResult> {
  const roleGuidance: Record<string, string> = {
    sales:             "This is a revenue-generating call. The playbook must drive toward a demo, proposal, or purchase commitment. Every question should move the prospect closer to a buying decision.",
    lead_qualifier:    "This is a qualification call. The playbook must systematically uncover BANT (Budget, Authority, Need, Timeline) without feeling like an interrogation. The 'close' is a qualified handoff, not a purchase.",
    collections:       "This is a collections call. The playbook MUST include the FDCPA mini-Miranda in the opening. Every script line must be compliant. The goal is a payment commitment or arrangement.",
    scheduler:         "This is a scheduling call. Every script line assumes the goal is booking a confirmed appointment. Include explicit calendar-check prompts before any time commitment.",
    technical_support: "This is a support call. The playbook follows a diagnostic hierarchy: environment → restart → configuration → escalation. Discovery questions are diagnostic, not sales-oriented.",
    customer_service:  "This is a service call. The opening must lead with empathy before solutions. Discovery uncovers the root issue. The close confirms full resolution and customer satisfaction.",
    receptionist:      "This is a routing call. The opening is the company's first impression. Discovery determines exactly where to route the caller. The close is an accurate transfer or complete message.",
    marketing:         "This is an outreach/engagement call. The opening must hook with a specific, personalized reference. The goal is booking a demo, event, or next conversation — not a hard sale.",
  };

  const system = `You are a master conversation designer building call playbooks for autonomous voice agents. Every line must be immediately speakable verbatim — no placeholders, no brackets, no curly braces, no angle brackets, no "[INSERT NAME]", no "{{variable}}", no "<your company>", no "COMPANY NAME HERE." Write as if you know the company and scenario perfectly. Be concrete, specific, and tactical.

${roleGuidance[input.agentRole] ?? "Build a professional, effective call playbook."}

${input.knowledgeBase?.length ? `Knowledge base facts to ground the scripts:\n${input.knowledgeBase.slice(0, 20).map(k => `• ${k}`).join("\n")}` : ""}

${input.directives?.length ? `Agent directives to respect:\n${input.directives.slice(0, 10).map(d => `• ${d}`).join("\n")}` : ""}`;

  const user = `Build a complete call playbook for:
- Agent: ${input.agentName}
- Role: ${input.agentRole.replace(/_/g, " ")}
- Scenario: ${input.scenario}
${input.companyName ? `- Company: ${input.companyName}` : ""}
${input.industry ? `- Industry: ${input.industry}` : ""}

Make every script line immediately usable. Deliver the playbook now.`;

  return runStructured<CallPlaybookResult>({
    system,
    user,
    tool: TOOLS.callPlaybook,
    deepThink: true,
    cacheSystem: true,
    maxTokens: 6144,
  });
}
