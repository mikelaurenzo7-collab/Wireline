import { describe, expect, it } from "vitest";
import { createExpiringAsyncCache } from "./expiring-async-cache";

describe("createExpiringAsyncCache", () => {
  it("reuses a value until the configured duration elapses", async () => {
    let currentTime = 1000;
    let invocations = 0;
    const cache = createExpiringAsyncCache(async () => ++invocations, 60_000, () => currentTime);

    await expect(cache.get()).resolves.toBe(1);
    currentTime += 59_999;
    await expect(cache.get()).resolves.toBe(1);
    expect(invocations).toBe(1);

    currentTime += 1;
    await expect(cache.get()).resolves.toBe(2);
  });

  it("coalesces simultaneous misses", async () => {
    let complete: ((value: string) => void) | undefined;
    let invocations = 0;
    const cache = createExpiringAsyncCache(
      () => {
        invocations += 1;
        return new Promise<string>((resolve) => {
          complete = resolve;
        });
      },
      60_000,
    );

    const first = cache.get();
    const second = cache.get();
    expect(invocations).toBe(1);
    complete?.("ok");
    await expect(first).resolves.toBe("ok");
    await expect(second).resolves.toBe("ok");
  });
});
