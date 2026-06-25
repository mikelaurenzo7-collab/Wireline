export function gatewayCredential(): string {
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
