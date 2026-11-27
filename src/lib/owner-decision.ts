import { playbookCheckFirstRules } from "./agent-playbook";
import type { OwnerDecisionRequest } from "./ai-supervisor";
import { effectiveAutonomy } from "./bot-permission";

/**
 * What the review is asked about the owner, for a message nobody has chosen.
 * On Auto the Bot decides for itself, with the owner's rules. On Full it is
 * asked only about rules the owner wrote: "never asks" is about the Bot's own
 * judgement, not about a case the owner named. At the two check-first levels
 * the message waits anyway, so there is nothing to ask.
 */
export function ownerDecisionRequestFor(
  levels: { agentLevel?: string | null; tenantLevel?: string | null },
  playbook: unknown,
): OwnerDecisionRequest | undefined {
  const level = effectiveAutonomy(levels.agentLevel, levels.tenantLevel);
  const rules = playbookCheckFirstRules(playbook);
  if (level === "auto") return { rules };
  if (level === "full" && rules.length) return { rules, rulesOnly: true };
  return undefined;
}
