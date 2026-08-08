import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SELF_SERVE_BILLING_BLOCK,
  selfServeBillingBlockResponse,
  selfServeBillingEnabled,
  selfServeBillingReleaseBlockers,
} from "../src/lib/billing-release";
import { evaluateLaunchReadiness } from "../src/lib/launch-readiness";
import { enforceSelfServeBillingRelease } from "../src/middleware/launch-hard-gate";

const originalBillingRelease = process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED;
const originalDemoMode = process.env.WIRELINE_LAUNCH_DEMO_MODE;
const originalLaunchGate = process.env.LAUNCH_HARD_GATE;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv("WIRELINE_SELF_SERVE_BILLING_ENABLED", originalBillingRelease);
  restoreEnv("WIRELINE_LAUNCH_DEMO_MODE", originalDemoMode);
  restoreEnv("LAUNCH_HARD_GATE", originalLaunchGate);
});

describe("self-serve billing release gate", () => {
  it("defaults closed and requires both an explicit release and live telemetry mode", () => {
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

  it("keeps a stable customer-safe block contract", () => {
    expect(SELF_SERVE_BILLING_BLOCK.status).toBe(503);
    expect(selfServeBillingBlockResponse()).toEqual({
      code: "BILLING_LAUNCH_NOT_APPROVED",
      error: SELF_SERVE_BILLING_BLOCK.error,
    });
  });

  it("surfaces the release state and exact blockers in launch readiness", () => {
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

  it("allows a paid route only after both release controls align", () => {
    process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = "true";
    process.env.WIRELINE_LAUNCH_DEMO_MODE = "false";

    const next = vi.fn();
    const status = vi.fn();
    enforceSelfServeBillingRelease({} as never, { status } as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("mounts the release middleware explicitly before every Stripe session route", () => {
    const source = readFileSync(resolve(process.cwd(), "src/server/register-api-routes.ts"), "utf8");
    const routeContracts = [
      [
        'app.post("/api/conversation-balance/checkout", enforceSelfServeBillingRelease);',
        "app.use(conversationBalanceRouter);",
      ],
      [
        'app.post("/api/billing/checkout", enforceSelfServeBillingRelease);',
        "app.use(launchBillingCheckoutAtomicRouter);",
      ],
      [
        'app.post("/api/billing/live-video-checkout", enforceSelfServeBillingRelease);',
        'app.use("/api", billingRouter);',
      ],
    ] as const;

    for (const [guard, router] of routeContracts) {
      expect(source).toContain(guard);
      expect(source.indexOf(guard)).toBeLessThan(source.indexOf(router));
    }
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
