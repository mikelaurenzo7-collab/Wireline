import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Releasing a carrier number is destructive (the tenant cannot get the same
 * number back), so every safety rule in number-reclamation.ts gets a
 * behavioral pin: canceled-only, the grace window, the fresh per-release
 * re-verify, and fail-safe handling of carrier errors.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-14T04:30:00Z");

function chain(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "orderBy"]) {
    builder[method] = () => builder;
  }
  builder.limit = async () => rows;
  return builder;
}

beforeEach(() => {
  vi.resetModules();
});

async function loadModule() {
  vi.doMock("../src/lib/server-context", () => ({
    drizzle: { select: vi.fn() },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  vi.doMock("../src/lib/phone-provisioning", () => ({
    releaseTenantNumber: vi.fn(),
  }));
  const { drizzle } = await import("../src/lib/server-context");
  const { releaseTenantNumber } = await import("../src/lib/phone-provisioning");
  const { runNumberReclamation, NUMBER_RECLAMATION_GRACE_DAYS } =
    await import("../src/lib/number-reclamation");
  return { drizzle, releaseTenantNumber, runNumberReclamation, NUMBER_RECLAMATION_GRACE_DAYS };
}

const candidateRow = { userId: "user-1", phoneNumber: "+15550001234" };

function verifyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: "canceled",
    currentPeriodEnd: new Date(NOW.getTime() - 31 * DAY_MS),
    updatedAt: new Date(NOW.getTime() - 40 * DAY_MS),
    appStatus: "canceled",
    ...overrides,
  };
}

describe("number reclamation", () => {
  it("releases a number whose subscription is canceled past the grace window", async () => {
    const { drizzle, releaseTenantNumber, runNumberReclamation } = await loadModule();
    vi.mocked(drizzle.select)
      .mockImplementationOnce(() => chain([candidateRow]) as never)
      .mockImplementationOnce(() => chain([verifyRow()]) as never);
    vi.mocked(releaseTenantNumber).mockResolvedValue({ ok: true });

    const summary = await runNumberReclamation(NOW);
    expect(releaseTenantNumber).toHaveBeenCalledWith("user-1", "+15550001234");
    expect(summary).toMatchObject({ examined: 1, released: 1, failed: 0, skipped: 0 });
  });

  it("skips when the fresh re-verify shows the tenant resubscribed", async () => {
    const { drizzle, releaseTenantNumber, runNumberReclamation } = await loadModule();
    vi.mocked(drizzle.select)
      .mockImplementationOnce(() => chain([candidateRow]) as never)
      .mockImplementationOnce(() => chain([verifyRow({ status: "active" })]) as never);

    const summary = await runNumberReclamation(NOW);
    expect(releaseTenantNumber).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ examined: 1, released: 0, skipped: 1 });
  });

  it("skips when the app-side status still says active, even with Stripe canceled", async () => {
    const { drizzle, releaseTenantNumber, runNumberReclamation } = await loadModule();
    vi.mocked(drizzle.select)
      .mockImplementationOnce(() => chain([candidateRow]) as never)
      .mockImplementationOnce(() => chain([verifyRow({ appStatus: "active" })]) as never);

    const summary = await runNumberReclamation(NOW);
    expect(releaseTenantNumber).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ skipped: 1 });
  });

  it("respects the grace window on the re-verify anchor", async () => {
    const { drizzle, releaseTenantNumber, runNumberReclamation, NUMBER_RECLAMATION_GRACE_DAYS } =
      await loadModule();
    const insideGrace = new Date(NOW.getTime() - (NUMBER_RECLAMATION_GRACE_DAYS - 1) * DAY_MS);
    vi.mocked(drizzle.select)
      .mockImplementationOnce(() => chain([candidateRow]) as never)
      .mockImplementationOnce(() => chain([verifyRow({ currentPeriodEnd: insideGrace })]) as never);

    const summary = await runNumberReclamation(NOW);
    expect(releaseTenantNumber).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ skipped: 1 });
  });

  it("counts a carrier failure without throwing so the next run retries", async () => {
    const { drizzle, releaseTenantNumber, runNumberReclamation } = await loadModule();
    vi.mocked(drizzle.select)
      .mockImplementationOnce(() => chain([candidateRow]) as never)
      .mockImplementationOnce(() => chain([verifyRow()]) as never);
    vi.mocked(releaseTenantNumber).mockResolvedValue({ ok: false, error: "carrier 500" });

    const summary = await runNumberReclamation(NOW);
    expect(summary).toMatchObject({ examined: 1, released: 0, failed: 1 });
  });

  it("wires the daily sweep and the job handler to this module", () => {
    // Source pins: the sweep enqueues the job once per day and the worker
    // routes it here — without both, the leak silently returns.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const sweep = readFileSync("src/routes/job-routes.ts", "utf8");
    expect(sweep).toContain('type: "reclaim_canceled_numbers"');
    const worker = readFileSync("src/lib/job-worker-base.ts", "utf8");
    expect(worker).toContain('job.type === "reclaim_canceled_numbers"');
    expect(worker).toContain("runNumberReclamation");
  });
});
