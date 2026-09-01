import { afterEach, describe, expect, it, vi } from "vitest";

import { gatewayCredential, isGatewayCredentialAvailable } from "../src/lib/ai-gateway-auth";
import { isAIGatewayConfigured } from "../src/lib/ai-gateway";
import { validateEnv } from "../src/lib/env-validator";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AI Gateway Preview boundary", () => {
  const managedRuntimeError = () =>
    validateEnv().errors.some((error) => error.var === "OPENAI_API_KEY");

  it("ignores automatically managed OIDC authority in Vercel Preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "automatic-preview-oidc");

    expect(gatewayCredential()).toBe("");
    expect(isGatewayCredentialAvailable()).toBe(false);
    expect(isAIGatewayConfigured()).toBe(false);
  });

  it("ignores inherited static Gateway authority in Vercel Preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("AI_GATEWAY_API_KEY", "inherited-gateway-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");

    expect(gatewayCredential()).toBe("");
    expect(isGatewayCredentialAvailable()).toBe(false);
  });

  it("retains OIDC Gateway authority in canonical Production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "production-oidc");

    expect(gatewayCredential()).toBe("production-oidc");
    expect(isGatewayCredentialAvailable()).toBe(true);
  });

  it.each(["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"])(
    "does not let Preview %s satisfy environment validation",
    (credentialName) => {
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("XAI_API_KEY", "");
      vi.stubEnv("AI_GATEWAY_API_KEY", "");
      vi.stubEnv("VERCEL_OIDC_TOKEN", "");
      vi.stubEnv(credentialName, "inherited-preview-authority");
      expect(managedRuntimeError()).toBe(true);
    },
  );

  it("does not let Production OIDC replace the required OpenAI voice credential", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "production-oidc");
    expect(managedRuntimeError()).toBe(true);
  });
});
