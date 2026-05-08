// Pure SSRF-guard helpers for webhook URL validation.
// Extracted from server.ts so they can be unit-tested independently.

// Matches 100.64.0.0/10 — Carrier-grade NAT (RFC 6598). 100.{64..127}.x.x.
const CGN_RE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;

export function isPrivateIp(ip: string): boolean {
  return (
    ip === "0.0.0.0" ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    CGN_RE.test(ip)
  );
}

export function isPrivateIpv6(ip: string): boolean {
  const h = ip.toLowerCase();
  return (
    h === "::1" ||
    h === "::" ||            // unspecified — binds to all interfaces
    /^fe[89ab]/i.test(h) ||  // fe80::/10 link-local (fe80–febf)
    /^f[cd]/i.test(h) ||     // fc00::/7 ULA
    /^::ffff:/i.test(h)      // IPv4-mapped
  );
}

/** Sync SSRF guard — pattern checks only, no DNS. */
export function isSsrfUrl(raw: string): boolean {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return true; }
  const rawHost = parsed.hostname.toLowerCase();
  const host = rawHost.startsWith("[") ? rawHost.slice(1, -1) : rawHost;
  // IPv6 prefix checks must only run on IPv6 literals (presence of ":") — otherwise
  // legitimate domains like "fd-prod.example.com" or "feb-promo.example.com" would
  // be flagged as private.
  const isIpv6Literal = host.includes(":");
  return (
    /^::ffff:/i.test(host) ||
    host === "::" ||
    host === "::1" ||
    host === "localhost" ||
    host === "0.0.0.0" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    CGN_RE.test(host) ||                            // 100.64.0.0/10 CGN
    (isIpv6Literal && /^f[cd]/i.test(host)) ||      // fc00::/7 ULA
    (isIpv6Literal && /^fe[89ab]/i.test(host))      // fe80::/10 link-local
  );
}

const PRIVATE_MSG = "Webhook URL must not target private or internal addresses.";

/**
 * Full async validator used at registration time.
 * Checks URL scheme, hostname patterns, and resolves all DNS A/AAAA answers.
 */
export async function validateWebhookUrl(raw: string): Promise<string | null> {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return "Invalid URL."; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Webhook URL must use http or https.";
  }
  const rawHost = parsed.hostname.toLowerCase();
  const host = rawHost.startsWith("[") ? rawHost.slice(1, -1) : rawHost;

  if (/^::ffff:/i.test(host)) return PRIVATE_MSG;
  // IPv6 prefix checks must only run on IPv6 literals — otherwise domains like
  // "fd-prod.example.com" would be incorrectly flagged.
  const isIpv6Literal = host.includes(":");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    CGN_RE.test(host) ||                            // 100.64.0.0/10 CGN
    /^::1$/.test(host) ||
    host === "::" ||
    (isIpv6Literal && /^f[cd]/i.test(host)) ||
    (isIpv6Literal && /^fe[89ab]/i.test(host))
  ) {
    return PRIVATE_MSG;
  }

  // Resolve every A and AAAA answer — a host with mixed public/private records
  // must still be rejected.
  const isIpLiteral = /^[\d.]+$/.test(host) || host.includes(":");
  if (!isIpLiteral) {
    const { lookup } = await import("node:dns/promises");
    try {
      const addrs = await lookup(host, { all: true });
      for (const { address, family } of addrs) {
        if (family === 4 && isPrivateIp(address)) return PRIVATE_MSG;
        if (family === 6 && isPrivateIpv6(address)) return PRIVATE_MSG;
      }
    } catch { /* DNS failure — allow through; delivery will fail naturally */ }
  }
  return null;
}

/**
 * Async DNS check reused at delivery time to guard against DNS rebinding.
 * Returns true if the hostname resolves to any private/internal address.
 * Returns false on DNS failure (conservative — don't block on outage).
 */
export async function hostnameResolvesToPrivate(raw: string): Promise<boolean> {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }
  const rawHost = parsed.hostname.toLowerCase();
  const host = rawHost.startsWith("[") ? rawHost.slice(1, -1) : rawHost;
  const isIpLiteral = /^[\d.]+$/.test(host) || host.includes(":");
  if (isIpLiteral) return false; // already caught by isSsrfUrl
  try {
    const { lookup } = await import("node:dns/promises");
    const addrs = await lookup(host, { all: true });
    return addrs.some(({ address, family }) =>
      (family === 4 && isPrivateIp(address)) || (family === 6 && isPrivateIpv6(address))
    );
  } catch {
    return false;
  }
}
