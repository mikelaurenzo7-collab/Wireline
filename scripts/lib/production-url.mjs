/** Public launch origin. Release certification must always probe this host. */
export const CANONICAL_PRODUCTION_URL = "https://botbound.me";

/**
 * Transition-only compatibility origin for already-registered callbacks and
 * shipped clients. It is deliberately not accepted by
 * `resolveCanonicalProductionUrl`: a healthy compatibility alias must never
 * let the canonical BotBound launch surface escape certification.
 */
export const LEGACY_COMPATIBILITY_URL = "https://trywireline.com";

/** Launch certification must observe the canonical customer-facing origin. */
export function resolveCanonicalProductionUrl(value = "") {
  const candidate = String(value || CANONICAL_PRODUCTION_URL).trim();
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("WIRELINE_PRODUCTION_URL must be the canonical BotBound production URL.");
  }
  if (
    parsed.origin !== CANONICAL_PRODUCTION_URL ||
    !["", "/"].includes(parsed.pathname) ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      `Refusing to certify a noncanonical production origin: ${parsed.origin || "invalid"}`,
    );
  }
  return CANONICAL_PRODUCTION_URL;
}

export function canonicalRuntimeCommitFinding(result, expectedCommit) {
  if (!result?.ok) return "canonical_runtime_unreachable";
  const servedCommit = String(result?.sourceCommit || "")
    .trim()
    .toLowerCase();
  const expected = String(expectedCommit || "")
    .trim()
    .toLowerCase();
  if (!expected || servedCommit !== expected) return "canonical_domain_commit_mismatch";
  return null;
}
