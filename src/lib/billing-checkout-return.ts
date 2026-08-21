export type CheckoutReturnFlow = "plan" | "runtime_balance" | "live_video";

export type CheckoutReturnVerification = {
  status?: string;
  payment_status?: string;
  synced?: boolean;
  credit_granted?: boolean;
  live_video_enabled?: boolean;
};

export type CheckoutReturnOutcome =
  | "fulfilled"
  | "retired"
  | "pending"
  | "expired"
  | "invalid"
  | "retryable";

const CHECKOUT_RETURN_QUERY_KEYS = [
  "billing",
  "credits",
  "balance",
  "live_video",
  "session_id",
] as const;

export function checkoutReturnFlowFromSearch(search: string): CheckoutReturnFlow | null {
  const params = new URLSearchParams(search);
  return params.get("billing") === "success"
    ? "plan"
    : params.get("balance") === "success" || params.get("credits") === "success"
      ? "runtime_balance"
      : params.get("live_video") === "success"
        ? "live_video"
        : null;
}

export function hasCheckoutReturnToVerify(search: string): boolean {
  const params = new URLSearchParams(search);
  return checkoutReturnFlowFromSearch(search) !== null && Boolean(params.get("session_id"));
}

/**
 * A Checkout return is final only when fulfillment reached the product state
 * promised by that Checkout, a paid legacy SKU was safely reconciled into its
 * retired state, or the server proved the reference itself is invalid.
 * Network/auth/server failures and delayed payment methods retain the session
 * proof so a refresh can safely retry the idempotent verifier.
 */
export function classifyCheckoutReturn(
  flow: CheckoutReturnFlow,
  responseStatus: number | null,
  verification: CheckoutReturnVerification | null,
): CheckoutReturnOutcome {
  if (responseStatus === 400 || responseStatus === 404) return "invalid";
  if (responseStatus === null || responseStatus < 200 || responseStatus >= 300 || !verification) {
    return "retryable";
  }
  if (verification.status === "expired") return "expired";
  if (verification.payment_status === "unpaid") return "pending";
  if (
    flow === "live_video" &&
    (verification.payment_status === "paid" ||
      verification.payment_status === "no_payment_required")
  ) {
    return "retired";
  }

  const fulfilled =
    flow === "plan"
      ? verification.synced === true
      : flow === "runtime_balance"
        ? verification.credit_granted === true
        : false;
  return fulfilled ? "fulfilled" : "retryable";
}

export function shouldFinalizeCheckoutReturn(outcome: CheckoutReturnOutcome): boolean {
  return (
    outcome === "fulfilled" ||
    outcome === "retired" ||
    outcome === "expired" ||
    outcome === "invalid"
  );
}

export function checkoutReturnUrlWithoutProof(
  pathname: string,
  search: string,
  hash: string,
): string {
  const params = new URLSearchParams(search);
  for (const key of CHECKOUT_RETURN_QUERY_KEYS) params.delete(key);
  const cleanedSearch = params.toString();
  return `${pathname}${cleanedSearch ? `?${cleanedSearch}` : ""}${hash}`;
}
