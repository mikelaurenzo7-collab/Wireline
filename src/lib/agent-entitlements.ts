export interface AgentEntitlementInput {
  isOwner: boolean;
  subscriptionStatus?: string | null;
  planId?: string | null;
  maxAgents?: number | null;
  extraAgents?: number | null;
}

export interface AgentEntitlement {
  subscriptionStatus: string;
  planAgents: number | null;
  purchasedExtras: number;
  effectiveCap: number | null;
  unlimited: boolean;
}

function normalizedSubscriptionStatus(status: string | null | undefined): string {
  return status?.trim().toLowerCase() || "pending_activation";
}

/**
 * Every plan includes unlimited Bots. A stored maxAgents value, an extra-Bot
 * add-on, or an inactive subscription does not turn creation into a 402.
 * Running out of Bot identities is a separate conflict, not a plan charge.
 */
export function resolveAgentEntitlement(input: AgentEntitlementInput): AgentEntitlement {
  return {
    subscriptionStatus: input.isOwner
      ? "active"
      : normalizedSubscriptionStatus(input.subscriptionStatus),
    planAgents: null,
    purchasedExtras: 0,
    effectiveCap: null,
    unlimited: true,
  };
}

export function agentCapHit(agentCount: number, entitlement: AgentEntitlement): boolean {
  return entitlement.effectiveCap !== null && agentCount >= entitlement.effectiveCap;
}

/**
 * Message shown when a workspace is already at its agent cap.
 *
 * Lives here rather than at each call site because the web route and the draft
 * service both raise it, and the two copies had already drifted from the rest of
 * the product: everywhere else counts are pluralised, but this sentence hardcoded
 * "agents" and so read "up to 1 agents" — the free-plan cap, and therefore the
 * wording most workspaces actually hit.
 */
export function agentCapMessage(cap: number, unlimited = false): string {
  if (unlimited) {
    return "This workspace has reached the most Bots one workspace can hold. Contact support to add more.";
  }
  return cap === 1
    ? "Your plan includes 1 Bot. Change your current Bot in its Workspace to give it a new job."
    : `Your plan includes up to ${cap} Bots. Change an existing Bot in its Workspace to give it a new job.`;
}

/** Code for the Bot cap. No plan sold today adds Bots, so it is not a payment prompt. */
export const AGENT_CAPACITY_REACHED = "AGENT_CAPACITY_REACHED";
