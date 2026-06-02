/**
 * Director Planner — the account-level "manager" brain behind the always-on
 * Director chat.
 *
 * The Director is distinct from the per-agent workspace planner:
 *   - It's account-level (one thread per operator), not bound to a single agent.
 *   - It's available from the very first login, BEFORE any agents exist, so it
 *     doubles as the guided-setup concierge ("what should my first agent do?").
 *   - It doesn't mutate any agent config directly. Instead it advises and hands
 *     the operator lightweight navigation suggestions (create an agent, open a
 *     specific agent's chat, jump to training / live ops / insights). Every
 *     real change still happens through the existing approval-gated surfaces.
 *
 * Model strategy (hybrid, cost-aware):
 *   - Normal turns run on Sonnet — high-frequency, latency-sensitive, cheap.
 *   - When the operator asks for genuinely heavy strategic work ("audit my
 *     whole fleet", "analyze everything and build a plan"), we escalate to
 *     Opus with adaptive thinking. Detected by `wantsDeepAnalysis()`.
 */
import { runStructuredWithThinking, type ToolSchema } from "./claude-structured";
import { CLAUDE_MODELS } from "./claude-models";

/** Lightweight navigation suggestions the Director can surface as chips. */
export const DIRECTOR_SUGGESTION_KINDS = [
  "create_agent",
  "open_agent_chat",
  "view_ops",
  "open_training",
  "open_insights",
] as const;
export type DirectorSuggestionKind = (typeof DIRECTOR_SUGGESTION_KINDS)[number];

export interface DirectorSuggestion {
  kind: DirectorSuggestionKind;
  label: string;
  /** Required for `open_agent_chat` — the agent the chip should open. */
  agentId?: string;
}

export interface DirectorPlan {
  reply: string;
  suggestions: DirectorSuggestion[];
  /** Which model tier handled this turn (for UI/telemetry). */
  model: "sonnet" | "opus";
  /** Claude's adaptive thinking reasoning (only present on deep-analysis turns). */
  reasoning?: string;
  /** Approximate thinking duration in ms (for UI badge). */
  thinkingDurationMs?: number;
}

export interface DirectorFleetAgent {
  id: string;
  name: string | null;
  role: string | null;
}

export interface PlanDirectorInput {
  operatorMessage: string;
  history: Array<{ role: "operator" | "director"; content: string }>;
  fleet: DirectorFleetAgent[];
  /** Aggregate activity context across the whole fleet (last 7d). */
  stats?: {
    calls7d?: number;
    bookings7d?: number;
    openTasks?: number;
  };
}

/**
 * Heuristic: does this turn warrant the (pricier, slower, smarter) Opus tier?
 * Triggers on explicit requests for deep, cross-fleet strategic analysis.
 */
export function wantsDeepAnalysis(message: string): boolean {
  return /\b(audit|deep[\s-]?dive|analy[sz]e (everything|all|the (whole|entire))|review (everything|all|the (whole|entire))|full (review|analysis|audit)|strateg(y|ize|ise|ic plan)|optimi[sz]e (everything|all|the (whole|entire))|benchmark)\b/i.test(
    message,
  );
}

const DIRECTOR_TOOL: ToolSchema = {
  name: "director_reply",
  description:
    "Reply to the operator as their AI Director, then optionally surface a few navigation " +
    "suggestions that help them act on your advice (create an agent, open an agent's chat, " +
    "jump to training / live ops / insights).",
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description:
          "Your conversational reply to the operator (≤160 words). Be a sharp, supportive " +
          "operator-of-operators: strategic, concrete, and decisive. Never tell them to 'go find " +
          "a tab' — instead, attach a suggestion chip for the relevant destination.",
      },
      suggestions: {
        type: "array",
        description:
          "0–3 navigation chips that help the operator act on your reply. Only include when " +
          "genuinely useful. Use open_agent_chat ONLY with an agentId from the operator's fleet.",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...DIRECTOR_SUGGESTION_KINDS] },
            label: { type: "string", description: "Short button label (≤24 chars)." },
            agentId: {
              type: "string",
              description: "Required for open_agent_chat — an existing agent id from the fleet.",
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

function buildSystemPrompt(input: PlanDirectorInput, deep: boolean): string {
  const { fleet, stats } = input;
  const fleetLines =
    fleet.length === 0
      ? "(No agents yet — the operator hasn't created their first agent.)"
      : fleet
          .map((a) => `- ${a.name || "Unnamed agent"} (${a.role || "agent"}) · id=${a.id}`)
          .join("\n");

  const statsLine = stats
    ? `Fleet activity (last 7 days): ${stats.calls7d ?? 0} calls, ${stats.bookings7d ?? 0} bookings, ${stats.openTasks ?? 0} open tasks.`
    : "Fleet activity: (not available).";

  return `You are the Director — the operator's always-on AI manager inside Wireline. You sit ABOVE the individual AI agents: you help the operator plan their fleet, decide what agents to hire, coach those agents' behaviour, and read the room across every call/email/text.

Who you're talking to: the operator who owns this account. They direct the whole business through chat; you're their right hand.

Your job each turn:
1. Reply directly, warmly, and decisively — like a seasoned ops leader. No filler, no "as an AI".
2. When the operator has NO agents yet, your priority is to help them stand up their first agent: ask what their business does (if unknown) and recommend a concrete first agent (role + what it should handle), then attach a "create_agent" suggestion.
3. When they DO have agents, help them get more out of the fleet: which agent to coach, what to turn on, what the numbers say. Attach an open_agent_chat suggestion (with that agent's id) when pointing them at a specific agent.
4. Use suggestion chips instead of telling them to navigate. Keep to 0–3, only when useful.
5. You do not change agent settings yourself — that happens in each agent's own chat. You advise and route.

${deep ? "DEEP MODE: the operator asked for serious strategic analysis. Take your time, reason across the whole fleet, and deliver a structured, prioritized plan." : "Keep replies tight and skimmable."}

The operator's fleet:
${fleetLines}

${statsLine}`;
}

function buildUserContent(input: PlanDirectorInput): string {
  const transcript = input.history
    .slice(-12)
    .map((m) => `${m.role === "operator" ? "Operator" : "You (Director)"}: ${m.content}`)
    .join("\n");
  const prefix = transcript ? `Conversation so far:\n${transcript}\n\n` : "";
  return `${prefix}Operator's new message:\n${input.operatorMessage}`;
}

interface RawDirectorReply {
  reply?: unknown;
  suggestions?: unknown;
}

function clampString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

/**
 * Validate + normalize Claude's raw tool output into a safe DirectorPlan.
 * Drops malformed suggestions and any open_agent_chat that doesn't reference
 * an agent the operator actually owns.
 */
export function normalizeDirectorPlan(
  raw: RawDirectorReply,
  fleet: DirectorFleetAgent[],
  model: "sonnet" | "opus",
): DirectorPlan {
  const reply =
    clampString(raw.reply, 4000) ||
    "I'm here — tell me about your business and I'll help you stand up the right agent.";

  const ownedIds = new Set(fleet.map((a) => a.id));
  const suggestions: DirectorSuggestion[] = [];
  const seen = new Set<string>();
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
      if (k === "open_agent_chat") {
        const candidate = clampString(rec.agentId, 64);
        if (!candidate || !ownedIds.has(candidate)) continue; // drop invalid target
        agentId = candidate;
      }
      const dedupeKey = `${k}:${agentId ?? ""}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      suggestions.push({ kind: k, label, agentId });
      if (suggestions.length >= 3) break;
    }
  }

  return { reply, suggestions, model };
}

/**
 * Plan one Director turn. Sonnet by default; escalates to Opus + adaptive
 * thinking when the operator asks for deep strategic analysis. Throws if the
 * model layer is unavailable — the caller decides the fallback copy.
 */
export async function planDirector(input: PlanDirectorInput): Promise<DirectorPlan> {
  const deep = wantsDeepAnalysis(input.operatorMessage);
  const model = deep ? CLAUDE_MODELS.OPUS : CLAUDE_MODELS.SONNET;
  const {
    result: raw,
    thinking,
    thinkingDurationMs,
  } = await runStructuredWithThinking<RawDirectorReply>({
    system: buildSystemPrompt(input, deep),
    user: buildUserContent(input),
    tool: DIRECTOR_TOOL,
    model,
    deepThink: deep,
    maxTokens: deep ? 3000 : 1200,
  });
  const plan = normalizeDirectorPlan(raw, input.fleet, deep ? "opus" : "sonnet");
  return { ...plan, reasoning: thinking, thinkingDurationMs };
}
