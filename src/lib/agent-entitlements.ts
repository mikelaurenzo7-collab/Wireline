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

const PAID_CAPACITY_STATUSES = new Set(["active", "trialing"]);

function normalizedSubscriptionStatus(status: string | null | undefined): string {
  return status?.trim().toLowerCase() || "pending_activation";
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

  const subscriptionStatus = normalizedSubscriptionStatus(input.subscriptionStatus);
  const freeDraftCap = planById("personal")?.max_agents ?? 1;

  // Create and Train remain available without a paid subscription, but only at
  // the Free Builder cap. Legacy settings.maxAgents defaults and stale paid-plan
  // mirrors must not survive cancellation, failed payment, or activation loss.
  if (!PAID_CAPACITY_STATUSES.has(subscriptionStatus)) {
    return {
      subscriptionStatus,
      planAgents: freeDraftCap,
      purchasedExtras: 0,
      effectiveCap: freeDraftCap,
      unlimited: false,
    };
  }

  // Active/trialing workspaces receive their catalog allowance, purchased
  // extras, and any deliberate platform grant stored above that catalog total.
  const plan = planById(input.planId) || planById("personal");
  const planAgents = plan?.max_agents ?? freeDraftCap;
  const purchasedExtras = Math.max(0, Math.floor(input.extraAgents ?? 0));
  const catalogCap = planAgents + purchasedExtras;
  const storedCap =
    typeof input.maxAgents === "number" && Number.isFinite(input.maxAgents)
      ? Math.max(0, Math.floor(input.maxAgents))
      : 0;
  return {
    subscriptionStatus,
    planAgents,
    purchasedExtras,
    effectiveCap: Math.max(catalogCap, storedCap),
    unlimited: false,
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
export function agentCapMessage(cap: number): string {
  return `Agent capacity limit reached. Your plan allows up to ${cap} agent${cap === 1 ? "" : "s"}.`;
}
