/**
 * OAuth email-verification trust checks.
 *
 * Wireline links accounts across identity providers by email address: a user
 * who signs up with a password can later sign in with Google or Microsoft on
 * the same email and land on the same account. That convenience makes email
 * ownership security-critical — any provider sign-in that attaches to a
 * pre-existing account must prove the caller controls that email.
 *
 * Microsoft's Graph `mail` attribute (and the work/school id_token `email`
 * claim) is a tenant-admin-settable, unverified proxy address. An attacker who
 * controls any Entra tenant can set `mail` to a victim's address and, without
 * a verification gate, take over the victim's Wireline account — the published
 * "nOAuth" vulnerability. We therefore only trust a Microsoft email when the
 * token itself proves ownership:
 *   - a personal Microsoft account (the fixed consumer tenant), or
 *   - an id_token asserting `xms_edov` (email domain owner verified).
 */

/** Personal Microsoft accounts (MSA) always resolve to this tenant id. */
export const MICROSOFT_CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";

/** Decode a JWT payload without verifying the signature. Safe here because the
 * id_token is read directly from Microsoft's token endpoint over TLS during the
 * server-side code-for-token exchange, never from the untrusted client. */
export function decodeJwtClaims(
  idToken: string | undefined | null,
): Record<string, unknown> | null {
  if (!idToken || typeof idToken !== "string") return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** True only when the token proves the caller owns the email. */
export function microsoftEmailIsVerified(claims: Record<string, unknown> | null): boolean {
  if (!claims) return false;
  if (claims.xms_edov === true || claims.xms_edov === "true") return true;
  if (typeof claims.tid === "string" && claims.tid === MICROSOFT_CONSUMER_TENANT_ID) return true;
  return false;
}

/**
 * Resolve the trusted, normalized email for a Microsoft sign-in, or null when
 * ownership can't be proven (caller must be rejected, never attached to an
 * existing account).
 */
export function resolveMicrosoftVerifiedEmail(
  claims: Record<string, unknown> | null,
  graph: { mail?: string | null; userPrincipalName?: string | null },
): string | null {
  if (!microsoftEmailIsVerified(claims)) return null;
  const claimEmail = typeof claims?.email === "string" ? claims.email : null;
  const email = claimEmail || graph.mail || graph.userPrincipalName || null;
  return email ? email.trim().toLowerCase() : null;
}
