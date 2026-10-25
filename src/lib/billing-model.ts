import type { BillingPlansResponse } from "../types/api-billing";

export type BillingModel = "usage" | "plans";

/**
 * Which pricing the server sells. Anything other than an explicit "usage"
 * from /api/billing/plans means the current plans, so public copy is never
 * ahead of what checkout can sell.
 */
export function billingModelFromPayload(payload: unknown): BillingModel {
  if (!payload || typeof payload !== "object") return "plans";
  const plans = payload as BillingPlansResponse;
  return plans.billing_model === "usage" && plans.usage_checkout_available === true
    ? "usage"
    : "plans";
}
