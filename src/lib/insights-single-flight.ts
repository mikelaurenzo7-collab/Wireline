/** Share one in-flight calculation per tenant and window, without caching failures. */
export function createInsightsSingleFlight<T>() {
  const pending = new Map<string, Promise<T>>();
  return {
    run(key: string, compute: () => Promise<T>): Promise<T> {
      const existing = pending.get(key);
      if (existing) return existing;
      const flight = Promise.resolve().then(compute);
      pending.set(key, flight);
      void flight.then(
        () => pending.delete(key),
        () => pending.delete(key),
      );
      return flight;
    },
  };
}
