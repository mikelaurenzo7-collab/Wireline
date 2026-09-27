import { basename } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runStripeAudit } from "../scripts/run-stripe-audit-live.mjs";

describe("injected-environment read-only Stripe audit runner", () => {
  it.each([undefined, "", "  "])(
    "fails closed before child execution without an injected key (%s)",
    (key) => {
      const run = vi.fn();
      expect(() =>
        runStripeAudit({ env: { STRIPE_SECRET_KEY: key, VERCEL_TOKEN: "unused-test-token" }, run }),
      ).toThrow("STRIPE_SECRET_KEY must be injected");
      expect(run).not.toHaveBeenCalled();
    },
  );

  it.each(["sk_test_fixture", "rk_test_fixture", "malformed", "live_fixture"])(
    "rejects a sandbox or malformed key before child execution (%s)",
    (key) => {
      const run = vi.fn();
      expect(() => runStripeAudit({ env: { STRIPE_SECRET_KEY: key }, run })).toThrow(
        "requires a live secret or restricted key",
      );
      expect(run).not.toHaveBeenCalled();
    },
  );

  it.each(["sk_live_fixture_only", "rk_live_fixture_only"])(
    "runs all three existing read-only audits with the same injected key (%s)",
    (key) => {
      const env = { STRIPE_SECRET_KEY: `  ${key}  `, APP_URL: "https://example.test" };
      const run = vi.fn().mockReturnValue({ status: 0 });
      expect(runStripeAudit({ env, run })).toBe(0);
      expect(run.mock.calls.map(([, [script]]) => basename(script))).toEqual([
        "audit-stripe-account-identity-live.mjs",
        "audit-stripe-product-copy-live.mjs",
        "audit-stripe-catalog-live.mjs",
      ]);
      for (const [command, args, options] of run.mock.calls) {
        expect(command).toBe(process.execPath);
        expect(args).toHaveLength(1);
        expect(args.join(" ")).not.toContain(key);
        expect(options.env).toEqual({ ...env, STRIPE_SECRET_KEY: key });
        expect(options.shell).toBeUndefined();
      }
      expect(env.STRIPE_SECRET_KEY).toBe(`  ${key}  `);
    },
  );

  it("keeps failures visible while collecting the remaining audit results", () => {
    const run = vi.fn().mockReturnValueOnce({ status: 1 }).mockReturnValue({ status: 0 });
    expect(runStripeAudit({ env: { STRIPE_SECRET_KEY: "sk_live_fixture_only" }, run })).toBe(1);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("does not expose child-process error details or a credential on startup failure", () => {
    const run = vi.fn().mockReturnValue({ error: new Error("sk_live_fixture_only") });
    expect(() =>
      runStripeAudit({ env: { STRIPE_SECRET_KEY: "sk_live_fixture_only" }, run }),
    ).toThrow("Unable to start read-only audit: audit-stripe-account-identity-live.mjs");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
