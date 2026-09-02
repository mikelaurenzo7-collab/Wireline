import { afterEach, describe, expect, it, vi } from "vitest";

import { acquireDistributedLease, resetDistributedLeasesForTests } from "./distributed-lease";

describe("distributed lease", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetDistributedLeasesForTests();
  });

  it("admits one owner, renews it, and compare-releases it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
    const first = await acquireDistributedLease("jobs:sweep", 10_000);
    expect(first.status).toBe("acquired");
    expect((await acquireDistributedLease("jobs:sweep", 10_000)).status).toBe("held");
    if (first.status !== "acquired") throw new Error("lease not acquired");
    expect(await first.lease.renew()).toBe(true);
    await first.lease.release();
    expect((await acquireDistributedLease("jobs:sweep", 10_000)).status).toBe("acquired");
  });

  it("fails closed without Redis in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await acquireDistributedLease("jobs:sweep", 10_000)).status).toBe("unavailable");
    vi.unstubAllEnvs();
  });

  it("does not let an expired owner release its replacement", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
    const first = await acquireDistributedLease("jobs:sweep", 10_000);
    expect(first.status).toBe("acquired");
    vi.advanceTimersByTime(10_001);
    const replacement = await acquireDistributedLease("jobs:sweep", 10_000);
    expect(replacement.status).toBe("acquired");
    if (first.status !== "acquired") throw new Error("first lease not acquired");
    await first.lease.release();
    expect((await acquireDistributedLease("jobs:sweep", 10_000)).status).toBe("held");
  });
});
