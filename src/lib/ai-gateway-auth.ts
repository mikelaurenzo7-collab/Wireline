export function gatewayCredential(): string {
  // Preview deployments are deliberately provider-free unless a future,
  // separately named and budget-capped credential receives an explicit policy.
  // Vercel may inject OIDC automatically, so raw token presence must not turn an
  // isolated QA Preview into a billable AI Gateway runtime.
  if (process.env.VERCEL_ENV?.trim().toLowerCase() === "preview") return "";
  return process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || "";
}

export function isGatewayCredentialAvailable(): boolean {
  return Boolean(gatewayCredential());
}

export function gatewayAuthorizationHeaders(): Record<string, string> {
  const credential = gatewayCredential();
  if (!credential) throw new Error("AI Gateway is not configured");
  return {
    Authorization: `Bearer ${credential}`,
    "Content-Type": "application/json",
  };
}
