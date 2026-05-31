import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// server-context pulls in a pg Pool on import; stub it so the pure validator
// logic can be exercised in isolation.
vi.mock("./server-context", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { ENV_REGISTRY, validateEnv } from "./env-validator";

describe("ENV_REGISTRY deployment-hardening coverage", () => {
  // Every env var the deployment hardening checklist calls out must be tracked
  // by the validator so a missing/misconfigured value shows up in the setup
  // checklist instead of silently degrading owner-routing / escalation.
  it.each([
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "WIRELINE_DATA_KEY",
    "INTERNAL_JWT_SECRET",
    "OWNER_EMAIL",
    "CORS_ORIGINS",
    "APP_URL",
  ])("tracks %s", (name) => {
    expect(ENV_REGISTRY.some((e) => e.name === name)).toBe(true);
  });
});

describe("OWNER_EMAIL validation", () => {
  const ORIG = process.env.OWNER_EMAIL;
  const ORIG_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    // Force prod-style validation so format checks on optional vars surface.
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    if (ORIG === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = ORIG;
    process.env.NODE_ENV = ORIG_NODE_ENV;
  });

  it("accepts a well-formed email", () => {
    process.env.OWNER_EMAIL = "founder@trywireline.com";
    const errors = validateEnv().errors.filter((e) => e.var === "OWNER_EMAIL");
    expect(errors).toHaveLength(0);
  });

  it("flags a malformed email in production", () => {
    process.env.OWNER_EMAIL = "not-an-email";
    const errors = validateEnv().errors.filter((e) => e.var === "OWNER_EMAIL");
    expect(errors).toHaveLength(1);
  });
});
