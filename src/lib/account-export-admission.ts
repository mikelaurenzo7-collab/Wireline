import {
  FairKeyedConcurrencyGate,
  FairKeyedConcurrencyGateAdmissionError,
  type FairKeyedConcurrencyPermit,
} from "./fair-keyed-concurrency-gate";

/**
 * The application pool has five connections per instance. An account export
 * holds one connection for a repeatable-read snapshot, so only one export may
 * own a snapshot at a time. This leaves four connections available for normal
 * authenticated traffic even when a download client stops reading.
 */
export const ACCOUNT_EXPORT_MAX_CONCURRENT_SNAPSHOTS = 1;

/**
 * Vercel allows the core function to run for ten minutes. Abort a stalled
 * export early enough for its transaction to roll back and release the client
 * before the platform terminates the invocation.
 */
export const ACCOUNT_EXPORT_SNAPSHOT_DEADLINE_MS = 8 * 60 * 1000;

export class AccountExportBusyError extends Error {
  readonly code = "ACCOUNT_EXPORT_BUSY";

  constructor() {
    super("Another account export is already running on this server instance.");
    this.name = "AccountExportBusyError";
  }
}

export class AccountExportSnapshotDeadlineError extends Error {
  readonly code = "ACCOUNT_EXPORT_DEADLINE_EXCEEDED";

  constructor() {
    super("Account export exceeded its server-side snapshot deadline.");
    this.name = "AccountExportSnapshotDeadlineError";
  }
}

export type AccountExportSnapshotLease = {
  signal: AbortSignal;
  /** Idempotent so response and transaction cleanup may safely overlap. */
  release: () => void;
};

export class AccountExportSnapshotGate {
  private readonly gate: FairKeyedConcurrencyGate;

  constructor(
    readonly capacity = ACCOUNT_EXPORT_MAX_CONCURRENT_SNAPSHOTS,
    readonly deadlineMs = ACCOUNT_EXPORT_SNAPSHOT_DEADLINE_MS,
  ) {
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
      throw new Error("Account export snapshot deadline must be positive.");
    }
    // Exports are user-initiated downloads, so fail fast instead of queueing
    // requests that may already be abandoned by the time capacity is free.
    this.gate = new FairKeyedConcurrencyGate(capacity, 0, 1_000);
  }

  get activeCount(): number {
    return this.gate.activeCount;
  }

  async acquire(userId: string): Promise<AccountExportSnapshotLease> {
    let permit: FairKeyedConcurrencyPermit;
    try {
      permit = await this.gate.acquire({ key: userId });
    } catch (error) {
      if (error instanceof FairKeyedConcurrencyGateAdmissionError) {
        throw new AccountExportBusyError();
      }
      throw error;
    }

    const deadline = new AbortController();
    const timer = setTimeout(
      () => deadline.abort(new AccountExportSnapshotDeadlineError()),
      this.deadlineMs,
    );
    timer.unref?.();

    let released = false;
    return {
      signal: deadline.signal,
      release: () => {
        if (released) return;
        released = true;
        clearTimeout(timer);
        permit.release();
      },
    };
  }
}

export const accountExportSnapshotGate = new AccountExportSnapshotGate();
