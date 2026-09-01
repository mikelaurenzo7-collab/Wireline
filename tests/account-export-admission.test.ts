import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AccountExportBusyError,
  AccountExportSnapshotDeadlineError,
  AccountExportSnapshotGate,
} from "../src/lib/account-export-admission";
import {
  type AccountExportWritable,
  writeAccountExportChunk,
} from "../src/lib/account-export-stream";

class NonReadingExportResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;

  write(): boolean {
    return false;
  }

  asWritable(): AccountExportWritable {
    return this as unknown as AccountExportWritable;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("account export snapshot admission", () => {
  it("allows only one of five slow clients to own a five-slot pool snapshot", async () => {
    const gate = new AccountExportSnapshotGate(1, 60_000);
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) => gate.acquire(`user-${index}`)),
    );

    const admitted = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof gate.acquire>>> =>
        attempt.status === "fulfilled",
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected",
    );

    expect(admitted).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    expect(rejected.every((attempt) => attempt.reason instanceof AccountExportBusyError)).toBe(
      true,
    );
    expect(gate.activeCount).toBe(1);

    admitted[0].value.release();
    expect(gate.activeCount).toBe(0);
  });

  it("aborts a non-reading client at the deadline and releases capacity in finally", async () => {
    vi.useFakeTimers();
    const gate = new AccountExportSnapshotGate(1, 1_000);
    const response = new NonReadingExportResponse();
    const lease = await gate.acquire("slow-user");

    const stalledWrite = (async () => {
      try {
        await writeAccountExportChunk(response.asWritable(), "blocked", lease.signal);
      } finally {
        lease.release();
      }
    })();
    const rejection = expect(stalledWrite).rejects.toBeInstanceOf(
      AccountExportSnapshotDeadlineError,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;

    expect(gate.activeCount).toBe(0);
    const nextLease = await gate.acquire("next-user");
    nextLease.release();
  });
});
