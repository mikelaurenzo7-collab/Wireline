import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { selfServeBillingEnabled } from "../src/lib/billing-release";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const original = process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED;

afterEach(() => {
  if (original === undefined) delete process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED;
  else process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = original;
});

describe("self-serve billing release gate", () => {
  it("defaults closed and only opens on an explicit true value", () => {
    delete process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED;
    expect(selfServeBillingEnabled()).toBe(false);

    process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = "false";
    expect(selfServeBillingEnabled()).toBe(false);

    process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = "true";
    expect(selfServeBillingEnabled()).toBe(true);
  });

  it("is enforced on the canonical checkout middleware before readiness", () => {
    const middleware = read("src/middleware/launch-hard-gate.ts");
    expect(middleware).toContain('req.path === "/api/billing/checkout"');
    expect(middleware).toContain("!selfServeBillingEnabled()");
    expect(middleware.indexOf("!selfServeBillingEnabled()"))
      .toBeLessThan(middleware.indexOf("isLaunchHardBlocked()"));
  });
});
