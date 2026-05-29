/**
 * Workspace Planner — turns a plain-language operator message in the
 * agent chat into (a) an in-character reply, (b) concrete CONFIG changes
 * the agent proposes for itself, (c) capability (tool) toggles, and
 * (d) external action proposals (email / text / call).
 *
 * The product idea: the chat is the control surface. Instead of digging
 * through sidebars to find the right tab, the operator just says what
 * they want ("be warmer on price objections", "turn on SMS", "update my
 * greeting to…", "text the last caller our address") and the agent
 * fills out the exact change for them. The operator reviews a one-click
 * card and approves — nothing mutates without confirmation.
 *
 * This module is the pure planning brain. It calls Claude once with a
 * forced tool, then validates + filters the result against an allowlist
 * so the chat can never propose a field or capability that doesn't
 * exist. Execution lives in the route handlers (apply-change /
 * toggle-tool / run-action) which reuse the existing, already-gated
 * action engine + outbound dial paths.
 */
import { runStructured, type ToolSchema } from "./claude-structured";
import { CLAUDE_MODELS } from "./claude-models";
import {
  AGENT_TOOL_CATALOG,
  AGENT_TOOL_NAME_VALUES,
  isAgentToolName,
  resolveAgentTools,
  type AgentToolName,
} from "./agent-capabilities";

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
  | "escalation_phone";

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
    | "escalationPhone";
  label: string;
  kind: "text" | "vibe" | "phone" | "email";
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
}

export interface WorkspacePlan {
  reply: string;
  changes: ProposedChange[];
  toolToggles: ProposedToolToggle[];
  actions: ProposedAction[];
}

export interface PlanWorkspaceInput {
  operatorMessage: string;
  history: Array<{ role: "operator" | "agent"; content: string }>;
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
}

const DIRECT_AGENT_TOOL: ToolSchema = {
  name: "direct_agent",
  description:
    "Reply to the operator AND, when their message implies a change or task, fill out the exact " +
    "configuration changes, capability toggles, or external actions so they can approve with one click.",
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description:
          "Your in-character conversational reply to the operator (≤120 words). Confirm what you " +
          "understood and what you've prepared for them to approve. Never ask them to go find a tab.",
      },
      config_changes: {
        type: "array",
        description:
          "Concrete settings changes you propose. ONLY include when the operator clearly asked to " +
          "change behaviour/config. Fill `value` with the exact final text/value — do the work for them.",
        items: {
          type: "object",
          properties: {
            field: { type: "string", enum: WORKSPACE_FIELD_KEYS },
            value: {
              type: "string",
              description:
                "The exact new value. For personality_vibe use one of: warm, playful, authoritative.",
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
          "Capabilities to turn on/off for this agent when the operator asks (e.g. 'turn on SMS').",
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
          "External actions to run on the operator's behalf (send an email/text, place a call). " +
          "Only propose when the operator explicitly asks to contact someone.",
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

function buildSystemPrompt(input: PlanWorkspaceInput): string {
  const { agent, recentCalls } = input;
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

  return `You are ${name}, a Wireline AI ${role} (archetype: ${archetype}). You're in a private chat with your operator — the person who owns and manages you. This chat is their PRIMARY control surface: instead of hunting through settings tabs, they direct you in plain language and you do the work for them.

Your job each turn:
1. Reply in first person, in character as ${name} — warm, concise, never salesy.
2. If they ask to change how you behave, FILL OUT the exact change in config_changes with the final value (don't tell them to go edit a tab — prepare it for one-click approval). Only the allowlisted fields below can be changed this way.
3. If they ask to gain/lose a capability ("turn on SMS", "stop booking appointments"), add it to tool_toggles.
4. If they explicitly ask you to contact someone (email/text/call), add it to actions with a clear draft.
5. If nothing actionable was asked, just reply — leave the arrays empty.

Rules:
- Never invent fields, tools, or recipients. Use only the allowlisted fields and listed capabilities.
- For personality_vibe, value MUST be one of: warm, playful, authoritative.
- Everything you propose is a PROPOSAL the operator approves — say so naturally ("I've drafted… approve it when ready").
- Be decisive: if the operator's intent is clear, prepare the change rather than asking clarifying questions.

Allowlisted config fields (current values):
${currentConfig}

Your capabilities (toggle state):
${capabilityLines}

Recent calls (last ${recentCalls.length}):
${callsSummary}`;
}

function buildUserContent(input: PlanWorkspaceInput): string {
  const transcript = input.history
    .slice(-12)
    .map((m) => `${m.role === "operator" ? "Operator" : "You"}: ${m.content}`)
    .join("\n");
  const prefix = transcript ? `Conversation so far:\n${transcript}\n\n` : "";
  return `${prefix}Operator's new message:\n${input.operatorMessage}`;
}

interface RawDirectAgent {
  reply?: unknown;
  config_changes?: unknown;
  tool_toggles?: unknown;
  actions?: unknown;
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
 * Validate + normalize Claude's raw tool output into a safe WorkspacePlan.
 * Anything malformed, out-of-allowlist, or no-op is silently dropped so the
 * UI only ever sees actionable, executable proposals.
 */
export function normalizePlan(raw: RawDirectAgent): WorkspacePlan {
  const reply =
    clampString(raw.reply, 2000) || "Got it — let me know what you'd like me to adjust.";

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

  return { reply, changes, toolToggles, actions };
}

/**
 * Plan one workspace turn. Calls Claude with a forced tool, then
 * validates the structured output. Throws if the model layer is
 * unavailable — the caller decides the fallback copy.
 */
export async function planWorkspace(input: PlanWorkspaceInput): Promise<WorkspacePlan> {
  const raw = await runStructured<RawDirectAgent>({
    system: buildSystemPrompt(input),
    user: buildUserContent(input),
    tool: DIRECT_AGENT_TOOL,
    // Sonnet 4.6: capable enough to read nuanced operator intent and pick
    // the right field/capability reliably, while staying affordable. The
    // workspace chat is high-frequency, so spam cost is bounded by a
    // per-user rate limiter on the route rather than a model downgrade.
    model: CLAUDE_MODELS.SONNET,
    maxTokens: 1500,
  });
  return normalizePlan(raw);
}
