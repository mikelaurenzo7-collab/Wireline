import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SELF_SERVE_BILLING_BLOCK,
  selfServeBillingBlockResponse,
  selfServeBillingEnabled,
} from "../src/lib/billing-release";
import { enforceLaunchHardGate } from "../src/middleware/launch-hard-gate";

const originalBillingRelease = process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED;
const originalLaunchGate = process.env.LAUNCH_HARD_GATE;

afterEach(() => {
  if (originalBillingRelease === undefined) {
    delete process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED;
  } else {
    process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = originalBillingRelease;
  }
  if (originalLaunchGate === undefined) delete process.env.LAUNCH_HARD_GATE;
  else process.env.LAUNCH_HARD_GATE = originalLaunchGate;
});

describe("self-serve billing release gate", () => {
  it("defaults closed and only opens on an explicit affirmative value", () => {
    delete process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED;
    expect(selfServeBillingEnabled()).toBe(false);

    process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = "false";
    expect(selfServeBillingEnabled()).toBe(false);

    for (const value of ["true", "1", "yes", "on", " TRUE "]) {
      process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = value;
      expect(selfServeBillingEnabled()).toBe(true);
    }
  });

  it("keeps a stable customer-safe block contract", () => {
    expect(SELF_SERVE_BILLING_BLOCK.status).toBe(503);
    expect(selfServeBillingBlockResponse()).toEqual({
      code: "BILLING_LAUNCH_NOT_APPROVED",
      error: SELF_SERVE_BILLING_BLOCK.error,
    });
  });

  it("blocks checkout independently of the optional global launch gate", () => {
    delete process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED;
    delete process.env.LAUNCH_HARD_GATE;

    const next = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    enforceLaunchHardGate(
      { path: "/api/billing/checkout" } as never,
      { status } as never,
      next,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(selfServeBillingBlockResponse());
    expect(next).not.toHaveBeenCalled();
  });
});
