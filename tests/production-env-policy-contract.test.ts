import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isProductionDeployment } from "../src/lib/deployment-environment";

const envValidator = readFileSync(resolve(process.cwd(), "src/lib/env-validator.ts"), "utf8");
const prodCheck = readFileSync(resolve(process.cwd(), "scripts/check-prod-env.mjs"), "utf8");

describe("production environment launch policy", () => {
  it("distinguishes production from Vercel preview even though NODE_ENV is production", () => {
    expect(isProductionDeployment({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(
      false,
    );
    expect(isProductionDeployment({ VERCEL_ENV: "development", NODE_ENV: "production" })).toBe(
      false,
    );
    expect(isProductionDeployment({ VERCEL_ENV: "production", NODE_ENV: "development" })).toBe(
      true,
    );
    expect(isProductionDeployment({ NODE_ENV: "production" })).toBe(true);
    expect(envValidator).toContain("isProductionDeployment()");
    expect(envValidator).not.toContain('process.env.VERCEL === "1"');
  });

  it("requires monetization and email delivery in production; Federal DNC is deferred checklist", () => {
    for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY"]) {
      const start = envValidator.indexOf(`name: "${key}"`);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(envValidator.slice(start, start + 350)).toContain("requiredInProd: true");
      expect(prodCheck.slice(prodCheck.indexOf(`"${key}"`) - 50)).toContain(`"${key}"`);
    }

    for (const key of ["FEDERAL_DNC_API_URL", "FEDERAL_DNC_API_KEY"]) {
      const start = envValidator.indexOf(`name: "${key}"`);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(envValidator.slice(start, start + 450)).toContain("requiredInProd: false");
      expect(prodCheck).toContain(`"${key}"`);
    }
    expect(prodCheck).toContain("deferred checklist until business registration");
  });

  it("keeps the Twilio Auth Token for webhook validation but prefers a scoped REST key pair", () => {
    expect(prodCheck).toContain("Twilio inbound webhook signature validation");
    expect(prodCheck).toContain('"TWILIO_API_KEY"');
    expect(prodCheck).toContain('"TWILIO_API_SECRET"');
    expect(prodCheck).toContain("twilioApiKeyPairPartial");
    expect(prodCheck).toContain("SK followed by 32 hexadecimal characters");
  });

  it("requires HTTPS for the DNC provider endpoint", () => {
    expect(envValidator).toContain("const isHttpsUrl");
    expect(envValidator).toContain("validate: (value) => !value || isHttpsUrl(value)");
    expect(prodCheck).toContain('new URL(String(value).trim()).protocol === "https:"');
  });
});
