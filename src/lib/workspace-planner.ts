/**
 * Workspace Planner — turns a plain-language Account Holder message in the
 * agent chat into (a) an in-character reply, (b) concrete CONFIG changes
 * the agent proposes for itself, (c) capability (tool) toggles, and
 * (d) external action proposals (email / text / call).
 *
 * The product idea: the chat is the control surface. Instead of digging
 * through sidebars to find the right tab, the Account Holder just says what
 * they want ("be warmer on price objections", "turn on SMS", "update my
 * greeting to…", "text the last caller our address") and the agent
 * fills out the exact change for them. The Account Holder reviews a one-click
 * card and approves — nothing mutates without confirmation.
 *
 * This module is the pure planning brain. It calls the managed structured runtime with a
 * forced tool, then validates + filters the result against an allowlist
 * so the chat can never propose a field or capability that doesn't
 * exist. Execution lives in the route handlers (apply-change /
 * toggle-tool / run-action) which reuse the existing, already-gated
 * action engine + outbound dial paths.
 */
import {
  runStructuredWithThinking,
  type StructuredToolSchema as ToolSchema,
} from "./ai-structured";
import { STRUCTURED_RUNTIME_MODELS } from "./structured-runtime-models";
import {
  AGENT_TOOL_CATALOG,
  AGENT_TOOL_NAME_VALUES,
  isAgentToolName,
  resolveAgentTools,
  type AgentToolName,
} from "./agent-capabilities";
import { DIRECTOR_INTEGRATION_TOOLS } from "./director-integration-tools";

/** Personality vibes the chat may set — mirrors the Vapi factory. */
export const WORKSPACE_VIBE_OPTIONS = ["warm", "playful", "authoritative"] as const;
export type WorkspaceVibe = (typeof WORKSPACE_VIBE_OPTIONS)[number];

/** Allowlisted agent fields the chat can configure conversationally. */
export type WorkspaceFieldKey =
  | "first_message"
  | "personality_vibe"
  | "email_agent_tone"
  | "email_signature"
  | "out_of_hours_message"
  | "transfer_phone"
  | "escalation_email"
  | "escalation_phone"
  | "website_url"
  | "archetype"
  | "timezone"
  | "email_auto_respond"
  | "ambient_noise"
  | "slack_channel_id"
  | "name"
  | "auto_zoom_link"
  | "autonomy_level";

interface FieldSpec {
  /** Drizzle column name on `schema.agents`. */
  column:
    | "firstMessage"
    | "personalityVibe"
    | "emailAgentTone"
    | "emailSignature"
    | "outOfHoursMessage"
    | "transferPhone"
    | "escalationEmail"
    | "escalationPhone"
    | "websiteUrl"
    | "archetype"
    | "timezone"
    | "emailAutoRespond"
    | "ambientNoise"
    | "slackChannelId"
    | "name"
    | "autoZoomLink"
    | "autonomyLevel";
  label: string;
  kind: "text" | "vibe" | "phone" | "email" | "boolean" | "url";
  maxLen: number;
}

export const WORKSPACE_FIELDS: Record<WorkspaceFieldKey, FieldSpec> = {
  first_message: {
    column: "firstMessage",
    label: "Greeting (first message)",
    kind: "text",
    maxLen: 500,
  },
  personality_vibe: {
    column: "personalityVibe",
    label: "Personality vibe",
    kind: "vibe",
    maxLen: 20,
  },
  email_agent_tone: { column: "emailAgentTone", label: "Email tone", kind: "text", maxLen: 60 },
  email_signature: {
    column: "emailSignature",
    label: "Email signature",
    kind: "text",
    maxLen: 600,
  },
  out_of_hours_message: {
    column: "outOfHoursMessage",
    label: "Out-of-hours message",
    kind: "text",
    maxLen: 500,
  },
  transfer_phone: {
    column: "transferPhone",
    label: "Transfer phone number",
    kind: "phone",
    maxLen: 20,
  },
  escalation_email: {
    column: "escalationEmail",
    label: "Escalation email",
    kind: "email",
    maxLen: 200,
  },
  escalation_phone: {
    column: "escalationPhone",
    label: "Escalation phone number",
    kind: "phone",
    maxLen: 20,
  },
  website_url: {
    column: "websiteUrl",
    label: "Website URL",
    kind: "url",
    maxLen: 200,
  },
  archetype: {
    column: "archetype",
    label: "Agent archetype",
    kind: "text",
    maxLen: 50,
  },
  timezone: {
    column: "timezone",
    label: "Timezone",
    kind: "text",
    maxLen: 50,
  },
  email_auto_respond: {
    column: "emailAutoRespond",
    label: "Email auto-respond",
    kind: "boolean",
    maxLen: 5,
  },
  ambient_noise: {
    column: "ambientNoise",
    label: "Ambient noise",
    kind: "text",
    maxLen: 20,
  },
  slack_channel_id: {
    column: "slackChannelId",
    label: "Slack channel ID",
    kind: "text",
    maxLen: 50,
  },
  name: {
    column: "name",
    label: "Agent name",
    kind: "text",
    maxLen: 100,
  },
  auto_zoom_link: {
    column: "autoZoomLink",
    label: "Auto-generate Zoom links",
    kind: "boolean",
    maxLen: 5,
  },
  autonomy_level: {
    column: "autonomyLevel",
    label: "Autonomy level",
    kind: "text",
    maxLen: 20,
  },
};

export const WORKSPACE_FIELD_KEYS = Object.keys(WORKSPACE_FIELDS) as WorkspaceFieldKey[];

/** External action kinds the chat may propose. */
export const WORKSPACE_ACTION_KINDS = ["send_email", "send_text_message", "make_call"] as const;
export type WorkspaceActionKind = (typeof WORKSPACE_ACTION_KINDS)[number];

export interface ProposedChange {
  field: WorkspaceFieldKey;
  label: string;
  value: string;
  summary: string;
}

export interface ProposedToolToggle {
  tool: AgentToolName;
  enable: boolean;
  label: string;
  reason: string;
}

export interface ProposedAction {
  kind: WorkspaceActionKind;
  label: string;
  to?: string;
  customerName?: string;
  subject?: string;
  body?: string;
  context?: string;
  /** 1-based workflow step when multiple approvals ship in one turn. */
  step?: number;
}

export interface ProposedIntegrationJob {
  tool: AgentToolName;
  label: string;
  summary: string;
  agentId?: string;
  query?: string;
  /** 1-based workflow step when multiple approvals ship in one turn. */
  step?: number;
}

export interface WorkspacePlan {
  reply: string;
  changes: ProposedChange[];
  toolToggles: ProposedToolToggle[];
  actions: ProposedAction[];
  integrationJobs: ProposedIntegrationJob[];
  /** Managed runtime adaptive reasoning (when deep thinking is enabled). */
  reasoning?: string;
  /** Approximate thinking duration in ms (for UI badge). */
  thinkingDurationMs?: number;
}

export interface PlanWorkspaceInput {
  userMessage: string;
  history: Array<{ role: "Account Holder" | "agent"; content: string }>;
  agent: {
    name?: string | null;
    role?: string | null;
    archetype?: string | null;
    personalityVibe?: string | null;
    firstMessage?: string | null;
    emailAgentTone?: string | null;
    emailSignature?: string | null;
    outOfHoursMessage?: string | null;
    transferPhone?: string | null;
    escalationEmail?: string | null;
    escalationPhone?: string | null;
    enabledTools?: unknown;
  };
  recentCalls: Array<{
    summary?: string | null;
    sentiment?: string | null;
    intent?: string | null;
  }>;
  /** When true, the Director (not the agent) speaks and coaches via approval cards. */
  coachAsDirector?: boolean;
  /** Connected OAuth integrations — shown in coach/Director prompts. */
  integrationPrompt?: string;
  /** Pre-fetched live web research block (Director coach mode). */
  researchBlock?: string;
}

const DIRECT_AGENT_TOOL: ToolSchema = {
  name: "direct_agent",
  description:
    "Reply to the Account Holder AND, when their message implies a change or task, fill out the exact " +
    "configuration changes, capability toggles, or external actions so they can approve with one click.",
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description:
          "Your in-character conversational reply to the Account Holder (≤120 words). Confirm what you " +
          "understood and what you've prepared for them to approve. Never ask them to go find a tab.",
      },
      config_changes: {
        type: "array",
        description:
          "Concrete settings changes you propose. ONLY include when the Account Holder clearly asked to " +
          "change behaviour/config. Fill `value` with the exact final text/value — do the work for them.",
        items: {
          type: "object",
          properties: {
            field: { type: "string", enum: WORKSPACE_FIELD_KEYS },
            value: {
              type: "string",
              description:
                "The exact new value. For personality_vibe use one of: warm, playful, authoritative. For booleans, use 'true' or 'false'.",
            },
            summary: {
              type: "string",
              description: "One short sentence describing the change, shown on the approval card.",
            },
          },
          required: ["field", "value", "summary"],
          additionalProperties: false,
        },
      },
      tool_toggles: {
        type: "array",
        description:
          "Capabilities to turn on/off for this agent when the Account Holder asks (e.g. 'turn on SMS').",
        items: {
          type: "object",
          properties: {
            tool: { type: "string", enum: [...AGENT_TOOL_NAME_VALUES] },
            enable: { type: "boolean" },
            reason: { type: "string" },
          },
          required: ["tool", "enable", "reason"],
          additionalProperties: false,
        },
      },
      actions: {
        type: "array",
        description:
          "External actions to run on the Account Holder's behalf (send an email/text, place a call). " +
          "Only propose when the Account Holder explicitly asks to contact someone.",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...WORKSPACE_ACTION_KINDS] },
            label: { type: "string", description: "Short human label for the approval card." },
            to: { type: "string", description: "Recipient email or E.164 phone number." },
            customer_name: { type: "string" },
            subject: { type: "string", description: "Email subject (send_email only)." },
            body: { type: "string", description: "Email/text body." },
            context: {
              type: "string",
              description: "Call objective / context (make_call only).",
            },
          },
          required: ["kind", "label"],
          additionalProperties: false,
        },
      },
    },
    required: ["reply"],
  },
};

const directAgentToolProperties = (): Record<string, unknown> => {
  const schema = DIRECT_AGENT_TOOL.input_schema;
  if (schema.type !== "object" || !("properties" in schema) || !schema.properties) {
    return {};
  }
  return schema.properties as Record<string, unknown>;
};

const COACH_DIRECTOR_WORKSPACE_TOOL: ToolSchema = {
  ...DIRECT_AGENT_TOOL,
  description:
    "Reply as the Director coaching this agent. Propose config changes, capability toggles, " +
    "comms actions, and integration jobs for one-click Account Holder approval.",
  input_schema: {
    ...DIRECT_AGENT_TOOL.input_schema,
    properties: {
      ...directAgentToolProperties(),
      integration_jobs: {
        type: "array",
        description:
          "Integration-backed work for this agent on approval — CRM, Shopify, Slack, calendar, etc.",
        items: {
          type: "object",
          properties: {
            tool: { type: "string", enum: [...DIRECTOR_INTEGRATION_TOOLS] },
            label: { type: "string" },
            summary: { type: "string" },
            query: { type: "string" },
          },
          required: ["tool", "label", "summary"],
          additionalProperties: false,
        },
      },
    },
  },
};

function buildSystemPrompt(input: PlanWorkspaceInput): string {
  const { agent, recentCalls, coachAsDirector } = input;
  const name = agent.name || "the agent";
  const role = agent.role || "AI receptionist";
  const archetype = agent.archetype || "warm professional";

  const enabledTools = resolveAgentTools(agent.role ?? undefined, agent.enabledTools);
  const enabledSet = new Set(enabledTools);
  const capabilityLines = AGENT_TOOL_CATALOG.map(
    (t) => `- ${t.name} (${t.label})${enabledSet.has(t.name) ? " — ON" : " — off"}`,
  ).join("\n");

  const currentConfig = WORKSPACE_FIELD_KEYS.map((key) => {
    const spec = WORKSPACE_FIELDS[key];
    const col = spec.column;
    const value = (agent as Record<string, unknown>)[col];
    const display =
      value === null || value === undefined || value === "" ? "(not set)" : String(value);
    return `- ${key}: ${display}`;
  }).join("\n");

  const callsSummary =
    recentCalls.length === 0
      ? "(No calls handled yet.)"
      : recentCalls
          .map(
            (c, i) =>
              `${i + 1}. [${c.sentiment || "neutral"} / ${c.intent || "unknown"}] ${c.summary || "(no summary)"}`,
          )
          .join("\n");

  const persona = coachAsDirector
    ? `You are the Director — the Account Holder's AI manager inside Wireline. The Account Holder selected **${name}** (${role}, archetype: ${archetype}) in the Coach menu. You're coaching them on how to improve this agent — speak as the Director ("I'll update ${name}'s greeting…"), not in ${name}'s first person voice.`
    : `You are ${name}, a Wireline AI ${role} (archetype: ${archetype}). You're in a private chat with your Account Holder — the person who owns and manages you.`;

  return `${persona} This chat is their PRIMARY control surface: instead of hunting through settings tabs, they direct you in plain language and you do the work for them.

Your job each turn:
1. Reply ${coachAsDirector ? "as the Director" : "in first person, in character as " + name} — warm, concise, never salesy.
2. If they ask to change how ${coachAsDirector ? "this agent behaves" : "you behave"}, FILL OUT the exact change in config_changes with the final value (don't tell them to go edit a tab — prepare it for one-click approval). Only the allowlisted fields below can be changed this way.
3. If they ask to gain/lose a capability ("turn on SMS", "stop booking appointments"), add it to tool_toggles.
4. If they explicitly ask you to contact someone (email/text/call), add it to actions with a clear draft.
5. If they ask to run connected integration work (CRM lookup, Shopify order, Slack alert, calendar, DocuSign), add integration_jobs with a clear query.
6. If nothing actionable was asked, just reply — leave the arrays empty.

Creative collaborator mode (chat-only, no extra tools required):
- You CAN draft full deliverables in your reply: business plans, GTM one-pagers, marketing copy, email sequences, SOPs, objection playbooks, meeting agendas, and logo/brand briefs.
- Tailor to the Account Holder's vertical when known: home services (booking + dispatch), healthcare (appointments, no medical advice), collections (FDCPA-aware tone), SaaS sales (discovery + trial nurture), e-commerce (order status + returns), support (escalation + de-escalation).
- Structure long outputs with clear headings. Be specific to the Account Holder's business when context exists.
- Live web research may appear above the Account Holder message — use it for market/competitor/regulatory answers; cite sources when present.
- For production logo SVGs or downloadable brand ZIPs, outline concepts here; the Director can export artifacts when no agent is selected.
- When a deliverable implies config changes (new greeting, tone, tools), also populate config_changes / tool_toggles so the Account Holder can approve in one click.

Rules:
- Never invent fields, tools, or recipients. Use only the allowlisted fields and listed capabilities.
- For personality_vibe, value MUST be one of: warm, playful, authoritative.
- Everything you propose is a PROPOSAL the Account Holder approves — say so naturally ("I've drafted… approve it when ready").
- Be decisive: if the Account Holder's intent is clear, prepare the change rather than asking clarifying questions.

Allowlisted config fields (current values):
${currentConfig}

Your capabilities (toggle state):
${capabilityLines}

Recent calls for ${name} (last ${recentCalls.length}):
${callsSummary}
${coachAsDirector && input.integrationPrompt ? `\nConnected integrations (via integration_jobs):\n${input.integrationPrompt}\n` : ""}`;
}

function buildUserContent(input: PlanWorkspaceInput): string {
  const transcript = input.history
    .slice(-12)
    .map((m) => `${m.role === "Account Holder" ? "Account Holder" : "You"}: ${m.content}`)
    .join("\n");
  const prefix = transcript ? `Conversation so far:\n${transcript}\n\n` : "";
  const base = `${prefix}Account Holder's new message:\n${input.userMessage}`;
  return input.researchBlock ? `${input.researchBlock}\n\n${base}` : base;
}

interface RawDirectAgent {
  reply?: unknown;
  config_changes?: unknown;
  tool_toggles?: unknown;
  actions?: unknown;
  integration_jobs?: unknown;
}

function clampString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function validateFieldValue(field: WorkspaceFieldKey, raw: unknown): string | null {
  const spec = WORKSPACE_FIELDS[field];
  const value = clampString(raw, spec.maxLen);
  if (value === null) return null;
  if (spec.kind === "vibe") {
    const lower = value.toLowerCase();
    return (WORKSPACE_VIBE_OPTIONS as readonly string[]).includes(lower) ? lower : null;
  }
  if (spec.kind === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
  }
  if (spec.kind === "phone") {
    // Lenient E.164-ish: digits, spaces, +, -, parens. Reject anything else.
    return /^[+\d][\d\s()-]{5,19}$/.test(value) ? value : null;
  }
  return value;
}

/**
 * Validate + normalize raw structured output into a safe WorkspacePlan.
 * Anything malformed, out-of-allowlist, or no-op is silently dropped so the
 * UI only ever sees actionable, executable proposals.
 */
/** Agent workspace chat keeps replies short; Director coach mode needs room for roleplay. */
const WORKSPACE_REPLY_MAX = 2000;
const COACH_DIRECTOR_REPLY_MAX = 32_000;

export function normalizePlan(
  raw: RawDirectAgent,
  opts?: { agentId?: string; coachAsDirector?: boolean },
): WorkspacePlan {
  const replyMax = opts?.coachAsDirector ? COACH_DIRECTOR_REPLY_MAX : WORKSPACE_REPLY_MAX;
  const reply =
    clampString(raw.reply, replyMax) || "Got it — let me know what you'd like me to adjust.";

  const changes: ProposedChange[] = [];
  const seenFields = new Set<WorkspaceFieldKey>();
  if (Array.isArray(raw.config_changes)) {
    for (const c of raw.config_changes) {
      if (!c || typeof c !== "object") continue;
      const field = (c as Record<string, unknown>).field;
      if (typeof field !== "string" || !(field in WORKSPACE_FIELDS)) continue;
      const key = field as WorkspaceFieldKey;
      if (seenFields.has(key)) continue;
      const value = validateFieldValue(key, (c as Record<string, unknown>).value);
      if (value === null) continue;
      seenFields.add(key);
      changes.push({
        field: key,
        label: WORKSPACE_FIELDS[key].label,
        value,
        summary:
          clampString((c as Record<string, unknown>).summary, 200) ||
          `Update ${WORKSPACE_FIELDS[key].label.toLowerCase()}`,
      });
    }
  }

  const toolToggles: ProposedToolToggle[] = [];
  const seenTools = new Set<AgentToolName>();
  if (Array.isArray(raw.tool_toggles)) {
    for (const t of raw.tool_toggles) {
      if (!t || typeof t !== "object") continue;
      const tool = (t as Record<string, unknown>).tool;
      const enable = (t as Record<string, unknown>).enable;
      if (!isAgentToolName(tool) || typeof enable !== "boolean") continue;
      if (seenTools.has(tool)) continue;
      seenTools.add(tool);
      const meta = AGENT_TOOL_CATALOG.find((m) => m.name === tool);
      toolToggles.push({
        tool,
        enable,
        label: meta?.label || tool,
        reason: clampString((t as Record<string, unknown>).reason, 200) || "",
      });
    }
  }

  const actions: ProposedAction[] = [];
  if (Array.isArray(raw.actions)) {
    for (const a of raw.actions) {
      if (!a || typeof a !== "object") continue;
      const kind = (a as Record<string, unknown>).kind;
      if (typeof kind !== "string" || !(WORKSPACE_ACTION_KINDS as readonly string[]).includes(kind))
        continue;
      const rec = a as Record<string, unknown>;
      actions.push({
        kind: kind as WorkspaceActionKind,
        label: clampString(rec.label, 120) || "Run action",
        to: clampString(rec.to, 200) || undefined,
        customerName: clampString(rec.customer_name, 120) || undefined,
        subject: clampString(rec.subject, 200) || undefined,
        body: clampString(rec.body, 4000) || undefined,
        context: clampString(rec.context, 2000) || undefined,
      });
    }
  }

  const integrationJobs: ProposedIntegrationJob[] = [];
  const seenJobKeys = new Set<string>();
  if (Array.isArray(raw.integration_jobs)) {
    for (const j of raw.integration_jobs) {
      if (!j || typeof j !== "object") continue;
      const rec = j as Record<string, unknown>;
      const tool = rec.tool;
      if (
        typeof tool !== "string" ||
        !isAgentToolName(tool) ||
        !(DIRECTOR_INTEGRATION_TOOLS as readonly string[]).includes(tool)
      ) {
        continue;
      }
      const query = clampString(rec.query, 2000) || undefined;
      const summary = clampString(rec.summary, 500) || "";
      const dedupeKey = `${tool}:${query || summary}`;
      if (seenJobKeys.has(dedupeKey)) continue;
      seenJobKeys.add(dedupeKey);
      integrationJobs.push({
        tool,
        label: clampString(rec.label, 120) || tool,
        summary,
        agentId: opts?.agentId,
        query,
      });
    }
  }

  let step = 1;
  for (const a of actions) {
    a.step = step++;
  }
  for (const j of integrationJobs) {
    j.step = step++;
  }

  return { reply, changes, toolToggles, actions, integrationJobs };
}

/**
 * Plan one workspace turn. Calls the managed runtime with a forced tool, then
 * validates the structured output. Throws if the model layer is
 * unavailable — the caller decides the fallback copy.
 */
export async function planWorkspace(input: PlanWorkspaceInput): Promise<WorkspacePlan> {
  const {
    result: raw,
    thinking,
    thinkingDurationMs,
  } = await runStructuredWithThinking<RawDirectAgent>({
    system: buildSystemPrompt(input),
    user: buildUserContent(input),
    tool: DIRECT_AGENT_TOOL,
    // Managed standard model: capable enough to read nuanced Account Holder intent and pick
    // the right field/capability reliably, while staying affordable. The
    // workspace chat is high-frequency, so spam cost is bounded by a
    // per-user rate limiter on the route rather than a model downgrade.
    model: STRUCTURED_RUNTIME_MODELS.STANDARD,
    maxTokens: 1500,
  });
  const plan = normalizePlan(raw);
  return { ...plan, reasoning: thinking, thinkingDurationMs };
}

/** Prompt bundle for SSE streaming (Director coach mode + agent workspace). */
export function buildWorkspaceStreamContext(input: PlanWorkspaceInput) {
  return {
    system: buildSystemPrompt(input),
    user: buildUserContent(input),
    tool: input.coachAsDirector ? COACH_DIRECTOR_WORKSPACE_TOOL : DIRECT_AGENT_TOOL,
  };
}
