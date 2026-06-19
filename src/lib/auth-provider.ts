/**
 * Auth surface selection — Wireline native (OAuth + email) vs Clerk.
 *
 * Default is **wireline** (your existing Google / Microsoft / Yahoo + password flow).
 * Clerk is opt-in: set `VITE_AUTH_PROVIDER=clerk` and `VITE_CLERK_PUBLISHABLE_KEY`.
 */
export function isClerkAuthEnabled(): boolean {
  const provider = (import.meta.env.VITE_AUTH_PROVIDER || "").trim().toLowerCase();
  if (provider !== "clerk") return false;
  return Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim());
}

export function isWirelineNativeAuthEnabled(): boolean {
  return !isClerkAuthEnabled();
}
