import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const envValidator = readFileSync(resolve(process.cwd(), "src/lib/env-validator.ts"), "utf8");
const prodCheck = readFileSync(resolve(process.cwd(), "scripts/check-prod-env.mjs"), "utf8");

describe("production environment launch policy", () => {
  it("distinguishes production from Vercel preview", () => {
    expect(envValidator).toContain('process.env.VERCEL_ENV === "production"');
    expect(envValidator).not.toContain('process.env.VERCEL === "1"');
  });

  it("requires monetization, email delivery, and outbound compliance in production", () => {
    for (const key of [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "RESEND_API_KEY",
      "FEDERAL_DNC_API_URL",
      "FEDERAL_DNC_API_KEY",
    ]) {
      const start = envValidator.indexOf(`name: "${key}"`);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(envValidator.slice(start, start + 350)).toContain("requiredInProd: true");
      expect(prodCheck.slice(prodCheck.indexOf(`"${key}"`) - 50)).toContain(`"${key}"`);
    }
  });

  it("requires HTTPS for the DNC provider endpoint", () => {
    expect(envValidator).toContain("const isHttpsUrl");
    expect(envValidator).toContain("validate: (value) => !value || isHttpsUrl(value)");
    expect(prodCheck).toContain('new URL(String(value).trim()).protocol === "https:"');
  });
});
