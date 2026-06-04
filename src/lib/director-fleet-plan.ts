/**
 * Director fleet-mode planning — full business wingman capabilities:
 * orchestration, comms execution, integrations, documents, creative, research.
 */
import type { ToolSchema } from "./claude-structured";
import { AGENT_TOOL_CATALOG, isAgentToolName, type AgentToolName } from "./agent-capabilities";
import {
  WORKSPACE_ACTION_KINDS,
  type ProposedAction,
  type WorkspaceActionKind,
} from "./workspace-planner";
import { DIRECTOR_INTEGRATION_TOOLS } from "./director-integration-tools";

/** Lightweight navigation suggestions the Director can surface as chips. */
export const DIRECTOR_SUGGESTION_KINDS = [
  "create_agent",
  "focus_agent",
  "view_ops",
  "open_training",
  "open_insights",
] as const;
export type DirectorSuggestionKind = (typeof DIRECTOR_SUGGESTION_KINDS)[number];

export interface DirectorSuggestion {
  kind: DirectorSuggestionKind;
  label: string;
  /** Required for `focus_agent` — selects that agent in the Coach menu. */
  agentId?: string;
}

export interface DirectorFleetAgent {
  id: string;
  name: string | null;
  role: string | null;
}

export interface DirectorBusinessContext {
  businessName?: string | null;
  businessType?: string | null;
  primaryProduct?: string | null;
  operatingHours?: string | null;
}

/** Comms / outbound actions the Director can propose for operator approval. */
export interface DirectorProposedAction extends ProposedAction {
  /** Agent that places the call / sends on behalf of tenant. Required for calls. */
  agentId?: string;
}

/** Integration-backed jobs (research, CRM, Slack, contracts, prospecting). */
export interface DirectorIntegrationJob {
  tool: AgentToolName;
  label: string;
  summary: string;
  agentId?: string;
  /** Research query, Slack message, CRM note, etc. */
  query?: string;
  /** 1-based position in a multi-step workflow shown on approval cards. */
  step?: number;
}

export interface DirectorFleetPlan {
  reply: string;
  suggestions: DirectorSuggestion[];
  actions: DirectorProposedAction[];
  integrationJobs: DirectorIntegrationJob[];
}

export { DIRECTOR_INTEGRATION_TOOLS } from "./director-integration-tools";

export const DIRECTOR_FLEET_TOOL: ToolSchema = {
  name: "director_reply",
  description:
    "Reply as the operator's Director wingman. Propose executable actions and integration jobs when the operator asks you to DO something — never just tell them to go find a tab.",
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description:
          "Conversational reply. For documents/plans/code, include the full deliverable in reply using clear markdown headings. ≤800 words unless generating a full doc.",
      },
      suggestions: {
        type: "array",
        description: "0–3 navigation chips when useful.",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...DIRECTOR_SUGGESTION_KINDS] },
            label: { type: "string" },
            agentId: { type: "string" },
          },
          required: ["kind", "label"],
          additionalProperties: false,
        },
      },
      actions: {
        type: "array",
        description:
          "Outbound comms to execute on approval: email, SMS, or phone call. Only when operator explicitly asks to contact someone.",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...WORKSPACE_ACTION_KINDS] },
            label: { type: "string" },
            agent_id: { type: "string", description: "Fleet agent id for caller ID / auth." },
            to: { type: "string" },
            customer_name: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" },
            context: { type: "string", description: "Call objective (make_call)." },
          },
          required: ["kind", "label"],
          additionalProperties: false,
        },
      },
      integration_jobs: {
        type: "array",
        description:
          "Integration-backed work to run on approval: research, CRM, Slack, contracts, prospecting, sheets.",
        items: {
          type: "object",
          properties: {
            tool: { type: "string", enum: [...DIRECTOR_INTEGRATION_TOOLS] },
            label: { type: "string" },
            summary: { type: "string" },
            agent_id: { type: "string" },
            query: { type: "string" },
          },
          required: ["tool", "label", "summary"],
          additionalProperties: false,
        },
      },
    },
    required: ["reply"],
  },
};

function clampString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

export function buildDirectorFleetSystemPrompt(input: {
  fleet: DirectorFleetAgent[];
  stats?: { calls7d?: number; bookings7d?: number; openTasks?: number };
  business?: DirectorBusinessContext;
  deep: boolean;
  integrationPrompt?: string;
}): string {
  const { fleet, stats, business, deep, integrationPrompt } = input;
  const fleetLines =
    fleet.length === 0
      ? "(No agents yet — help them deploy their first agent.)"
      : fleet.map((a) => `- ${a.name || "Unnamed"} (${a.role || "agent"}) · id=${a.id}`).join("\n");

  const statsLine = stats
    ? `Last 7 days: ${stats.calls7d ?? 0} calls, ${stats.bookings7d ?? 0} bookings, ${stats.openTasks ?? 0} open tasks.`
    : "";

  const bizLines = [
    business?.businessName ? `Business: ${business.businessName}` : null,
    business?.businessType ? `Type: ${business.businessType}` : null,
    business?.primaryProduct ? `Offer: ${business.primaryProduct}` : null,
    business?.operatingHours ? `Hours: ${business.operatingHours}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const integrationLines =
    integrationPrompt ||
    AGENT_TOOL_CATALOG.filter((t) => DIRECTOR_INTEGRATION_TOOLS.includes(t.name))
      .map((t) => `- ${t.name}: ${t.label}`)
      .join("\n");

  return `You are the Director — the operator's always-on AI business wingman inside Wireline. Think cheat-code CEO: strategy, execution, research, documents, fleet orchestration, and integrations in one thread. You know their fleet, integrations, calls, and business context. You are NOT a generic chatbot — you execute, orchestrate, and ship.

Who you're talking to: the business owner / operator. This ONE chat is mission control.

## What you can do (all in this thread)

**Think & plan:** Strategy, audits, GTM, pricing, hiring plans, post-call coaching playbooks, weekly priorities.

**Create in chat:** Business plans, SOPs, marketing copy, email sequences, landing page copy, contracts, proposals, spreadsheets (markdown tables), SQL snippets, API integration code, automation scripts, meeting agendas — use markdown structure. Go long when they ask for a full document or codebase artifact.

**Research & intelligence:** You have LIVE grounded web search (Gemini). The platform may inject fresh web findings above the operator message — synthesize them with clear takeaways and cite sources when present. For deeper or multi-step research, propose \`gemini_ground\` in \`integration_jobs\` with a precise \`query\` (competitor scan, regulatory update, pricing benchmark). Never guess current public facts when a lookup is available.

**Orchestration:** For multi-step goals ("look up the order, text them, log to CRM"), populate ALL steps as ordered \`actions\` + \`integration_jobs\` in one turn — the UI shows Step 1, Step 2, etc. Do not stop at the first step.

**Image / brand:** Logo and brand pack generation is available via the creative flow — describe concepts in reply; the UI may surface generate_logo approvals.

**Execute on approval (populate actions / integration_jobs):**
- Email, SMS, outbound calls — draft fully, add to \`actions\` with agent_id when placing calls.
- Lead enrichment — enrich_lead. Slack/Teams — send_slack_notification / send_teams_message.
- CRM updates, contracts, Shopify/Square lookups — matching integration tool + query/summary.

**Coach agents:** Select an agent in the **Coach** menu — then propose config_changes, tool_toggles, actions, and integration_jobs scoped to that agent only.

## Rules
- When they say "text/call/email someone" — fill \`actions\` with complete drafts. Never invent phone numbers or emails.
- For calls, agent_id MUST be a valid fleet id (caller identity).
- Integration jobs only for CONNECTED tools when possible; include a clear \`query\` with lookup terms, order numbers, CRM search text, or message body.
- Everything in actions/integration_jobs is PROPOSAL until they approve — say so naturally.
- Be decisive. Tailor every answer to their business when context exists.
- ${deep ? "DEEP MODE: structured, prioritized, cross-fleet analysis." : "Default: tight, skimmable, action-oriented."}

${bizLines ? `Operator business context:\n${bizLines}\n` : ""}
Fleet:
${fleetLines}

${statsLine}

Available integrations (via integration_jobs):
${integrationLines}`;
}

export function normalizeDirectorFleetPlan(
  raw: Record<string, unknown>,
  fleet: DirectorFleetAgent[],
): DirectorFleetPlan {
  const reply =
    clampString(raw.reply, 12000) ||
    "I'm here — tell me what you want to move forward for your business and I'll orchestrate it.";

  const ownedIds = new Set(fleet.map((a) => a.id));
  const defaultAgentId = fleet[0]?.id;

  const suggestions: DirectorSuggestion[] = [];
  const seenSug = new Set<string>();
  if (Array.isArray(raw.suggestions)) {
    for (const s of raw.suggestions) {
      if (!s || typeof s !== "object") continue;
      const rec = s as Record<string, unknown>;
      const kind = rec.kind;
      if (
        typeof kind !== "string" ||
        !(DIRECTOR_SUGGESTION_KINDS as readonly string[]).includes(kind)
      ) {
        continue;
      }
      const k = kind as DirectorSuggestionKind;
      const label = clampString(rec.label, 24);
      if (!label) continue;
      let agentId: string | undefined;
      if (k === "focus_agent") {
        const candidate = clampString(rec.agentId, 64);
        if (!candidate || !ownedIds.has(candidate)) continue;
        agentId = candidate;
      }
      const dedupeKey = `${k}:${agentId ?? ""}`;
      if (seenSug.has(dedupeKey)) continue;
      seenSug.add(dedupeKey);
      suggestions.push({ kind: k, label, agentId });
      if (suggestions.length >= 3) break;
    }
  }

  const actions: DirectorProposedAction[] = [];
  if (Array.isArray(raw.actions)) {
    for (const a of raw.actions) {
      if (!a || typeof a !== "object") continue;
      const rec = a as Record<string, unknown>;
      const kind = rec.kind;
      if (typeof kind !== "string" || !(WORKSPACE_ACTION_KINDS as readonly string[]).includes(kind))
        continue;
      const agentRaw = clampString(rec.agent_id ?? rec.agentId, 64);
      const agentId = agentRaw && ownedIds.has(agentRaw) ? agentRaw : defaultAgentId || undefined;
      actions.push({
        kind: kind as WorkspaceActionKind,
        label: clampString(rec.label, 120) || "Run action",
        agentId,
        to: clampString(rec.to, 200) || undefined,
        customerName: clampString(rec.customer_name, 120) || undefined,
        subject: clampString(rec.subject, 200) || undefined,
        body: clampString(rec.body, 4000) || undefined,
        context: clampString(rec.context, 2000) || undefined,
      });
    }
  }

  const integrationJobs: DirectorIntegrationJob[] = [];
  const seenJobKeys = new Set<string>();
  if (Array.isArray(raw.integration_jobs)) {
    for (const j of raw.integration_jobs) {
      if (!j || typeof j !== "object") continue;
      const rec = j as Record<string, unknown>;
      const tool = rec.tool;
      if (
        !isAgentToolName(tool) ||
        !(DIRECTOR_INTEGRATION_TOOLS as readonly string[]).includes(tool)
      )
        continue;
      const query = clampString(rec.query, 2000) || undefined;
      const summary = clampString(rec.summary, 500) || "";
      const dedupeKey = `${tool}:${query || summary}`;
      if (seenJobKeys.has(dedupeKey)) continue;
      seenJobKeys.add(dedupeKey);
      const agentRaw = clampString(rec.agent_id ?? rec.agentId, 64);
      integrationJobs.push({
        tool,
        label: clampString(rec.label, 120) || tool,
        summary,
        agentId: agentRaw && ownedIds.has(agentRaw) ? agentRaw : defaultAgentId,
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

  return { reply, suggestions, actions, integrationJobs };
}
