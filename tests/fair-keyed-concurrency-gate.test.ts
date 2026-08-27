import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FairKeyedConcurrencyGate,
  FairKeyedConcurrencyGateAdmissionError,
} from "../src/lib/fair-keyed-concurrency-gate";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("FairKeyedConcurrencyGate", () => {
  it("never exceeds its cap and starts queued work in FIFO order", async () => {
    const gate = new FairKeyedConcurrencyGate(2, 8, 5_000);
    const holds = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    let observedActive = 0;

    const work = (id: number) =>
      gate.run({
        key: `tenant-${id}`,
        perform: async () => {
          started.push(id);
          observedActive = Math.max(observedActive, gate.activeCount);
          await holds[id - 1].promise;
          return id;
        },
      });

    const first = work(1);
    const second = work(2);
    const third = work(3);
    const fourth = work(4);
    await vi.waitFor(() => expect(started).toEqual([1, 2]));
    expect(gate.activeCount).toBe(2);
    expect(gate.queuedCount).toBe(2);

    holds[1].resolve();
    await vi.waitFor(() => expect(started).toEqual([1, 2, 3]));
    expect(gate.activeCount).toBe(2);

    holds[0].resolve();
    await vi.waitFor(() => expect(started).toEqual([1, 2, 3, 4]));
    expect(observedActive).toBe(2);

    holds[2].resolve();
    holds[3].resolve();
    await expect(Promise.all([first, second, third, fourth])).resolves.toEqual([1, 2, 3, 4]);
    expect(gate.activeCount).toBe(0);
    expect(gate.queuedCount).toBe(0);
  });

  it("bounds the queue and rejects active or queued duplicates by key", async () => {
    const gate = new FairKeyedConcurrencyGate(1, 2, 5_000);
    const active = await gate.acquire({ key: "tenant-active" });
    await expect(gate.acquire({ key: "tenant-active" })).rejects.toMatchObject({
      reason: "duplicate",
    });

    const secondPromise = gate.acquire({ key: "tenant-queued" });
    const thirdPromise = gate.acquire({ key: "tenant-third" });
    await expect(gate.acquire({ key: "tenant-queued" })).rejects.toMatchObject({
      reason: "duplicate",
    });
    await expect(gate.acquire({ key: "tenant-overflow" })).rejects.toMatchObject({
      reason: "queue_full",
    });
    expect(gate.queuedCount).toBe(2);

    active.release();
    const second = await secondPromise;
    second.release();
    const third = await thirdPromise;
    third.release();
    expect(gate.activeCount).toBe(0);
  });

  it("times out and aborts queued waiters without leaking their key or slot", async () => {
    vi.useFakeTimers();
    const gate = new FairKeyedConcurrencyGate(1, 8, 5_000);
    const active = await gate.acquire({ key: "tenant-active" });

    const timedOut = gate.acquire({ key: "tenant-timeout" });
    const timeoutAssertion = expect(timedOut).rejects.toEqual(
      expect.objectContaining({ reason: "timeout" }),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await timeoutAssertion;
    expect(gate.queuedCount).toBe(0);

    const abortController = new AbortController();
    const aborted = gate.acquire({ key: "tenant-aborted", signal: abortController.signal });
    const abortAssertion = expect(aborted).rejects.toEqual(
      expect.objectContaining({ reason: "aborted" }),
    );
    abortController.abort();
    await abortAssertion;
    expect(gate.queuedCount).toBe(0);

    active.release();
    const recovered = await gate.acquire({ key: "tenant-timeout" });
    recovered.release();
    expect(gate.activeCount).toBe(0);
  });

  it("releases exactly once after work throws", async () => {
    const gate = new FairKeyedConcurrencyGate(1, 8, 5_000);
    const failure = new Error("provider failed");

    await expect(
      gate.run({
        key: "tenant-throw",
        perform: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(gate.activeCount).toBe(0);

    const permit = await gate.acquire({ key: "tenant-next" });
    expect(gate.activeCount).toBe(1);
    permit.release();
    permit.release();
    expect(gate.activeCount).toBe(0);
  });

  it("uses one stable admission error type for caller mapping", async () => {
    const gate = new FairKeyedConcurrencyGate(1, 0, 5_000);
    const active = await gate.acquire({ key: "tenant-active" });
    await expect(gate.acquire({ key: "tenant-overflow" })).rejects.toBeInstanceOf(
      FairKeyedConcurrencyGateAdmissionError,
    );
    active.release();
  });
});
