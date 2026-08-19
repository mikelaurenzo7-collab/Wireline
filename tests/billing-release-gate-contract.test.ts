import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SELF_SERVE_BILLING_BLOCK,
  SELF_SERVE_BILLING_RELEASE_SHA_ENV,
  selfServeBillingBlockResponse,
  selfServeBillingEnabled,
  selfServeBillingReleaseBlockers,
} from "../src/lib/billing-release";
import { evaluateLaunchReadiness } from "../src/lib/launch-readiness";
import { enforceSelfServeBillingRelease } from "../src/middleware/launch-hard-gate";

const originalBillingRelease = process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED;
const originalBillingReleaseSha = process.env[SELF_SERVE_BILLING_RELEASE_SHA_ENV];
const originalDeploymentSha = process.env.VERCEL_GIT_COMMIT_SHA;
const originalDemoMode = process.env.WIRELINE_LAUNCH_DEMO_MODE;
const originalLaunchGate = process.env.LAUNCH_HARD_GATE;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv("WIRELINE_SELF_SERVE_BILLING_ENABLED", originalBillingRelease);
  restoreEnv(SELF_SERVE_BILLING_RELEASE_SHA_ENV, originalBillingReleaseSha);
  restoreEnv("VERCEL_GIT_COMMIT_SHA", originalDeploymentSha);
  restoreEnv("WIRELINE_LAUNCH_DEMO_MODE", originalDemoMode);
  restoreEnv("LAUNCH_HARD_GATE", originalLaunchGate);
});

describe("self-serve billing release gate", () => {
  it("defaults closed and requires explicit release intent plus live telemetry", () => {
    delete process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED;
    delete process.env.WIRELINE_LAUNCH_DEMO_MODE;
    expect(selfServeBillingEnabled()).toBe(false);
    expect(selfServeBillingReleaseBlockers()).toEqual([
      "WIRELINE_SELF_SERVE_BILLING_ENABLED=true",
      "WIRELINE_LAUNCH_DEMO_MODE=false",
    ]);

    process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = "true";
    process.env.WIRELINE_LAUNCH_DEMO_MODE = "true";
    expect(selfServeBillingEnabled()).toBe(false);
    expect(selfServeBillingReleaseBlockers()).toEqual(["WIRELINE_LAUNCH_DEMO_MODE=false"]);

    process.env.WIRELINE_LAUNCH_DEMO_MODE = "false";
    for (const value of ["true", "1", "yes", "on", " TRUE "]) {
      process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = value;
      expect(selfServeBillingEnabled()).toBe(true);
      expect(selfServeBillingReleaseBlockers()).toEqual([]);
    }
  });

  it("stays released across certified redeploy SHAs without a manual per-commit env rotation", () => {
    process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = "true";
    process.env.WIRELINE_LAUNCH_DEMO_MODE = "false";
    process.env[SELF_SERVE_BILLING_RELEASE_SHA_ENV] = "a".repeat(40);

    process.env.VERCEL_GIT_COMMIT_SHA = "b".repeat(40);
    expect(selfServeBillingEnabled()).toBe(true);
    expect(selfServeBillingReleaseBlockers()).toEqual([]);

    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env[SELF_SERVE_BILLING_RELEASE_SHA_ENV];
    expect(selfServeBillingEnabled()).toBe(true);
    expect(selfServeBillingReleaseBlockers()).toEqual([]);
  });

  it("keeps a stable customer-safe block contract", () => {
    expect(SELF_SERVE_BILLING_BLOCK.status).toBe(503);
    expect(selfServeBillingBlockResponse()).toEqual({
      code: "BILLING_LAUNCH_NOT_APPROVED",
      error: SELF_SERVE_BILLING_BLOCK.error,
    });
  });

  it("surfaces only durable operator controls in launch readiness", () => {
    delete process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED;
    process.env.WIRELINE_LAUNCH_DEMO_MODE = "true";

    const blocked = evaluateLaunchReadiness();
    const blockedBilling = blocked.capabilities.find((capability) => capability.id === "billing_ready");
    expect(blocked.self_serve_billing_enabled).toBe(false);
    expect(blockedBilling?.blockers).toEqual(
      expect.arrayContaining([
        "WIRELINE_SELF_SERVE_BILLING_ENABLED=true",
        "WIRELINE_LAUNCH_DEMO_MODE=false",
      ]),
    );

    process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = "true";
    process.env.WIRELINE_LAUNCH_DEMO_MODE = "false";
    const released = evaluateLaunchReadiness();
    const releasedBilling = released.capabilities.find(
      (capability) => capability.id === "billing_ready",
    );
    expect(released.self_serve_billing_enabled).toBe(true);
    expect(releasedBilling?.blockers).not.toContain("WIRELINE_SELF_SERVE_BILLING_ENABLED=true");
    expect(releasedBilling?.blockers).not.toContain("WIRELINE_LAUNCH_DEMO_MODE=false");
  });

  it("blocks a paid route independently of URL shape and the optional global launch gate", () => {
    delete process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED;
    process.env.WIRELINE_LAUNCH_DEMO_MODE = "true";
    delete process.env.LAUNCH_HARD_GATE;

    const next = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    enforceSelfServeBillingRelease({} as never, { status } as never, next);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(selfServeBillingBlockResponse());
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a paid route after the durable launch controls align", () => {
    process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = "true";
    process.env.WIRELINE_LAUNCH_DEMO_MODE = "false";

    const next = vi.fn();
    const status = vi.fn();
    enforceSelfServeBillingRelease({} as never, { status } as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("keeps canonical production certification mandatory without a second SHA runtime lock", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/check-deployment-boundaries.mjs"), "utf8");
    expect(source).toContain("WIRELINE_SELF_SERVE_BILLING_ENABLED");
    expect(source).toContain("WIRELINE_LAUNCH_DEMO_MODE=false");
    expect(source).toContain("mandatory full release");
    expect(source).not.toContain("will remain runtime-closed until WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA");
  });

  it("mounts the release middleware before every active Stripe session route and terminally fences retired checkout", () => {
    const source = readFileSync(resolve(process.cwd(), "src/server/register-api-routes.ts"), "utf8");
    const activeRouteContracts = [
      [
        'app.post("/api/conversation-balance/checkout", enforceSelfServeBillingRelease);',
        "app.use(conversationBalanceRouter);",
      ],
      [
        'app.post("/api/billing/checkout", enforceSelfServeBillingRelease);',
        "app.use(launchBillingCheckoutAtomicRouter);",
      ],
    ] as const;

    for (const [guard, router] of activeRouteContracts) {
      expect(source).toContain(guard);
      expect(source.indexOf(guard)).toBeLessThan(source.indexOf(router));
    }

    const retiredFence = 'app.all("/api/billing/live-video-checkout"';
    const legacyBillingMount = 'app.use("/api", billingRouter);';
    expect(source).toContain(retiredFence);
    expect(source.indexOf(retiredFence)).toBeLessThan(source.indexOf(legacyBillingMount));

    const retiredBlock = source.slice(
      source.indexOf(retiredFence),
      source.indexOf(legacyBillingMount),
    );
    expect(retiredBlock).toContain("res.status(410)");
    expect(retiredBlock).toContain('error: "FEATURE_RETIRED"');
    expect(retiredBlock).not.toContain("enforceSelfServeBillingRelease");
  });

  it("gates only extra-agent increases so decreases and reconciliation remain available", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/routes/extra-agent-billing-atomic-routes.ts"),
      "utf8",
    );
    expect(source).toContain("if (isIncrease && !selfServeBillingEnabled())");
    expect(source).toContain("status: SELF_SERVE_BILLING_BLOCK.status");
    expect(source).toContain("body: selfServeBillingBlockResponse()");
  });
});
