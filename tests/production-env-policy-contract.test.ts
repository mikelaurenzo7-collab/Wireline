import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isProductionDeployment } from "../src/lib/deployment-environment";

const envValidator = readFileSync(resolve(process.cwd(), "src/lib/env-validator.ts"), "utf8");
const prodCheck = readFileSync(resolve(process.cwd(), "scripts/check-prod-env.mjs"), "utf8");
const envExample = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
const deploymentBoundaryPath = resolve(process.cwd(), "scripts/check-deployment-boundaries.mjs");
const deploymentBoundary = readFileSync(deploymentBoundaryPath, "utf8");
const vercelBuild = readFileSync(resolve(process.cwd(), "scripts/vercel-build.mjs"), "utf8");
const serverContext = readFileSync(resolve(process.cwd(), "src/lib/server-context.ts"), "utf8");
const startup = readFileSync(resolve(process.cwd(), "src/lib/startup.ts"), "utf8");
const server = readFileSync(resolve(process.cwd(), "server.ts"), "utf8");
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

const runProductionBoundary = (appUrl: string, overrides: NodeJS.ProcessEnv = {}) =>
  spawnSync(process.execPath, [deploymentBoundaryPath], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH || "",
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      POSTGRES_URL:
        "postgresql://postgres:configured@db.ogenlhodmwvyacvnrsnj.supabase.co:5432/postgres",
      DATABASE_POOL_URL:
        "postgresql://postgres.ogenlhodmwvyacvnrsnj:configured@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      CORS_ORIGINS: "https://botbound.app",
      INTERNAL_JWT_SECRET: "configured",
      WIRELINE_DATA_KEY: "configured",
      OAUTH_STATE_SECRET: "configured",
      OAUTH_BRIDGE_SECRET: "configured",
      MCP_OAUTH_TOKEN_PEPPER: "configured",
      OPENAI_API_KEY: "configured",
      OPENAI_PROJECT_ID: "proj_configured",
      OPENAI_WEBHOOK_SECRET: "whsec_configured",
      TWILIO_ACCOUNT_SID: "configured",
      TWILIO_API_KEY: "configured",
      TWILIO_API_SECRET: "configured",
      TWILIO_AUTH_TOKEN: "configured",
      TWILIO_WEBHOOK_BASE_URL: "https://botbound.app",
      PLATFORM_SMS_FROM: "+13125550100",
      STRIPE_SECRET_KEY: "sk_live_configured",
      STRIPE_WEBHOOK_SECRET: "configured",
      VITE_STRIPE_PUBLIC_KEY: "pk_live_configured",
      RESEND_API_KEY: "configured",
      AGENTMAIL_API_KEY: "configured",
      AGENTMAIL_DEFAULT_DOMAIN: "mail.botbound.app",
      UPSTASH_REDIS_REST_URL: "https://launch.invalid",
      UPSTASH_REDIS_REST_TOKEN: "configured",
      CRON_SECRET: "configured",
      WIRELINE_RECONCILE_STRIPE_PORTAL: "true",
      APP_URL: appUrl,
      ...overrides,
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
    expect(startup).toContain("const productionDeployment = isProductionDeployment()");
    expect(startup).toContain("logEnvValidation(productionDeployment)");
    expect(startup).toContain(
      "!importSmokeWithoutDatabase && productionDeployment && !isFederalDncVendorConfigured()",
    );
    expect(startup).toContain(
      "!importSmokeWithoutDatabase && productionDeployment && !process.env.SENTRY_DSN",
    );
    expect(server).toContain("if (isProductionDeployment() && origins.length === 0)");
  });

  it("fails production closed if an operator override moves structured primary off OpenAI", () => {
    for (const provider of ["xai", "grok", "gateway", "gemini"]) {
      const result = runProductionBoundary("https://botbound.app", {
        WIRELINE_STRUCTURED_PRIMARY_PROVIDER: provider,
      });
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "WIRELINE_STRUCTURED_PRIMARY_PROVIDER: production must be unset or openai",
      );
    }
    expect(
      runProductionBoundary("https://botbound.app", {
        WIRELINE_STRUCTURED_PRIMARY_PROVIDER: "openai",
      }).status,
    ).toBe(0);
  });

  it("fails production closed when the Realtime admission reserve is below its derived floor", () => {
    for (const reserve of ["0", "0.30", "0.999", "not-money"]) {
      const result = runProductionBoundary("https://botbound.app", {
        WIRELINE_OPENAI_REALTIME_SESSION_RESERVE_USD: reserve,
      });
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "WIRELINE_OPENAI_REALTIME_SESSION_RESERVE_USD: production must be a finite USD amount of at least 1.00",
      );
    }
    expect(
      runProductionBoundary("https://botbound.app", {
        WIRELINE_OPENAI_REALTIME_SESSION_RESERVE_USD: "1.00",
      }).status,
    ).toBe(0);
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

  it("removes ElevenLabs from the OpenAI-only inventory and rejects stale inheritance", () => {
    const registryBlock = envValidator.slice(
      envValidator.indexOf("export const ENV_REGISTRY"),
      envValidator.indexOf("export function validateEnv"),
    );
    const productionInventory = prodCheck.slice(
      prodCheck.indexOf("const required = ["),
      prodCheck.indexOf("const retiredVoiceEnvKeys = ["),
    );

    expect(registryBlock).not.toContain('name: "ELEVENLABS_API_KEY"');
    expect(envValidator).toContain("const retiredVoiceEnv");
    expect(envValidator).toContain('"ELEVENLABS_API_KEY",');
    expect(productionInventory).not.toContain("ELEVENLABS_API_KEY");
    expect(prodCheck).toContain("const retiredVoiceEnvKeys");
    expect(prodCheck).toContain('"ELEVENLABS_API_KEY",');
    expect(envExample).not.toContain("ELEVENLABS_API_KEY");
  });

  it("pins every production-generated URL to the exact BotBound origin", () => {
    const appUrlStart = envValidator.indexOf('name: "APP_URL"');
    expect(appUrlStart).toBeGreaterThanOrEqual(0);
    expect(envValidator.slice(appUrlStart, appUrlStart + 500)).toContain("requiredInProd: true");
    expect(envValidator.slice(appUrlStart, appUrlStart + 500)).toContain(
      "value === BOTBOUND_PRODUCTION_ORIGIN",
    );
    expect(startup).toContain('if (!IS_PROD && !process.env.APP_URL) recommended.push("APP_URL")');
    expect(startup).toContain(
      "if (productionDeployment && !process.env.CORS_ORIGINS && !process.env.APP_URL)",
    );

    const requiredBlock = prodCheck.slice(
      prodCheck.indexOf("const required = ["),
      prodCheck.indexOf("const recommended = ["),
    );
    expect(requiredBlock).toContain('"APP_URL"');
    expect(prodCheck).toContain('String(value) === "https://botbound.app"');
    expect(deploymentBoundary).toContain(
      'const CANONICAL_PRODUCTION_ORIGIN = "https://botbound.app"',
    );
    expect(deploymentBoundary).toContain('canonicalProductionUrl("TWILIO_WEBHOOK_BASE_URL", true)');

    const canonical = runProductionBoundary("https://botbound.app");
    expect(`${canonical.stdout}${canonical.stderr}`).toContain(
      "Deployment-boundary check passed for production",
    );
    expect(canonical.status).toBe(0);

    for (const wrongOrigin of [
      "https://trywireline.com",
      "https://botbound.app/",
      "https://www.botbound.app",
      "https://botbound.app.example.com",
    ]) {
      const result = runProductionBoundary(wrongOrigin);
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "APP_URL: must be exactly https://botbound.app",
      );
    }
  });

  it("pins both production database lanes to the same canonical Supabase project", () => {
    expect(deploymentBoundary).toContain(
      'const CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF = "ogenlhodmwvyacvnrsnj"',
    );
    expect(deploymentBoundary).toContain('canonicalProductionDatabase("POSTGRES_URL")');
    expect(deploymentBoundary).toContain('canonicalProductionDatabase("DATABASE_POOL_URL")');
    expect(deploymentBoundary).toContain("directEndpoint");
    expect(deploymentBoundary).toContain("poolerUsername");

    for (const override of [
      {
        POSTGRES_URL:
          "postgresql://postgres.otherprojectref12345:configured@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
      },
      {
        DATABASE_POOL_URL:
          "postgresql://postgres.otherprojectref12345:configured@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      },
      {
        // A canonical username must not mask a different direct endpoint.
        POSTGRES_URL:
          "postgresql://postgres.ogenlhodmwvyacvnrsnj:configured@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      },
      {
        // A canonical-looking pooler hostname label must not mask a different
        // project suffix in the shared pooler's username.
        DATABASE_POOL_URL:
          "postgresql://postgres.abcdefghijklmnopqrst:configured@ogenlhodmwvyacvnrsnj.pooler.supabase.com:6543/postgres",
      },
      {
        POSTGRES_URL:
          "postgresql://postgres.ogenlhodmwvyacvnrsnj:configured@api.supabase.com:5432/postgres",
      },
      {
        POSTGRES_URL:
          "postgresql://postgres.ogenlhodmwvyacvnrsnj:configured@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      },
      {
        DATABASE_POOL_URL:
          "postgresql://postgres.ogenlhodmwvyacvnrsnj:configured@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
      },
      {
        DATABASE_POOL_URL:
          "postgresql://postgres:configured@db.ogenlhodmwvyacvnrsnj.supabase.co:5432/postgres",
      },
      { POSTGRES_URL: "postgresql://configured@database.example.com/postgres" },
      { DATABASE_POOL_URL: "not-a-postgres-url" },
    ]) {
      const result = runProductionBoundary("https://botbound.app", override);
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toMatch(/POSTGRES_URL|DATABASE_POOL_URL/);
    }

    for (const override of [
      { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
      { PGSSLMODE: "no-verify" },
      { PGSSLMODE: "disable" },
    ]) {
      const result = runProductionBoundary("https://botbound.app", override);
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toMatch(/NODE_TLS_REJECT_UNAUTHORIZED|PGSSLMODE/);
    }
  }, 30_000);

  it("requires the canonical origin without requiring optional legacy browser access", () => {
    expect(runProductionBoundary("https://botbound.app").status).toBe(0);
    expect(
      runProductionBoundary("https://botbound.app", {
        CORS_ORIGINS: "https://botbound.app,https://trywireline.com",
      }).status,
    ).toBe(0);
    for (const corsOrigins of [
      "",
      "https://trywireline.com",
      "https://botbound.me",
      "https://botbound.app.attacker.example",
      "https://www.botbound.app,https://trywireline.com",
    ]) {
      const result = runProductionBoundary("https://botbound.app", {
        CORS_ORIGINS: corsOrigins,
      });
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("CORS_ORIGINS");
    }
  });

  it("does not treat retired voice or LiveAvatar credentials as production readiness", () => {
    const recommendedStart = prodCheck.indexOf("const recommended = [");
    const optionalStart = prodCheck.indexOf("const optional = [");
    const recommendedBlock = prodCheck.slice(recommendedStart, optionalStart);
    const optionalBlock = prodCheck.slice(optionalStart);

    expect(recommendedStart).toBeGreaterThanOrEqual(0);
    expect(optionalStart).toBeGreaterThan(recommendedStart);
    expect(recommendedBlock).not.toContain('"LIVEAVATAR_API_KEY"');
    expect(recommendedBlock).not.toContain('"XAI_API_KEY"');
    const requiredBlock = prodCheck.slice(
      prodCheck.indexOf("const required = ["),
      recommendedStart,
    );
    expect(requiredBlock).toContain('"OPENAI_API_KEY"');
    expect(requiredBlock).toContain('"OPENAI_PROJECT_ID"');
    expect(requiredBlock).toContain('"OPENAI_WEBHOOK_SECRET"');
    expect(requiredBlock).not.toMatch(/XAI|VAPI|GROK/);
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
      ["TWILIO_WEBHOOK_BASE_URL", "https://botbound.app"],
      ["WIRELINE_SELF_SERVE_BILLING_ENABLED", "true"],
      ["WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA", "a".repeat(40)],
      ["AGENTMAIL_DEFAULT_DOMAIN", "mail.botbound.app"],
      ["WIRELINE_RECONCILE_STRIPE_PORTAL", "true"],
    ]) {
      const result = runPreviewBoundary({ [name]: configuredValue });
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(name);
    }

    const cleanPreview = runPreviewBoundary();
    expect(cleanPreview.status).toBe(0);

    const xaiPreview = runPreviewBoundary({ XAI_API_KEY: "sandbox-xai-key" });
    expect(xaiPreview.status).toBe(1);
    expect(`${xaiPreview.stdout}${xaiPreview.stderr}`).toContain("XAI_API_KEY");

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
  }, 30_000);

  it("permits only the reviewed isolated database lane for authenticated Preview QA", () => {
    const isolatedPreview = {
      WIRELINE_PREVIEW_DATABASE_ISOLATED: "true",
      WIRELINE_PREVIEW_DATABASE_PROJECT_REF: "ewgqxfnjxdzoawlkcyfb",
      WIRELINE_LAUNCH_DEMO_MODE: "true",
      POSTGRES_URL:
        "postgresql://postgres.ewgqxfnjxdzoawlkcyfb:preview-only@pooler.supabase.com:6543/postgres",
      INTERNAL_JWT_SECRET: "dedicated-preview-session-secret",
      OWNER_EMAIL: "qa@example.invalid",
    };

    const allowed = runPreviewBoundary(isolatedPreview);
    expect(allowed.status).toBe(0);
    expect(`${allowed.stdout}${allowed.stderr}`).toContain(
      "Deployment-boundary check passed for preview",
    );

    const allowedLimiterOverride = runPreviewBoundary({
      ...isolatedPreview,
      WIRELINE_ALLOW_INMEMORY_RATE_LIMIT: "true",
      VERCEL_OIDC_TOKEN: "automatic-preview-oidc",
    });
    expect(allowedLimiterOverride.status).toBe(0);

    const unisolatedLimiterOverride = runPreviewBoundary({
      WIRELINE_ALLOW_INMEMORY_RATE_LIMIT: "true",
    });
    expect(unisolatedLimiterOverride.status).toBe(1);
    expect(`${unisolatedLimiterOverride.stdout}${unisolatedLimiterOverride.stderr}`).toContain(
      "Preview override requires WIRELINE_PREVIEW_DATABASE_ISOLATED=true",
    );

    const providerBackedLimiterOverride = runPreviewBoundary({
      ...isolatedPreview,
      WIRELINE_ALLOW_INMEMORY_RATE_LIMIT: "true",
      PERPLEXITY_PREVIEW_API_KEY: "budgeted-but-live-preview-key",
    });
    expect(providerBackedLimiterOverride.status).toBe(1);
    expect(
      `${providerBackedLimiterOverride.stdout}${providerBackedLimiterOverride.stderr}`,
    ).toContain("provider-free Preview required");

    const missingSessionPoolerHost = runPreviewBoundary({
      ...isolatedPreview,
      WIRELINE_RUN_MIGRATIONS: "true",
    });
    expect(missingSessionPoolerHost.status).toBe(1);
    expect(`${missingSessionPoolerHost.stdout}${missingSessionPoolerHost.stderr}`).toContain(
      "transaction-pooler migration requires a reviewed Supabase session-pooler hostname",
    );

    const invalidSessionPoolerHost = runPreviewBoundary({
      ...isolatedPreview,
      WIRELINE_RUN_MIGRATIONS: "true",
      WIRELINE_PREVIEW_DATABASE_SESSION_POOLER_HOST: "database.example.com",
    });
    expect(invalidSessionPoolerHost.status).toBe(1);
    expect(`${invalidSessionPoolerHost.stdout}${invalidSessionPoolerHost.stderr}`).toContain(
      "reviewed Supabase session-pooler hostname",
    );

    const derivedMigrationLane = runPreviewBoundary({
      ...isolatedPreview,
      WIRELINE_RUN_MIGRATIONS: "true",
      WIRELINE_PREVIEW_DATABASE_SESSION_POOLER_HOST: "aws-0-us-east-2.pooler.supabase.com",
    });
    expect(derivedMigrationLane.status).toBe(0);

    const mismatchedMigrationLane = runPreviewBoundary({
      ...isolatedPreview,
      WIRELINE_RUN_MIGRATIONS: "true",
      WIRELINE_PREVIEW_DATABASE_SESSION_POOLER_HOST: "aws-0-us-east-2.pooler.supabase.com",
      POSTGRES_URL:
        "postgresql://postgres.abcdefghijklmnopqrst:preview-only@pooler.supabase.com:6543/postgres",
    });
    expect(mismatchedMigrationLane.status).toBe(1);
    expect(`${mismatchedMigrationLane.stdout}${mismatchedMigrationLane.stderr}`).toContain(
      "does not match the isolated Preview project ref",
    );

    const allowedMigrationLane = runPreviewBoundary({
      ...isolatedPreview,
      WIRELINE_RUN_MIGRATIONS: "true",
      POSTGRES_URL:
        "postgresql://postgres.ewgqxfnjxdzoawlkcyfb:preview-only@pooler.supabase.com:5432/postgres",
    });
    expect(allowedMigrationLane.status).toBe(0);

    for (const override of [
      { WIRELINE_LAUNCH_DEMO_MODE: "false" },
      { WIRELINE_PREVIEW_DATABASE_PROJECT_REF: "ogenlhodmwvyacvnrsnj" },
      {
        WIRELINE_PREVIEW_DATABASE_PROJECT_REF: "ogenlhodmwvyacvnrsnj",
        POSTGRES_URL:
          "postgresql://postgres.ogenlhodmwvyacvnrsnj:production@pooler.supabase.com:6543/postgres",
      },
      { INTERNAL_JWT_SECRET: "" },
      { STRIPE_SECRET_KEY: "sk_test_still-blocked" },
    ]) {
      const denied = runPreviewBoundary({ ...isolatedPreview, ...override });
      expect(denied.status).toBe(1);
    }

    expect(deploymentBoundary).toContain("reviewedIsolatedPreviewDatabaseKeys");
    expect(deploymentBoundary).toContain("WIRELINE_PREVIEW_DATABASE_PROJECT_REF");
  }, 30_000);

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
