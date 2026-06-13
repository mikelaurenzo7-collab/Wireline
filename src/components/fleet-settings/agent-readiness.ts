/* eslint-disable @typescript-eslint/no-explicit-any -- selectedAgent / agentConfig
 * are the heterogeneous snake_case JSON rows from /api/agents and the per-agent
 * config endpoints. Shared client types belong in contracts/api-types.ts and are
 * tracked separately; this helper intentionally reads the rows as `any`. */

/**
 * agent-readiness — the single source of truth for "is this agent ready to go
 * live?" Both the Studio readiness stage (center canvas) and the tuning rail
 * map (right rail) consume this so the X/6 score and the per-capability state
 * can never drift apart.
 */

export type ReadinessCheckId =
  | "agent"
  | "voice"
  | "phone"
  | "knowledge"
  | "rules"
  | "integrations";

export interface ReadinessCheck {
  id: ReadinessCheckId;
  /** Short label for chips / tiles. */
  label: string;
  /** Whether this capability is satisfied. */
  done: boolean;
  /** What's left to do, phrased as a next action (used by the readiness stage). */
  todo: string;
  /** A natural-language line the operator could say to the co-pilot to do it. */
  copilotHint: string;
}

export interface AgentReadiness {
  /** Number of satisfied checks. */
  score: number;
  /** Total checks (currently 6). */
  total: number;
  checks: ReadinessCheck[];
  /** Convenience booleans for callers that render per-capability state. */
  flags: {
    hasAgent: boolean;
    hasVoice: boolean;
    hasPhone: boolean;
    hasKnowledge: boolean;
    hasRules: boolean;
    connectedIntegrations: number;
  };
  /** The first incomplete, operator-actionable check — the "do this next". */
  nextStep: ReadinessCheck | null;
  /** True once every check passes. */
  ready: boolean;
}

export function computeAgentReadiness(
  selectedAgent: any | null,
  agentConfig: any,
  integrationStatus: Record<string, { connected: boolean }> | null,
): AgentReadiness {
  const hasAgent = !!selectedAgent;
  const hasVoice = !!selectedAgent?.voice_id || selectedAgent?.channel === "email";
  const hasPhone = !!selectedAgent?.phone_number || !!selectedAgent?.transfer_phone;
  const hasKnowledge =
    !!selectedAgent?.website_url || (agentConfig?.knowledge?.length ?? 0) > 0;
  const hasRules = (agentConfig?.directives?.length ?? 0) > 0 || !!agentConfig?.personality;
  const connectedIntegrations = Object.values(integrationStatus ?? {}).filter(
    (item) => item.connected,
  ).length;

  const checks: ReadinessCheck[] = [
    {
      id: "agent",
      label: "Identity",
      done: hasAgent,
      todo: "Create the agent",
      copilotHint: "Spin up a new agent and give it a name and role.",
    },
    {
      id: "voice",
      label: "Voice",
      done: hasVoice,
      todo: "Pick a voice",
      copilotHint: "Give this agent a warm, professional voice.",
    },
    {
      id: "phone",
      label: "Number",
      done: hasPhone,
      todo: "Assign a phone number",
      copilotHint: "Assign a dedicated phone number so callers can reach this agent.",
    },
    {
      id: "knowledge",
      label: "Knowledge",
      done: hasKnowledge,
      todo: "Add knowledge",
      copilotHint: "Add our website and a few FAQs so it answers accurately.",
    },
    {
      id: "rules",
      label: "Rules",
      done: hasRules,
      todo: "Set the rules",
      copilotHint: "Set escalation rules and a do-not-say list for compliance.",
    },
    {
      id: "integrations",
      label: "Tools",
      done: connectedIntegrations > 0,
      todo: "Connect a tool",
      copilotHint: "Connect our CRM or calendar so it can take real action.",
    },
  ];

  const score = checks.filter((c) => c.done).length;
  const total = checks.length;
  // "agent" is implicitly satisfied whenever a stage renders, so the actionable
  // next step is the first incomplete check after identity.
  const nextStep = checks.find((c) => c.id !== "agent" && !c.done) ?? null;

  return {
    score,
    total,
    checks,
    flags: { hasAgent, hasVoice, hasPhone, hasKnowledge, hasRules, connectedIntegrations },
    nextStep,
    ready: score === total,
  };
}
