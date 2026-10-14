import { planById } from "./plan-catalog";
import { BOT_MARK_IDENTITY_CAPACITY } from "./bot-mark";
import { clampAgentCapacity, clampExtraAgentAddons } from "./agent-capacity";

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
      planAgents: BOT_MARK_IDENTITY_CAPACITY,
      purchasedExtras: 0,
      effectiveCap: BOT_MARK_IDENTITY_CAPACITY,
      unlimited: false,
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
  const purchasedExtras = clampExtraAgentAddons(input.extraAgents);
  const catalogCap = planAgents + purchasedExtras;
  const storedCap =
    typeof input.maxAgents === "number" && Number.isFinite(input.maxAgents)
      ? clampAgentCapacity(input.maxAgents)
      : 0;
  return {
    subscriptionStatus,
    planAgents,
    purchasedExtras,
    // A workspace cannot promise more Bots than the non-repeating identity
    // namespace can represent. Published paid capacity tops out at 115 today;
    // this clamp also keeps owner and deliberate platform grants truthful.
    effectiveCap: clampAgentCapacity(Math.max(catalogCap, storedCap)),
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
  return cap === 1
    ? "Your plan includes 1 Bot. Edit your current Bot in Studio to change what it does."
    : `Your plan includes up to ${cap} Bots. Edit an existing Bot in Studio to change what it does.`;
}

/** Code for the Bot cap. No plan sold today adds Bots, so it is not a payment prompt. */
export const AGENT_CAPACITY_REACHED = "AGENT_CAPACITY_REACHED";
