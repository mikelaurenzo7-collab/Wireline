import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  gatewayAuthorizationHeaders,
  gatewayCredential,
  isGatewayCredentialAvailable,
} from "../src/lib/ai-gateway-auth";
import { buildSentryStorePayload } from "../src/lib/error-reporter";
import {
  loadPlatformIntegrationFlags,
  perplexityRuntimeAvailable,
} from "../src/lib/platform-integration-flags";
import { distributedLimiterStatus } from "../src/lib/rate-limit";
import {
  inMemoryRateLimitAllowed,
  liveStripeCredentialBlocked,
  requiresPreviewProviderIsolation,
} from "../src/lib/preview-spend-policy";

vi.mock("../src/lib/server-context", () => ({ log: { warn: vi.fn(), error: vi.fn() } }));

const renderProduction = {
  RENDER: "true",
  IS_PULL_REQUEST: "false",
  WIRELINE_DEPLOYMENT_ENVIRONMENT: "production",
  NODE_ENV: "production",
};

beforeEach(() => {
  for (const key of [
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_GIT_COMMIT_REF",
    "VERCEL_GIT_COMMIT_SHA",
    "RENDER",
    "RENDER_SERVICE_ID",
    "RENDER_GIT_BRANCH",
    "RENDER_GIT_COMMIT",
    "IS_PULL_REQUEST",
    "WIRELINE_DEPLOYMENT_ENVIRONMENT",
    "AI_GATEWAY_API_KEY",
    "VERCEL_OIDC_TOKEN",
    "PERPLEXITY_API_KEY",
    "PERPLEXITY_PREVIEW_API_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "WIRELINE_ALLOW_INMEMORY_RATE_LIMIT",
  ])
    vi.stubEnv(key, "");
});

afterEach(() => vi.unstubAllEnvs());

function useEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value ?? "");
}

describe("Render provider boundaries", () => {
  it.each(["production", "preview", "development", "unknown"])(
    "never authorizes Vercel AI Gateway on Render %s, even with inherited credentials",
    (environment) => {
      useEnv({ ...renderProduction, WIRELINE_DEPLOYMENT_ENVIRONMENT: environment });
      vi.stubEnv("AI_GATEWAY_API_KEY", "inherited-key");
      vi.stubEnv("VERCEL_OIDC_TOKEN", "inherited-oidc");
      vi.stubEnv("OPENAI_API_KEY", "direct-openai");
      vi.stubEnv("GEMINI_API_KEY", "direct-gemini");
      expect(gatewayCredential()).toBe("");
      expect(isGatewayCredentialAvailable()).toBe(false);
      expect(gatewayAuthorizationHeaders).toThrow("AI Gateway is not configured");
      expect(loadPlatformIntegrationFlags().gemini).toBe(true);
      expect(process.env.OPENAI_API_KEY).toBe("direct-openai");
    },
  );

  it("fails closed when both hosting identities are present", () => {
    useEnv({ ...renderProduction, VERCEL_ENV: "production", AI_GATEWAY_API_KEY: "old-key" });
    expect(gatewayCredential()).toBe("");
    expect(requiresPreviewProviderIsolation()).toBe(true);
  });

  it.each([
    { IS_PULL_REQUEST: "true" },
    { IS_PULL_REQUEST: "" },
    { WIRELINE_DEPLOYMENT_ENVIRONMENT: "preview" },
    { WIRELINE_DEPLOYMENT_ENVIRONMENT: "development" },
    { WIRELINE_DEPLOYMENT_ENVIRONMENT: "" },
    { VERCEL_ENV: "production" },
  ])(
    "isolates Perplexity and Stripe live authority on non-production or ambiguous Render: %j",
    (override) => {
      useEnv({ ...renderProduction, ...override });
      vi.stubEnv("PERPLEXITY_API_KEY", "production-key");
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_inherited");
      vi.stubEnv("WIRELINE_ALLOW_LIVE_PROVIDER_KEYS_IN_PREVIEW", "true");
      expect(perplexityRuntimeAvailable()).toBe(false);
      expect(liveStripeCredentialBlocked()).toBe(true);
      vi.stubEnv("PERPLEXITY_PREVIEW_API_KEY", "dedicated-preview-key");
      expect(perplexityRuntimeAvailable()).toBe(true);
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_sandbox");
      expect(liveStripeCredentialBlocked()).toBe(false);
    },
  );

  it("preserves direct provider and live Stripe availability for verified Render production", () => {
    useEnv({
      ...renderProduction,
      PERPLEXITY_API_KEY: "live-key",
      STRIPE_SECRET_KEY: "sk_live_key",
    });
    expect(perplexityRuntimeAvailable()).toBe(true);
    expect(liveStripeCredentialBlocked()).toBe(false);
    expect(requiresPreviewProviderIsolation()).toBe(false);
  });
});

describe("Render rate-limit fallback policy", () => {
  it.each(["production", "preview", "unknown"])(
    "requires Redis for Render %s even with a non-production Node mode",
    (environment) => {
      useEnv({
        ...renderProduction,
        WIRELINE_DEPLOYMENT_ENVIRONMENT: environment,
        NODE_ENV: "development",
      });
      expect(distributedLimiterStatus()).toMatchObject({
        ok: false,
        code: "RATE_LIMITER_UNAVAILABLE",
      });
    },
  );

  it("permits only isolated provider-free preview fallback", () => {
    const env = {
      ...renderProduction,
      IS_PULL_REQUEST: "true",
      WIRELINE_ALLOW_INMEMORY_RATE_LIMIT: "true",
      WIRELINE_PREVIEW_DATABASE_ISOLATED: "true",
      WIRELINE_LAUNCH_DEMO_MODE: "true",
    };
    expect(inMemoryRateLimitAllowed(env)).toBe(true);
    expect(inMemoryRateLimitAllowed({ ...env, OPENAI_API_KEY: "inherited-live-key" })).toBe(false);
    expect(inMemoryRateLimitAllowed({ ...env, GEMINI_API_KEY: "inherited-live-key" })).toBe(false);
    expect(inMemoryRateLimitAllowed({ ...env, WIRELINE_PREVIEW_DATABASE_ISOLATED: "" })).toBe(
      false,
    );
  });

  it("refuses ambiguous Render in-memory overrides despite production NODE_ENV", () => {
    expect(
      inMemoryRateLimitAllowed({
        ...renderProduction,
        IS_PULL_REQUEST: "",
        WIRELINE_ALLOW_INMEMORY_RATE_LIMIT: "true",
      }),
    ).toBe(false);
  });
});

describe("Render error release metadata", () => {
  it("labels production and preview with the actual Render revision and environment", () => {
    useEnv({ ...renderProduction, RENDER_GIT_COMMIT: "A".repeat(40) });
    expect(buildSentryStorePayload(new Error("test"))).toMatchObject({
      environment: "production",
      release: "a".repeat(40),
    });
    vi.stubEnv("IS_PULL_REQUEST", "true");
    expect(buildSentryStorePayload(new Error("test"))).toMatchObject({
      environment: "preview",
      release: "a".repeat(40),
    });
  });

  it("omits a spoofed Vercel release when hosting identity conflicts", () => {
    useEnv({
      ...renderProduction,
      RENDER_GIT_COMMIT: "a".repeat(40),
      VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
    });
    const payload = buildSentryStorePayload(new Error("test"));
    expect(payload.environment).toBe("unknown");
    expect(payload).not.toHaveProperty("release");
  });
});
