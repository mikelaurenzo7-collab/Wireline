import { getDeploymentIdentity, isPreviewDeployment } from "./deployment-environment";

export function gatewayCredential(): string {
  const identity = getDeploymentIdentity();
  // Render uses direct provider routes. Inherited Vercel credentials cannot
  // silently re-enable the retired Gateway transport on the new host.
  if (identity.provider === "render" || identity.provider === "conflict") return "";
  // Preview deployments are deliberately provider-free unless a future,
  // separately named and budget-capped credential receives an explicit policy.
  // Vercel may inject OIDC automatically, so raw token presence must not turn an
  // isolated QA Preview into a billable AI Gateway runtime.
  if (isPreviewDeployment()) return "";
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
