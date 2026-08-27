import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/routes/extra-agent-billing-atomic-routes.ts"),
  "utf8",
);

describe("extra-agent billing pool containment", () => {
  it("keeps two active mutations, eight FIFO waiters, and a five-second ceiling", () => {
    expect(source).toContain("const EXTRA_AGENT_BILLING_CONCURRENCY = 2");
    expect(source).toContain("const EXTRA_AGENT_BILLING_MAX_QUEUE = 8");
    expect(source).toContain("const EXTRA_AGENT_BILLING_WAIT_MS = 5_000");
    expect(source).toContain("new FairKeyedConcurrencyGate(");
  });

  it("acquires by tenant before the long transaction and always releases", () => {
    const route = source.slice(source.indexOf('router.post("/"'));
    const acquire = route.indexOf("await extraAgentBillingGate.acquire");
    const transaction = route.indexOf("await drizzle.transaction", acquire);
    const provider = route.indexOf("stripe.subscriptions.retrieve", transaction);
    const finalRelease = route.lastIndexOf("billingPermit.release()");
    const finallyBlock = route.lastIndexOf("finally");

    expect(route).toContain("key: req.user.id");
    expect(acquire).toBeGreaterThan(-1);
    expect(transaction).toBeGreaterThan(acquire);
    expect(provider).toBeGreaterThan(transaction);
    expect(finallyBlock).toBeGreaterThan(provider);
    expect(finalRelease).toBeGreaterThan(finallyBlock);
  });

  it("fails busy admission closed before DB/provider work with stable retry semantics", () => {
    const response = source.slice(
      source.indexOf("function billingBusyResponse"),
      source.indexOf("function isPostgresLockTimeout"),
    );
    const route = source.slice(source.indexOf('router.post("/"'));
    const admissionCatch = route.indexOf("error instanceof FairKeyedConcurrencyGateAdmissionError");

    expect(response).toContain(
      '.set("Retry-After", String(EXTRA_AGENT_BILLING_RETRY_AFTER_SECONDS))',
    );
    expect(response).toContain(".status(429)");
    expect(response).toContain('code: "BILLING_BUSY"');
    expect(admissionCatch).toBeGreaterThan(-1);
    expect(admissionCatch).toBeLessThan(route.indexOf("await drizzle.transaction"));
    expect(route).toContain('if (error.reason === "aborted") return;');
    expect(route).toContain('req.once("aborted", abortQueuedRequest)');
    expect(route).toContain('res.once("close", abortQueuedRequest)');
  });

  it("bounds database lock waits and maps only PostgreSQL lock timeout to busy", () => {
    const detector = source.slice(
      source.indexOf("function isPostgresLockTimeout"),
      source.indexOf("async function validateFounderCatalogPriceId"),
    );
    const route = source.slice(source.indexOf('router.post("/"'));

    expect(route).toContain("SET LOCAL lock_timeout = '5s'");
    expect(detector).toContain('current.code === "55P03"');
    expect(detector).toContain("/lock timeout/i.test(current.message)");
    expect(route).toContain("if (isPostgresLockTimeout(error)) return billingBusyResponse(res)");
    expect(route).not.toContain("if (error instanceof Error) return billingBusyResponse(res)");
  });
});
