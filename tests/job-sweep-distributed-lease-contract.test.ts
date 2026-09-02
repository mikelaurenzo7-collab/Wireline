import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routes = readFileSync(resolve(process.cwd(), "src/routes/job-routes.ts"), "utf8");

describe("job sweep distributed lease contract", () => {
  it("acquires one global sweep lease and fails closed when coordination is unavailable", () => {
    const wrapper = routes.slice(routes.indexOf("const sweepHandler = async"));
    const acquire = wrapper.indexOf('acquireDistributedLease("jobs:sweep", 70_000)');
    const run = wrapper.indexOf("await runSweepHandler(req, res)");

    expect(acquire).toBeGreaterThan(-1);
    expect(run).toBeGreaterThan(acquire);
    expect(wrapper).toContain('decision.status === "held"');
    expect(wrapper).toContain('decision.status === "unavailable"');
    expect(wrapper).toContain("distributed job-sweep lease is unavailable");
  });

  it("serializes renewal and stops new work when ownership is uncertain", () => {
    expect(routes).toContain("const leaseFence = new AbortController()");
    expect(routes).toContain("req._sweepLeaseSignal = leaseFence.signal");
    expect(routes).toContain("heartbeat = setTimeout(async () =>");
    expect(routes).not.toContain("const heartbeat = setInterval(");
    expect(routes).toContain("if (!leaseFence.signal.aborted) scheduleRenewal()");
    expect(routes).toContain("leaseFence.abort()");
    expect(routes).toContain("!req._sweepLeaseSignal?.aborted");

    const cleanup = routes.slice(
      routes.indexOf("  } finally {", routes.indexOf("const sweepHandler")),
    );
    expect(cleanup.indexOf("leaseFence.abort()")).toBeGreaterThan(-1);
    expect(cleanup.indexOf("leaseFence.abort()")).toBeLessThan(
      cleanup.indexOf("await decision.lease.release()"),
    );
  });
});
