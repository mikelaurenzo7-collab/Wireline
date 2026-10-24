import { planById, type CapacityTier, type CommunicationChannel } from "./plan-catalog";
import { normalizeCustomerBrandText } from "./brand-text";

export type PlanDisplaySource =
  | string
  | {
      id?: string | null;
      name?: string | null;
      channels?: readonly CommunicationChannel[];
      catalogFamily?: "channels" | "legacy";
      capacityTier?: CapacityTier | null;
      capacity_tier?: CapacityTier | null;
    }
  | null
  | undefined;

export const PLAN_CAPACITY_LABELS: Record<CapacityTier, string> = {
  light: "Starter",
  regular: "Plus",
  high: "Pro",
};

const CHANNEL_LABELS: ReadonlyArray<readonly [CommunicationChannel, string]> = [
  ["voice", "Calls"],
  ["email", "Email"],
  ["sms", "SMS"],
];

function displayPlan(
  source: PlanDisplaySource,
): Exclude<PlanDisplaySource, string | null | undefined> | null | undefined {
  const provided = typeof source === "string" ? { id: source } : source;
  return planById(provided?.id) ?? provided;
}

/** Presentation only: canonical names remain the exact Stripe acceptance contract. */
export function getPlanDisplayName(source?: PlanDisplaySource): string {
  const plan = displayPlan(source);
  if (!plan) return "Plan";
  if (plan.id === "personal") return "Personal";
  if (plan.catalogFamily !== "legacy" && plan.channels?.length) {
    return CHANNEL_LABELS.filter(([channel]) => plan.channels?.includes(channel))
      .map(([, label]) => label)
      .join(" + ");
  }
  return (
    normalizeCustomerBrandText(plan.name ?? "")
      .replace(/^BotBound\s+/i, "")
      .trim() || "Plan"
  );
}

export function getPlanCapacityLabel(source?: PlanDisplaySource): string | null {
  const plan = displayPlan(source);
  if (!plan || plan.catalogFamily === "legacy") return null;
  const capacity = plan.capacityTier ?? plan.capacity_tier;
  return capacity ? PLAN_CAPACITY_LABELS[capacity] : null;
}

/** Use when a single line must identify both the selected channels and capacity. */
export function getPlanDisplayLabel(source?: PlanDisplaySource): string {
  const name = getPlanDisplayName(source);
  // Personal is a single package; a capacity suffix ("Starter") reads like the
  // separate legacy Starter plan.
  if (displayPlan(source)?.id === "personal") return name;
  const capacity = getPlanCapacityLabel(source);
  return capacity ? `${name} · ${capacity}` : name;
}
