import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function check(prices: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    APP_URL: "https://botbound.app",
    TWILIO_WEBHOOK_BASE_URL: "https://botbound.app",
    POSTGRES_URL: "postgresql://user:pass@database.invalid/db",
    DATABASE_POOL_URL: "postgresql://user:pass@pooler.invalid/db",
    INTERNAL_JWT_SECRET: "fixture",
    OAUTH_STATE_SECRET: "fixture",
    OAUTH_BRIDGE_SECRET: "fixture",
    MCP_OAUTH_TOKEN_PEPPER: "fixture",
    WIRELINE_DATA_KEY: "fixture",
    UPSTASH_REDIS_REST_URL: "https://redis.invalid",
    UPSTASH_REDIS_REST_TOKEN: "fixture",
    OPENAI_API_KEY: "fixture",
    OPENAI_PROJECT_ID: "fixture",
    OPENAI_WEBHOOK_SECRET: "fixture",
    TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
    TWILIO_AUTH_TOKEN: "fixture",
    TWILIO_API_KEY: `SK${"b".repeat(32)}`,
    TWILIO_API_SECRET: "fixture",
    PLATFORM_SMS_FROM: "+13125550100",
    STRIPE_SECRET_KEY: "sk_live_fixture",
    STRIPE_WEBHOOK_SECRET: "fixture",
    VITE_STRIPE_PUBLIC_KEY: "pk_live_fixture",
    RESEND_API_KEY: "fixture",
    AGENTMAIL_API_KEY: "fixture",
    AGENTMAIL_DEFAULT_DOMAIN: "mail.botbound.app",
    CRON_SECRET: "fixture",
    WIRELINE_RECONCILE_STRIPE_PORTAL: "true",
    FEDERAL_DNC_API_URL: "https://dnc.invalid",
    FEDERAL_DNC_API_KEY: "fixture-token",
    OPENAI_API_KEY_CHATKIT: "fixture",
    GEMINI_API_KEY: "fixture",
    AI_GATEWAY_API_KEY: "fixture",
    CORS_ORIGINS: "https://botbound.app",
    WIRELINE_POSTAL_ADDRESS: "fixture",
    PRODUCTION_CHECK: "1",
    ...prices,
  };
  return spawnSync(process.execPath, ["scripts/check-prod-env.mjs"], { env, encoding: "utf8" });
}

describe("production sale interval configuration", () => {
  it("allows Calls without an unregistered platform SMS sender", () => {
    const result = check({ STRIPE_VOICE_PRICE_ID: "price_fixture", PLATFORM_SMS_FROM: undefined });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).not.toContain("MISSING REQUIRED");
    expect(result.stdout).toContain("Optional (informational only)");
    expect(result.stdout).toContain("PLATFORM_SMS_FROM");
  });
  it.each(["STRIPE_VOICE_PRICE_ID", "STRIPE_EMAIL_ANNUAL_PRICE_ID"])(
    "accepts %s while listing deferred intervals informationally",
    (key) => {
      const result = check({ [key]: "price_fixture" });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain("Deferred new-sale intervals");
      expect(result.stdout).not.toContain("MISSING RECOMMENDED");
    },
  );
  it("rejects zero opted-in prices, including when only legacy or unreleased SMS prices exist", () => {
    const result = check({
      STRIPE_STARTER_PRICE_ID: "price_legacy",
      STRIPE_SMS_PRICE_ID: "price_sms",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("NEW_SALE_CATALOG");
  });
  it("rejects malformed enabled prices instead of treating them as a hold", () => {
    const result = check({ STRIPE_VOICE_PRICE_ID: "not-a-price" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Configured new-sale intervals must contain a Stripe price ID");
  });
});
