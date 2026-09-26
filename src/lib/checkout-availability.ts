import { authFetch } from "./api";

/** True only when the server explicitly opens self-serve Stripe Checkout. */
export function isSelfServeCheckoutAvailable(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const body = payload as { checkout_available?: unknown; stripe_configured?: unknown };
  return body.checkout_available === true && body.stripe_configured === true;
}

export function isBillingSettingsPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return path === "/settings/billing" || path.startsWith("/settings/billing?");
}

/**
 * Fail closed: an unreachable catalog must not present a working Checkout CTA.
 */
export async function fetchSelfServeCheckoutAvailable(): Promise<boolean> {
  try {
    const response = await authFetch("/api/billing/plans");
    const body = await response.json().catch(() => null);
    return response.ok && isSelfServeCheckoutAvailable(body);
  } catch {
    return false;
  }
}
