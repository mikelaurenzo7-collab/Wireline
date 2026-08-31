/** Transactional email sender identity. Domain remains configurable independently of brand. */
const DEFAULT_DOMAIN = "botbound.me";
const DEFAULT_FROM = `BotBound <noreply@${DEFAULT_DOMAIN}>`;

export function extractEmailAddress(from: string): string {
  const angle = from.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  return from.trim();
}

export function extractFromDomain(from: string): string {
  const email = extractEmailAddress(from);
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

export function normalizeResendFromAddress(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_FROM;
  if (/<[^>]+@[^>]+>/.test(trimmed)) return trimmed;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return `BotBound <${trimmed}>`;
  return trimmed;
}

function isBotBoundSenderDomain(domain: string): boolean {
  return domain === DEFAULT_DOMAIN || domain.endsWith(`.${DEFAULT_DOMAIN}`);
}

function configuredResendFromAddress(): string {
  const explicit = process.env.RESEND_FROM_EMAIL?.trim();
  if (explicit) return normalizeResendFromAddress(explicit);
  const domain = process.env.RESEND_FROM_DOMAIN?.trim().toLowerCase();
  if (domain) return `BotBound <noreply@${domain}>`;
  return DEFAULT_FROM;
}

export function resolveResendFromAddress(): string {
  const configured = configuredResendFromAddress();
  // Production transactional mail is a BotBound surface. Legacy Wireline or
  // arbitrary sandbox sender overrides remain usable outside Production, but
  // can no longer silently escape into customer email after a brand cutover.
  if (
    process.env.VERCEL_ENV?.trim().toLowerCase() === "production" &&
    !isBotBoundSenderDomain(extractFromDomain(configured))
  ) {
    return DEFAULT_FROM;
  }
  return configured;
}

export interface ResendTransportDiagnostics {
  from: string;
  from_domain: string;
  has_api_key: boolean;
  configured_via: "RESEND_FROM_EMAIL" | "RESEND_FROM_DOMAIN" | "default";
  production_sender_overridden: boolean;
}

export function getResendTransportDiagnostics(): ResendTransportDiagnostics {
  const explicit = process.env.RESEND_FROM_EMAIL?.trim();
  const domain = process.env.RESEND_FROM_DOMAIN?.trim();
  const configured = configuredResendFromAddress();
  const from = resolveResendFromAddress();
  let configured_via: ResendTransportDiagnostics["configured_via"] = "default";
  if (explicit) configured_via = "RESEND_FROM_EMAIL";
  else if (domain) configured_via = "RESEND_FROM_DOMAIN";
  return {
    from,
    from_domain: extractFromDomain(from),
    has_api_key: Boolean(process.env.RESEND_API_KEY?.trim()),
    configured_via,
    production_sender_overridden: configured !== from,
  };
}

function sanitizeResendErrorDetail(value: string): string {
  return value
    .slice(0, 4_000)
    .replace(/\b[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,63}\b/gi, "[redacted-email]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function formatResendApiError(status: number, body: string): string {
  let detail = sanitizeResendErrorDetail(body);
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === "string") detail = sanitizeResendErrorDetail(parsed.message);
  } catch {
    /* keep sanitized raw slice */
  }

  if (
    status === 403 ||
    /sending domain|domain (?:is )?not verified|verify (?:the |your )?domain/i.test(detail)
  ) {
    const domain = extractFromDomain(resolveResendFromAddress());
    return `Resend ${status}: ${detail}. Sending domain must be verified in Resend for "${domain}". Set RESEND_FROM_EMAIL or RESEND_FROM_DOMAIN in Vercel to match your verified domain, then redeploy.`;
  }
  return `Resend ${status}: ${detail}`;
}
