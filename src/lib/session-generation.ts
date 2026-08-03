import type { JwtPayload } from "./auth-utils";

export type SessionGenerationState = {
  sessionRevokedBefore: Date;
  sessionVersion: number;
};

function hasClaim(payload: JwtPayload, claim: string): boolean {
  return Object.prototype.hasOwnProperty.call(payload, claim);
}

function validSessionVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function legacyIssuedAtMs(payload: JwtPayload): number | null {
  if (hasClaim(payload, "iat_ms")) {
    return typeof payload.iat_ms === "number" &&
      Number.isFinite(payload.iat_ms) &&
      payload.iat_ms > 0
      ? payload.iat_ms
      : null;
  }

  return typeof payload.iat === "number" && Number.isFinite(payload.iat) && payload.iat > 0
    ? payload.iat * 1000
    : null;
}

/**
 * Apply Wireline's one canonical database-owned session-generation fence.
 * Keep every session consumer routed through this helper so OAuth callbacks,
 * API middleware, session lifecycle routes, and future transports cannot drift
 * on revocation semantics.
 *
 * Every token minted since migration 0127 carries a numeric session_version;
 * the claim must be structurally valid and match exactly. Only tokens where the
 * claim is genuinely absent may use the legacy issued-at revocation boundary.
 * This prevents malformed present claims from being silently downgraded into
 * legacy clock-based validation.
 */
export function isSessionGenerationActive(
  payload: JwtPayload,
  state: SessionGenerationState,
): boolean {
  if (!validSessionVersion(state.sessionVersion)) return false;

  if (hasClaim(payload, "session_version")) {
    return (
      validSessionVersion(payload.session_version) &&
      payload.session_version === state.sessionVersion
    );
  }

  const issuedAtMs = legacyIssuedAtMs(payload);
  return issuedAtMs !== null && issuedAtMs > state.sessionRevokedBefore.getTime();
}
