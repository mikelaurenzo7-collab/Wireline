/**
 * Resend "from" address resolution — single source of truth for platform
 * transactional mail (showcase signup/payment links, auth, billing).
 *
 * Resend only delivers from domains you've verified. If RESEND_API_KEY is set
 * but RESEND_FROM_EMAIL / RESEND_FROM_DOMAIN don't match the verified domain,
 * sends fail with 403/422 and live agents tell callers "the email didn't go through".
 */

const DEFAULT_DOMAIN = "trywireline.com";
const DEFAULT_FROM = `Wireline <noreply@${DEFAULT_DOMAIN}>`;

/** Extract the mailbox from `Name <a@b.com>` or a bare address. */
export function extractEmailAddress(from: string): string {
  const angle = from.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  return from.trim();
}

/** Domain portion of the configured From address (for diagnostics). */
export function extractFromDomain(from: string): string {
  const email = extractEmailAddress(from);
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

/**
 * Normalize Account Holder input:
 *   - `user@domain.com` → `Wireline <user@domain.com>`
 *   - `Wireline <user@domain.com>` → unchanged
 */
export function normalizeResendFromAddress(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_FROM;
  if (/<[^>]+@[^>]+>/.test(trimmed)) return trimmed;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return `Wireline <${trimmed}>`;
  }
  return trimmed;
}

/**
 * Resolved From header for Resend API calls.
 *
 * Priority:
 *   1. RESEND_FROM_EMAIL (full address or `Name <email>`)
 *   2. RESEND_FROM_DOMAIN → `Wireline <noreply@DOMAIN>`
 *   3. Default `noreply@trywireline.com`
 */
export function resolveResendFromAddress(): string {
  const explicit = process.env.RESEND_FROM_EMAIL?.trim();
  if (explicit) return normalizeResendFromAddress(explicit);

  const domain = process.env.RESEND_FROM_DOMAIN?.trim().toLowerCase();
  if (domain) return `Wireline <noreply@${domain}>`;

  return DEFAULT_FROM;
}

export interface ResendTransportDiagnostics {
  from: string;
  from_domain: string;
  has_api_key: boolean;
  configured_via: "RESEND_FROM_EMAIL" | "RESEND_FROM_DOMAIN" | "default";
}

export function getResendTransportDiagnostics(): ResendTransportDiagnostics {
  const explicit = process.env.RESEND_FROM_EMAIL?.trim();
  const domain = process.env.RESEND_FROM_DOMAIN?.trim();
  const from = resolveResendFromAddress();
  let configured_via: ResendTransportDiagnostics["configured_via"] = "default";
  if (explicit) configured_via = "RESEND_FROM_EMAIL";
  else if (domain) configured_via = "RESEND_FROM_DOMAIN";

  return {
    from,
    from_domain: extractFromDomain(from),
    has_api_key: Boolean(process.env.RESEND_API_KEY?.trim()),
    configured_via,
  };
}

/**
 * Provider errors are both user-facing and logged. Bound them, flatten control
 * characters, and remove any mailbox Resend echoes back in an error response.
 */
function sanitizeResendErrorDetail(value: string): string {
  return (
    value
      // Bound the scan before redacting: the provider body is arbitrary length
      // and unbounded `+` runs backtrack quadratically against long
      // address-shaped text that never reaches an `@`. Only the first 300
      // characters survive anyway, so a generous window loses nothing.
      .slice(0, 4_000)
      .replace(/\b[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,63}\b/gi, "[redacted-email]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300)
  );
}

/** Parse Resend error JSON into a short Account Holder-facing string. */
export function formatResendApiError(status: number, body: string): string {
  let detail = sanitizeResendErrorDetail(body);
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === "string") {
      detail = sanitizeResendErrorDetail(parsed.message);
    }
  } catch {
    /* keep sanitized raw slice */
  }

  if (
    status === 403 ||
    /sending domain|domain (?:is )?not verified|verify (?:the |your )?domain/i.test(detail)
  ) {
    const from = resolveResendFromAddress();
    const domain = extractFromDomain(from);
    return (
      `Resend ${status}: ${detail}. ` +
      `Sending domain must be verified in Resend for "${domain}". ` +
      `Set RESEND_FROM_EMAIL or RESEND_FROM_DOMAIN in Vercel to match your verified domain, then redeploy.`
    );
  }

  return `Resend ${status}: ${detail}`;
}
