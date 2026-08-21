import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV_REGISTRY, validateEnv } from "../src/lib/env-validator";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Vapi environment boundary", () => {
  const deployment = read("scripts/check-deployment-boundaries.mjs");
  const productionCheck = read("scripts/check-prod-env.mjs");
  const health = read("scripts/check-vercel-env-health.mjs");
  const sync = read("scripts/sync-vapi-env-to-vercel.mjs");

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects the retired browser key instead of accepting it as optional voice config", () => {
    expect(ENV_REGISTRY.some((entry) => entry.name === "VITE_VAPI_PUBLIC_KEY")).toBe(false);

    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("VITE_VAPI_PUBLIC_KEY", "retired-browser-value");

    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        var: "VITE_VAPI_PUBLIC_KEY",
        group: "voice",
        message: expect.stringContaining("Retired browser credential must be removed"),
      }),
    );
  });

  it("requires native xAI credentials and fails production on the retired browser publishable key", () => {
    expect(productionCheck).toContain('"XAI_API_KEY"');
    expect(productionCheck).toContain('"XAI_SIP_ALLOWED_ADDRESSES"');
    expect(productionCheck).not.toContain('"VITE_VAPI_PUBLIC_KEY"');
    const requiredStart = productionCheck.indexOf("const required = [");
    const recommendedStart = productionCheck.indexOf("const recommended = [");
    const requiredBlock = productionCheck.slice(requiredStart, recommendedStart);
    expect(requiredBlock).toContain('"XAI_API_KEY"');
    expect(requiredBlock).not.toContain('"VAPI_PRIVATE_KEY"');
    expect(deployment).toContain('requireValue("XAI_API_KEY"');
    expect(deployment).not.toContain('requireValue("VAPI_PRIVATE_KEY"');
    expect(deployment).toContain(
      "VITE_VAPI_PUBLIC_KEY: retired browser credential must be removed before production",
    );
    expect(deployment).toContain("failures.push(");
  });

  it("rejects the retired key in previews and reports it in environment health", () => {
    expect(deployment).toContain('"VITE_VAPI_PUBLIC_KEY"');
    expect(deployment).toContain("production-only configuration");
    expect(health).toContain('const retired = ["VITE_VAPI_PUBLIC_KEY"]');
    expect(health).toContain("ROTATION REQUIRED");
    expect(health).toContain("No secret values were requested or printed");
  });

  it("rotates server credentials in production only without reading or printing values", () => {
    expect(sync).toContain('const TARGETS = ["production"]');
    expect(sync).toContain("VAPI_PRIVATE_KEY: privateKey");
    expect(sync).toContain("VAPI_WEBHOOK_SECRET: webhookSecret");
    expect(sync).not.toContain("VITE_VAPI_PUBLIC_KEY: publicKey");
    expect(sync).not.toContain("decrypt=true");
    expect(sync).not.toContain("console.log(webhookSecret)");
    expect(sync).toContain("removeLegacyPublicKey");
    expect(sync).toContain("No credential values were requested from Vercel or printed");
  });
});
