export type FairKeyedConcurrencyGateRejectionReason =
  "aborted" | "duplicate" | "queue_full" | "timeout";

export class FairKeyedConcurrencyGateAdmissionError extends Error {
  readonly code = "CONCURRENCY_GATE_ADMISSION_REJECTED";

  constructor(readonly reason: FairKeyedConcurrencyGateRejectionReason) {
    super(`Concurrency gate admission rejected: ${reason}`);
    this.name = "FairKeyedConcurrencyGateAdmissionError";
  }
}

export type FairKeyedConcurrencyPermit = {
  /** Idempotent so overlapping response/error cleanup cannot over-release. */
  release: () => void;
};

type Waiter = {
  key: string;
  resolve: (permit: FairKeyedConcurrencyPermit) => void;
  reject: (error: FairKeyedConcurrencyGateAdmissionError) => void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort?: () => void;
  settled: boolean;
};

/**
 * Process-local FIFO containment for work that must hold scarce pooled
 * resources across a remote provider call.
 *
 * The gate is deliberately keyed: one tenant cannot occupy multiple active or
 * queued slots with duplicate billing mutations. Database advisory locks remain
 * the cross-instance correctness boundary; this helper only prevents one Node
 * process from starving its own pool while waiting for those exact locks.
 */
export class FairKeyedConcurrencyGate {
  private active = 0;
  private readonly ownedKeys = new Set<string>();
  private readonly queue: Waiter[] = [];

  constructor(
    readonly capacity: number,
    readonly maxQueue: number,
    readonly waitTimeoutMs: number,
  ) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error("Concurrency gate capacity must be a positive integer.");
    }
    if (!Number.isInteger(maxQueue) || maxQueue < 0) {
      throw new Error("Concurrency gate maxQueue must be a non-negative integer.");
    }
    if (!Number.isFinite(waitTimeoutMs) || waitTimeoutMs <= 0) {
      throw new Error("Concurrency gate waitTimeoutMs must be positive.");
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  acquire(input: { key: string; signal?: AbortSignal }): Promise<FairKeyedConcurrencyPermit> {
    const key = input.key.trim();
    if (!key) return Promise.reject(new Error("Concurrency gate key is required."));
    if (input.signal?.aborted) {
      return Promise.reject(new FairKeyedConcurrencyGateAdmissionError("aborted"));
    }
    if (this.ownedKeys.has(key)) {
      return Promise.reject(new FairKeyedConcurrencyGateAdmissionError("duplicate"));
    }

    this.ownedKeys.add(key);
    if (this.active < this.capacity && this.queue.length === 0) {
      this.active += 1;
      return Promise.resolve(this.createPermit(key));
    }

    if (this.queue.length >= this.maxQueue) {
      this.ownedKeys.delete(key);
      return Promise.reject(new FairKeyedConcurrencyGateAdmissionError("queue_full"));
    }

    return new Promise<FairKeyedConcurrencyPermit>((resolve, reject) => {
      const waiter: Waiter = {
        key,
        resolve,
        reject,
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
        signal: input.signal,
        settled: false,
      };

      const rejectWaiting = (reason: FairKeyedConcurrencyGateRejectionReason) => {
        if (waiter.settled) return;
        waiter.settled = true;
        this.removeWaiter(waiter);
        this.ownedKeys.delete(waiter.key);
        this.detachWaiter(waiter);
        reject(new FairKeyedConcurrencyGateAdmissionError(reason));
        this.dispatch();
      };

      waiter.onAbort = () => rejectWaiting("aborted");
      waiter.timer = setTimeout(() => rejectWaiting("timeout"), this.waitTimeoutMs);
      // A queue timer must never keep an otherwise-drained worker alive.
      waiter.timer.unref?.();
      input.signal?.addEventListener("abort", waiter.onAbort, { once: true });
      this.queue.push(waiter);
      this.dispatch();
    });
  }

  async run<T>(input: {
    key: string;
    signal?: AbortSignal;
    perform: () => Promise<T>;
  }): Promise<T> {
    const permit = await this.acquire({ key: input.key, signal: input.signal });
    try {
      return await input.perform();
    } finally {
      permit.release();
    }
  }

  private createPermit(key: string): FairKeyedConcurrencyPermit {
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.ownedKeys.delete(key);
        this.active = Math.max(0, this.active - 1);
        this.dispatch();
      },
    };
  }

  private dispatch(): void {
    while (this.active < this.capacity && this.queue.length > 0) {
      const waiter = this.queue.shift();
      if (!waiter || waiter.settled) continue;
      waiter.settled = true;
      this.detachWaiter(waiter);
      this.active += 1;
      waiter.resolve(this.createPermit(waiter.key));
    }
  }

  private removeWaiter(waiter: Waiter): void {
    const index = this.queue.indexOf(waiter);
    if (index >= 0) this.queue.splice(index, 1);
  }

  private detachWaiter(waiter: Waiter): void {
    clearTimeout(waiter.timer);
    if (waiter.onAbort) waiter.signal?.removeEventListener("abort", waiter.onAbort);
  }
}
