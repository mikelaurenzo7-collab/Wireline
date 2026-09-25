import { describe, expect, it, vi } from "vitest";
import { resolveStripeOperatorKey } from "../scripts/lib/stripe-operator-key.mjs";
import { assertStripePortalOperatorEnvironment } from "../scripts/lib/stripe-operator-policy.mts";
import { PROJECT_ID } from "../scripts/lib/vercel-project.mjs";

const source = "a".repeat(40);
const operator = {
  NODE_ENV: "production",
  APP_URL: "https://botbound.app",
  STRIPE_SECRET_KEY: "sk_live_operator_fixture",
};
const render = {
  ...operator,
  RENDER: "true",
  IS_PULL_REQUEST: "false",
  WIRELINE_DEPLOYMENT_ENVIRONMENT: "production",
  RENDER_GIT_BRANCH: "main",
  RENDER_GIT_COMMIT: source,
};
const renderRelease = { role: "api", revision: source };

describe("production Stripe operator verification", () => {
  it("uses the supplied key without reading Vercel, even with a stale token present", async () => {
    const readVercel = vi.fn();
    await expect(
      resolveStripeOperatorKey({ ...operator, VERCEL_TOKEN: "unused" }, readVercel),
    ).resolves.toBe(operator.STRIPE_SECRET_KEY);
    expect(readVercel).not.toHaveBeenCalled();
  });

  it("preserves explicitly configured legacy Vercel key lookup", async () => {
    const readVercel = vi.fn().mockResolvedValue("rk_live_operator_fixture");
    await expect(resolveStripeOperatorKey({ VERCEL_TOKEN: "legacy" }, readVercel)).resolves.toBe(
      "rk_live_operator_fixture",
    );
    expect(readVercel).toHaveBeenCalledExactlyOnceWith("legacy", "STRIPE_SECRET_KEY");
  });

  it("fails without credentials and does not silently replace an invalid supplied key", async () => {
    const readVercel = vi.fn();
    await expect(resolveStripeOperatorKey({}, readVercel)).rejects.toThrow(
      "Provide STRIPE_SECRET_KEY",
    );
    await expect(
      resolveStripeOperatorKey(
        { STRIPE_SECRET_KEY: "sk_test_fixture", VERCEL_TOKEN: "legacy" },
        readVercel,
      ),
    ).rejects.toThrow("live Stripe key");
    expect(readVercel).not.toHaveBeenCalled();
  });

  it("allows a secure local read-only audit without platform metadata", () => {
    expect(assertStripePortalOperatorEnvironment(operator, { apply: false })).toEqual({
      appUrl: operator.APP_URL,
      secretKey: operator.STRIPE_SECRET_KEY,
    });
    expect(() => assertStripePortalOperatorEnvironment(operator, { apply: true })).toThrow(
      "local verification is read-only",
    );
  });

  it.each([false, true])("admits verified Render production for apply=%s", (apply) => {
    expect(assertStripePortalOperatorEnvironment(render, { apply, renderRelease })).toEqual({
      appUrl: operator.APP_URL,
      secretKey: operator.STRIPE_SECRET_KEY,
    });
  });

  it.each([
    { IS_PULL_REQUEST: "true" },
    { IS_PULL_REQUEST: "" },
    { RENDER: "false" },
    { WIRELINE_DEPLOYMENT_ENVIRONMENT: "preview" },
    { VERCEL_ENV: "production" },
    { RENDER_GIT_BRANCH: "feature/unsafe" },
    { RENDER_GIT_COMMIT: "abcdef0" },
    { WIRELINE_SOURCE_REVISION: "b".repeat(40) },
    { APP_URL: "https://botbound.app.attacker.example" },
    { STRIPE_SECRET_KEY: "sk_test_fixture" },
  ])("rejects an ambiguous or mismatched Render target: %j", (overrides) => {
    for (const apply of [false, true]) {
      expect(() =>
        assertStripePortalOperatorEnvironment(
          { ...render, ...overrides },
          { apply, renderRelease },
        ),
      ).toThrow();
    }
  });

  it.each([
    undefined,
    {},
    { role: "voice", revision: source },
    { role: "api", revision: "b".repeat(40) },
  ])("rejects a missing or mismatched Render artifact: %j", (artifact) => {
    expect(() =>
      assertStripePortalOperatorEnvironment(render, { apply: true, renderRelease: artifact }),
    ).toThrow("verified Render production main release");
  });

  it("preserves the canonical Vercel rollback boundary", () => {
    const legacy = { ...operator, VERCEL_ENV: "production", VERCEL_PROJECT_ID: PROJECT_ID };
    expect(assertStripePortalOperatorEnvironment(legacy, { apply: true }).appUrl).toBe(
      operator.APP_URL,
    );
    expect(() =>
      assertStripePortalOperatorEnvironment(
        { ...legacy, VERCEL_PROJECT_ID: "another-project" },
        { apply: true },
      ),
    ).toThrow("canonical BotBound project");
    expect(() =>
      assertStripePortalOperatorEnvironment({ ...legacy, VERCEL_ENV: "preview" }, { apply: false }),
    ).toThrow("unambiguous production");
  });

  it("rejects local production verification with a noncanonical origin or sandbox key", () => {
    for (const overrides of [
      { NODE_ENV: "development" },
      { APP_URL: "https://botbound-api.onrender.com" },
      { STRIPE_SECRET_KEY: "sk_test_fixture" },
    ]) {
      expect(() =>
        assertStripePortalOperatorEnvironment({ ...operator, ...overrides }, { apply: false }),
      ).toThrow();
    }
  });
});
