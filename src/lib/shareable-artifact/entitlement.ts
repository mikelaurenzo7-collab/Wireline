/**
 * Entitlement gate for the branded recap and proposal artifact workflow.
 *
 * The plan catalog promises this on Starter Plus and up
 * (`src/lib/plan-catalog.ts`). Free Builder and Starter never publish;
 * their existing plain-email digest continues to work exactly as it does
 * today. Pro and Business also unlock the white-label toggle that hides
 * the Wireline credit line on proposal surfaces.
 */
import type { StripePlan, StripePlanId } from "../plan-catalog";

const BRANDED_ARTIFACT_PLAN_IDS: readonly StripePlanId[] = ["team", "business", "enterprise"];

const WHITE_LABEL_PLAN_IDS: readonly StripePlanId[] = ["business", "enterprise"];

export function isBrandedArtifactEntitled(plan: StripePlan | null | undefined): boolean {
  if (!plan) return false;
  return BRANDED_ARTIFACT_PLAN_IDS.includes(plan.id);
}

export function canWhiteLabelProposals(plan: StripePlan | null | undefined): boolean {
  if (!plan) return false;
  return WHITE_LABEL_PLAN_IDS.includes(plan.id);
}
