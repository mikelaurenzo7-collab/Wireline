export type ExpiringAsyncCache<T> = {
  get(): Promise<T>;
  clear(): void;
};

/**
 * Coalesces concurrent reads and retains the last successful value for a bounded
 * interval. It is intentionally process-local: callers can pair it with CDN
 * caching, while each runtime instance avoids duplicate upstream work.
 */
export function createExpiringAsyncCache<T>(
  load: () => Promise<T>,
  ttlMs: number,
  now: () => number = Date.now,
): ExpiringAsyncCache<T> {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("ttlMs must be a positive finite number");
  }

  let value: T | undefined;
  let expiresAt = 0;
  let hasValue = false;
  let pending: Promise<T> | undefined;

  const get = async (): Promise<T> => {
    const currentTime = now();
    if (hasValue && currentTime < expiresAt) return value as T;
    if (pending) return pending;

    pending = Promise.resolve(load())
      .then((nextValue) => {
        value = nextValue;
        hasValue = true;
        expiresAt = now() + ttlMs;
        return nextValue;
      })
      .finally(() => {
        pending = undefined;
      });

    return pending;
  };

  return {
    get,
    clear: () => {
      value = undefined;
      hasValue = false;
      expiresAt = 0;
    },
  };
}
