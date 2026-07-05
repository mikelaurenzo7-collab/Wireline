import { planById } from "./plan-catalog";

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

export function resolveAgentEntitlement(input: AgentEntitlementInput): AgentEntitlement {
  if (input.isOwner) {
    return {
      subscriptionStatus: "active",
      planAgents: null,
      purchasedExtras: 0,
      effectiveCap: null,
      unlimited: true,
    };
  }

  // Look up plan limits from the plan catalog. No subscription defaults to Personal (1 agent).
  const plan = planById(input.planId);
  const planAgents = plan ? plan.max_agents : 1;
  const purchasedExtras = input.extraAgents ?? 0;
  return {
    subscriptionStatus: input.subscriptionStatus || "active",
    planAgents,
    purchasedExtras,
    effectiveCap: planAgents + purchasedExtras,
    unlimited: false,
  };
}

export function agentCapHit(agentCount: number, entitlement: AgentEntitlement): boolean {
  return entitlement.effectiveCap !== null && agentCount >= entitlement.effectiveCap;
}
