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
import type { AccountType } from "../../lib/account-type";

export type ReadinessCheckId = "agent" | "voice" | "phone" | "knowledge" | "rules" | "integrations";

export interface ReadinessCheck {
  id: ReadinessCheckId;
  /** Short label for chips / tiles. */
  label: string;
  /** Whether this capability is satisfied. */
  done: boolean;
  /** What's left to do, phrased as a next action (used by the readiness stage). */
  todo: string;
  /** A natural-language line the Account Holder could say to the co-pilot to do it. */
  copilotHint: string;
}

export interface SoftReadinessNudge {
  id: string;
  label: string;
  hint: string;
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
  /** The first incomplete, Account Holder-actionable check — the "do this next". */
  nextStep: ReadinessCheck | null;
  /** True once every check passes. */
  ready: boolean;
  /** Optional polish — never blocks the launch score. */
  softNudges: SoftReadinessNudge[];
}

export function computeAgentReadiness(
  selectedAgent: any | null,
  agentConfig: any,
  integrationStatus: Record<string, { connected: boolean }> | null,
  options?: { accountType?: AccountType },
): AgentReadiness {
  const isPersonal = options?.accountType === "personal";
  const hasAgent = !!selectedAgent;
  const hasVoice = !!selectedAgent?.voice_id || selectedAgent?.channel === "email";
  const hasPhone = !!selectedAgent?.phone_number || !!selectedAgent?.transfer_phone;
  const hasKnowledge = !!selectedAgent?.website_url || (agentConfig?.knowledge?.length ?? 0) > 0;
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
    // A dedicated number is a Business concept.
    // by routing your own live call to them (widget / Siri / App Intents) or by
    // having them place calls on your behalf — a number is optional, so it's not
    // part of the personal readiness gate.
    ...(isPersonal
      ? []
      : [
          {
            id: "phone" as const,
            label: "Number",
            done: hasPhone,
            todo: "Assign a phone number",
            copilotHint: "Assign a dedicated phone number so callers can reach this agent.",
          },
        ]),
    {
      id: "knowledge",
      label: "Training",
      done: hasKnowledge,
      todo: "Add training source",
      copilotHint: "Add your website and a few FAQs so the agent answers accurately.",
    },
    {
      id: "rules",
      label: "Rules",
      done: hasRules,
      todo: "Set the rules",
      copilotHint: "Set escalation rules and a do-not-say list for compliance.",
    },
    // Connecting a CRM/calendar is a business move. A Personal account runs on
    // its own line and rarely wires external tools — including this check would
    // cap a personal agent below "ready" forever, so it's dropped from the
    // personal gate. The connectedIntegrations flag is still computed for any
    // surface that wants to display it.
    ...(isPersonal
      ? []
      : [
          {
            id: "integrations" as const,
            label: "Tools",
            done: connectedIntegrations > 0,
            todo: "Connect a tool",
            copilotHint: "Connect our CRM or calendar so it can take real action.",
          },
        ]),
  ];

  const score = checks.filter((c) => c.done).length;
  const total = checks.length;
  // "agent" is implicitly satisfied whenever a stage renders, so the actionable
  // next step is the first incomplete check after identity.
  const nextStep = checks.find((c) => c.id !== "agent" && !c.done) ?? null;

  const isBusiness =
    !isPersonal && !!(selectedAgent?.is_business_agent ?? selectedAgent?.isBusinessAgent ?? false);
  const softNudges: SoftReadinessNudge[] = [];
  if (isBusiness && hasAgent && !agentConfig?.identity?.chosenAvatarId) {
    softNudges.push({
      id: "presenter-face",
      label: "Presenter face",
      hint: "Pick a catalog face in Agent presence (optional).",
    });
  }

  return {
    score,
    total,
    checks,
    flags: { hasAgent, hasVoice, hasPhone, hasKnowledge, hasRules, connectedIntegrations },
    nextStep,
    ready: score === total,
    softNudges,
  };
}
