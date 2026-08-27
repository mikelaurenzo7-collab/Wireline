const PROVIDER_CALL_MAY_EXIST = Symbol.for("botbound.realtime.providerCallMayExist");

type MarkedProviderError = Error & {
  [PROVIDER_CALL_MAY_EXIST]?: boolean;
};

/**
 * Attach the provider-side outcome to an error without exposing it through the
 * public API shape. Callers use this to decide whether quota and cost reserves
 * can be refunded safely.
 */
export function markRealtimeProviderCallOutcome<T extends Error>(
  error: T,
  providerCallMayExist: boolean,
): T {
  Object.defineProperty(error, PROVIDER_CALL_MAY_EXIST, {
    configurable: false,
    enumerable: false,
    value: providerCallMayExist,
    writable: false,
  });
  return error;
}

export function realtimeProviderCallMayExist(error: unknown): boolean | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as MarkedProviderError)[PROVIDER_CALL_MAY_EXIST];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Explicit OpenAI call outcomes win. Unmarked 502s retain the historical,
 * conservative behavior for other realtime providers whose call state may be
 * ambiguous after a network failure.
 */
export function shouldRetainRealtimeReservation(error: unknown): boolean {
  const explicit = realtimeProviderCallMayExist(error);
  if (explicit !== undefined) return explicit;
  return Boolean(
    error && typeof error === "object" && (error as { status?: unknown }).status === 502,
  );
}
