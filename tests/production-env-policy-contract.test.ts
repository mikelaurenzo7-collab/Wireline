import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isProductionDeployment } from "../src/lib/deployment-environment";

const envValidator = readFileSync(resolve(process.cwd(), "src/lib/env-validator.ts"), "utf8");
const prodCheck = readFileSync(resolve(process.cwd(), "scripts/check-prod-env.mjs"), "utf8");
const deploymentBoundaryPath = resolve(process.cwd(), "scripts/check-deployment-boundaries.mjs");
const deploymentBoundary = readFileSync(deploymentBoundaryPath, "utf8");
const vercelBuild = readFileSync(resolve(process.cwd(), "scripts/vercel-build.mjs"), "utf8");
const serverContext = readFileSync(resolve(process.cwd(), "src/lib/server-context.ts"), "utf8");
const startup = readFileSync(resolve(process.cwd(), "src/lib/startup.ts"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));

const runPreviewBoundary = (overrides: NodeJS.ProcessEnv = {}) =>
  spawnSync(process.execPath, [deploymentBoundaryPath], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH || "",
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      ...overrides,
    },
  });

const runProductionBoundary = (appUrl: string) =>
  spawnSync(process.execPath, [deploymentBoundaryPath], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH || "",
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      POSTGRES_URL: "postgresql://launch.invalid/botbound",
      DATABASE_POOL_URL: "postgresql://pool.launch.invalid/botbound",
      INTERNAL_JWT_SECRET: "configured",
      WIRELINE_DATA_KEY: "configured",
      OAUTH_STATE_SECRET: "configured",
      OAUTH_BRIDGE_SECRET: "configured",
      MCP_OAUTH_TOKEN_PEPPER: "configured",
      OPENAI_API_KEY: "configured",
      XAI_API_KEY: "configured",
      XAI_SIP_ALLOWED_ADDRESSES: "configured",
      TWILIO_ACCOUNT_SID: "configured",
      TWILIO_API_KEY: "configured",
      TWILIO_API_SECRET: "configured",
      TWILIO_AUTH_TOKEN: "configured",
      PLATFORM_SMS_FROM: "+13125550100",
      STRIPE_SECRET_KEY: "sk_live_configured",
      STRIPE_WEBHOOK_SECRET: "configured",
      VITE_STRIPE_PUBLIC_KEY: "pk_live_configured",
      RESEND_API_KEY: "configured",
      UPSTASH_REDIS_REST_URL: "https://launch.invalid",
      UPSTASH_REDIS_REST_TOKEN: "configured",
      CRON_SECRET: "configured",
      APP_URL: appUrl,
    },
  });

describe("production environment launch policy", () => {
  it("distinguishes production from Vercel preview even though NODE_ENV is production", () => {
    expect(isProductionDeployment({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(false);
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
    expect(prodCheck).toContain("/^(?:sk|rk)_(?:test|live)_/");
    expect(envValidator).toContain("least-privilege rk_live_");
  });

  it("pins every production-generated URL to the exact BotBound origin", () => {
    const appUrlStart = envValidator.indexOf('name: "APP_URL"');
    expect(appUrlStart).toBeGreaterThanOrEqual(0);
    expect(envValidator.slice(appUrlStart, appUrlStart + 500)).toContain("requiredInProd: true");
    expect(envValidator.slice(appUrlStart, appUrlStart + 500)).toContain(
      "value === BOTBOUND_PRODUCTION_ORIGIN",
    );
    expect(startup).toContain('if (!IS_PROD && !process.env.APP_URL) recommended.push("APP_URL")');

    const requiredBlock = prodCheck.slice(
      prodCheck.indexOf("const required = ["),
      prodCheck.indexOf("const recommended = ["),
    );
    expect(requiredBlock).toContain('"APP_URL"');
    expect(prodCheck).toContain('String(value) === "https://botbound.me"');
    expect(deploymentBoundary).toContain(
      'const CANONICAL_PRODUCTION_ORIGIN = "https://botbound.me"',
    );
    expect(deploymentBoundary).toContain(
      'canonicalProductionUrl("TWILIO_WEBHOOK_BASE_URL", false)',
    );

    const canonical = runProductionBoundary("https://botbound.me");
    expect(`${canonical.stdout}${canonical.stderr}`).toContain(
      "Deployment-boundary check passed for production",
    );
    expect(canonical.status).toBe(0);

    for (const wrongOrigin of [
      "https://trywireline.com",
      "https://botbound.me/",
      "https://www.botbound.me",
      "https://botbound.me.example.com",
    ]) {
      const result = runProductionBoundary(wrongOrigin);
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "APP_URL: must be exactly https://botbound.me",
      );
    }
  });

  it("does not treat LiveAvatar as a production-readiness credential", () => {
    const recommendedStart = prodCheck.indexOf("const recommended = [");
    const optionalStart = prodCheck.indexOf("const optional = [");
    const recommendedBlock = prodCheck.slice(recommendedStart, optionalStart);
    const optionalBlock = prodCheck.slice(optionalStart);

    expect(recommendedStart).toBeGreaterThanOrEqual(0);
    expect(optionalStart).toBeGreaterThan(recommendedStart);
    expect(recommendedBlock).not.toContain('"LIVEAVATAR_API_KEY"');
    expect(recommendedBlock).not.toContain('"XAI_API_KEY"');
    expect(prodCheck.slice(prodCheck.indexOf("const required = ["), recommendedStart)).toContain(
      '"XAI_API_KEY"',
    );
    expect(optionalBlock).not.toContain('"LIVEAVATAR_API_KEY"');
    expect(optionalBlock).not.toContain('"LIVEAVATAR_DEFAULT_AVATAR_ID"');
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

  it("marks no-database server import smoke so production env logs stay actionable", () => {
    const smokeServer = packageJson.scripts["smoke:server"];

    expect(smokeServer).toContain("WIRELINE_IMPORT_SMOKE_NO_DATABASE");
    expect(smokeServer).toContain("delete process.env.DATABASE_POOL_URL");
    expect(smokeServer).toContain("delete process.env.POSTGRES_URL");
    expect(serverContext).toContain(
      "Database intentionally unavailable for no-database import smoke",
    );
    expect(startup).toContain("Skipping startup env error log during no-database import smoke");
    expect(startup).toContain(
      "No-database import smoke validated import-safe degraded startup path",
    );
    expect(startup).not.toContain(
      "No-database import smoke observed missing prod env vars as expected",
    );
  });

  it("fails preview builds that inherit production credentials or provider configuration", () => {
    for (const [name, configuredValue] of [
      ["POSTGRES_URL", "postgresql://production.invalid/wireline"],
      ["STRIPE_SECRET_KEY", "sk_live_configured"],
      ["VAPI_PRIVATE_KEY", "configured"],
      ["VITE_VAPI_PUBLIC_KEY", "configured"],
      ["APP_URL", "https://trywireline.com"],
      ["WIRELINE_SELF_SERVE_BILLING_ENABLED", "true"],
      ["WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA", "a".repeat(40)],
    ]) {
      const result = runPreviewBoundary({ [name]: configuredValue });
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(name);
    }

    const cleanPreview = runPreviewBoundary();
    expect(cleanPreview.status).toBe(0);

    const xaiSandboxPreview = runPreviewBoundary({ XAI_API_KEY: "sandbox-xai-key" });
    expect(xaiSandboxPreview.status).toBe(0);
    expect(`${xaiSandboxPreview.stdout}${xaiSandboxPreview.stderr}`).toContain(
      "Deployment-boundary check passed for preview",
    );

    const openaiPreview = runPreviewBoundary({ OPENAI_API_KEY: "sk-live-configured" });
    expect(openaiPreview.status).toBe(1);
    expect(`${openaiPreview.stdout}${openaiPreview.stderr}`).toContain("OPENAI_API_KEY");

    expect(deploymentBoundary).toContain("production-only configuration");
    expect(deploymentBoundary).toContain("credential-like project configuration");
    expect(deploymentBoundary).toContain("WIRELINE_LAUNCH_DEMO_MODE=false");
    expect(deploymentBoundary).toContain('"XAI_API_KEY"');
    expect(deploymentBoundary).not.toContain("WIRELINE_ALLOW_LIVE_PROVIDER_KEYS_IN_PREVIEW");
    expect(vercelBuild).toContain("configurePreviewEnvironment");
    expect(vercelBuild).not.toContain("runtime will disable");
  });

  it("binds self-serve billing to the audited main production release channel", () => {
    expect(deploymentBoundary).toContain('value("VERCEL_GIT_COMMIT_REF")');
    expect(deploymentBoundary).toContain('gitRef !== "main"');
    expect(deploymentBoundary).toContain(
      "self-serve billing may only ship from the audited main production release channel",
    );
    expect(deploymentBoundary).toContain("per-commit release-SHA rotation is retired");
    expect(deploymentBoundary).toContain(
      "WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA is legacy configuration",
    );
    expect(deploymentBoundary).not.toContain("releaseSha !== deploymentSha");
  });
});
