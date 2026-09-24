import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logEnvValidation: vi.fn(),
  generateSetupChecklist: vi.fn(),
  getInternalJwtSecret: vi.fn(),
  isFederalDncVendorConfigured: vi.fn(() => false),
  validation: {
    valid: false,
    errors: [{ var: "OPENAI_API_KEY / AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN / XAI_API_KEY" }],
    warnings: [],
    byGroup: {
      core: { valid: 3, invalid: 0, total: 3 },
      ai: { valid: 16, invalid: 1, total: 16 },
    },
  },
}));

vi.mock("../src/lib/server-context", () => ({ log: runtime.log, IS_PROD: true }));
vi.mock("../src/lib/internal-jwt-secret", () => ({
  getInternalJwtSecret: runtime.getInternalJwtSecret,
}));
vi.mock("../src/lib/env-validator", () => ({
  validateEnv: () => runtime.validation,
  logEnvValidation: runtime.logEnvValidation,
  generateSetupChecklist: runtime.generateSetupChecklist,
}));
vi.mock("../src/lib/federal-dnc-service", () => ({
  isFederalDncVendorConfigured: runtime.isFederalDncVendorConfigured,
}));

import { validateStartupEnv } from "../src/lib/startup";

const ENV_KEYS = [
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "APP_URL",
  "CORS_ORIGINS",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "WIRELINE_ALLOW_INMEMORY_RATE_LIMIT",
  "WIRELINE_PREVIEW_DATABASE_ISOLATED",
  "WIRELINE_LAUNCH_DEMO_MODE",
  "OPENAI_API_KEY_CHATKIT",
  "SENTRY_DSN",
  "WIRELINE_IMPORT_SMOKE_NO_DATABASE",
  "RENDER",
  "RENDER_SERVICE_ID",
  "RENDER_GIT_BRANCH",
  "RENDER_GIT_COMMIT",
  "IS_PULL_REQUEST",
  "WIRELINE_DEPLOYMENT_ENVIRONMENT",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnvironment() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("startup deployment severity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.isFederalDncVendorConfigured.mockReturnValue(false);
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
    for (const key of ENV_KEYS.slice(3)) delete process.env[key];
  });

  afterEach(restoreEnvironment);

  it("keeps provider-free Vercel Preview degradation out of runtime error logs", () => {
    process.env.VERCEL_ENV = "preview";

    validateStartupEnv();

    expect(runtime.logEnvValidation).toHaveBeenCalledWith(false);
    expect(runtime.log.error).not.toHaveBeenCalled();
    expect(runtime.generateSetupChecklist).not.toHaveBeenCalled();
    expect(runtime.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("UPSTASH Redis is not configured for Preview"),
    );
    expect(runtime.log.info).toHaveBeenCalledWith(
      "Non-production runtime started with unavailable feature configuration",
      expect.objectContaining({ count: 1 }),
    );
    expect(runtime.log.warn).not.toHaveBeenCalledWith(
      "Recommended env vars not set",
      expect.anything(),
    );
  });

  it("acknowledges the explicit isolated-Preview limiter override without an error", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT = "true";
    process.env.WIRELINE_PREVIEW_DATABASE_ISOLATED = "true";
    process.env.WIRELINE_LAUNCH_DEMO_MODE = "true";

    validateStartupEnv();

    expect(runtime.log.error).not.toHaveBeenCalled();
    expect(runtime.log.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("UPSTASH Redis is not configured for Preview"),
    );
    expect(runtime.log.info).toHaveBeenCalledWith(
      expect.stringContaining("Preview explicitly uses per-invocation rate limiting"),
    );
  });

  it("warns when provider authority invalidates the Preview limiter override", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT = "true";
    process.env.WIRELINE_PREVIEW_DATABASE_ISOLATED = "true";
    process.env.WIRELINE_LAUNCH_DEMO_MODE = "true";
    process.env.OPENAI_API_KEY_CHATKIT = "scoped-live-provider-key";
    validateStartupEnv();
    expect(runtime.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("Preview in-memory rate limiting was requested but refused"),
    );
  });

  it("retains hard startup errors and launch warnings for canonical Production", () => {
    process.env.VERCEL_ENV = "production";

    validateStartupEnv();

    expect(runtime.logEnvValidation).toHaveBeenCalledWith(true);
    expect(runtime.log.error).toHaveBeenCalledWith(
      expect.stringContaining("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set"),
    );
    expect(runtime.log.error).toHaveBeenCalledWith(
      "Missing required env vars in production. Affected features will return errors at request time.",
      expect.objectContaining({
        missing: ["OPENAI_API_KEY / AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN / XAI_API_KEY"],
      }),
    );
    expect(runtime.generateSetupChecklist).toHaveBeenCalledOnce();
    expect(runtime.log.warn).toHaveBeenCalledWith("Recommended env vars not set", {
      recommended: ["CORS_ORIGINS"],
    });
  });

  it.each([
    ["false", "production", true],
    ["true", "production", false],
    ["false", "preview", false],
    ["", "production", false],
  ])(
    "classifies Render startup with pull request=%s and environment=%s independently of NODE_ENV",
    (pullRequest, environment, production) => {
      delete process.env.VERCEL;
      delete process.env.VERCEL_ENV;
      process.env.RENDER = "true";
      process.env.IS_PULL_REQUEST = String(pullRequest);
      process.env.WIRELINE_DEPLOYMENT_ENVIRONMENT = String(environment);

      validateStartupEnv();

      expect(runtime.logEnvValidation).toHaveBeenCalledWith(production);
      if (production) {
        expect(runtime.generateSetupChecklist).toHaveBeenCalledOnce();
      } else {
        expect(runtime.log.error).not.toHaveBeenCalled();
        expect(runtime.generateSetupChecklist).not.toHaveBeenCalled();
      }
    },
  );
});
