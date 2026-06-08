// Pure SSRF-guard helpers for webhook URL validation.
// Extracted from server.ts so they can be unit-tested independently.

// Matches 100.64.0.0/10 — Carrier-grade NAT (RFC 6598). 100.{64..127}.x.x.
const CGN_RE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
// Matches 198.18.0.0/15 — Benchmarking networks (RFC 2544).
const BENCH_RE = /^198\.(1[89])\./;

export function isPrivateIp(ip: string): boolean {
  return (
    ip === "0.0.0.0" ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    CGN_RE.test(ip) ||
    BENCH_RE.test(ip) || // 198.18.0.0/15 benchmarking
    /^192\.0\.2\./.test(ip) || // 192.0.2.0/24 TEST-NET-1 (RFC 5737)
    /^198\.51\.100\./.test(ip) || // 198.51.100.0/24 TEST-NET-2 (RFC 5737)
    /^203\.0\.113\./.test(ip) // 203.0.113.0/24 TEST-NET-3 (RFC 5737)
  );
}

export function isPrivateIpv6(ip: string): boolean {
  const h = ip.toLowerCase();
  return (
    h === "::1" ||
    h === "::" || // unspecified — binds to all interfaces
    /^fe[89ab]/i.test(h) || // fe80::/10 link-local (fe80–febf)
    /^f[cd]/i.test(h) || // fc00::/7 ULA
    /^::ffff:/i.test(h) // IPv4-mapped
  );
}

// True only for hostnames that look like an IPv4 literal (four numeric octets).
// Used to gate IPv4 private-range checks so legitimate domains like
// "10.example.com" or "192.168.example.com" aren't rejected before DNS resolution.
const IPV4_LITERAL_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Fail-closed SSRF guard for server-initiated fetches of user-supplied URLs.
 * Combines sync literal/private-host checks with DNS resolution (blocks rebinding).
 * Returns a user-facing error string, or null when safe to fetch.
 */
export async function assertUrlSafeForServerFetch(raw: string): Promise<string | null> {
  if (isSsrfUrl(raw)) {
    return "url targets a private or internal address and cannot be fetched.";
  }
  const resolution = await resolveWebhookDeliveryHostname(raw);
  if (resolution.status === "private") {
    return "url resolves to a private or internal address and cannot be fetched.";
  }
  if (resolution.status === "dns_error") {
    return "could not resolve url hostname.";
  }
  return null;
}

/** Sync SSRF guard — pattern checks only, no DNS. */
export function isSsrfUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return true;
  }
  const rawHost = parsed.hostname.toLowerCase();
  const host = rawHost.startsWith("[") ? rawHost.slice(1, -1) : rawHost;
  const isIpv4Literal = IPV4_LITERAL_RE.test(host);
  // IPv6 prefix checks must only run on IPv6 literals (presence of ":") — otherwise
  // legitimate domains like "fd-prod.example.com" or "feb-promo.example.com" would
  // be flagged as private.
  const isIpv6Literal = host.includes(":");
  return (
    host === "localhost" ||
    (isIpv4Literal && isPrivateIp(host)) ||
    (isIpv6Literal && isPrivateIpv6(host))
  );
}

const PRIVATE_MSG = "Webhook URL must not target private or internal addresses.";
const DNS_MSG = "Could not resolve webhook hostname.";

export type WebhookHostnameResolution =
  | { status: "public" }
  | { status: "private" }
  | { status: "dns_error" };

function parseWebhookHost(raw: string): { host: string } | { error: "invalid_url" } {
  try {
    const parsed = new URL(raw);
    const rawHost = parsed.hostname.toLowerCase();
    const host = rawHost.startsWith("[") ? rawHost.slice(1, -1) : rawHost;
    return { host };
  } catch {
    return { error: "invalid_url" };
  }
}

async function lookupHostnameAddresses(host: string) {
  const { lookup } = await import("node:dns/promises");
  return lookup(host, { all: true });
}

function addressesIncludePrivate(addrs: Array<{ address: string; family: number }>): boolean {
  return addrs.some(
    ({ address, family }) =>
      (family === 4 && isPrivateIp(address)) || (family === 6 && isPrivateIpv6(address)),
  );
}

/**
 * Delivery-time DNS guard — fail closed on resolution failure to block rebinding.
 */
export async function resolveWebhookDeliveryHostname(
  raw: string,
): Promise<WebhookHostnameResolution> {
  const parsed = parseWebhookHost(raw);
  if ("error" in parsed) return { status: "dns_error" };

  const { host } = parsed;
  const isIpLiteral = /^[\d.]+$/.test(host) || host.includes(":");
  if (isIpLiteral) return { status: "public" }; // sync guards already handled literals

  try {
    const addrs = await lookupHostnameAddresses(host);
    if (addressesIncludePrivate(addrs)) return { status: "private" };
    return { status: "public" };
  } catch {
    return { status: "dns_error" };
  }
}

/**
 * @deprecated Prefer resolveWebhookDeliveryHostname for delivery-time checks.
 * Returns true when the hostname resolves private OR DNS fails (fail-closed).
 */
export async function hostnameResolvesToPrivate(raw: string): Promise<boolean> {
  const resolution = await resolveWebhookDeliveryHostname(raw);
  return resolution.status === "private" || resolution.status === "dns_error";
}

/**
 * Full async validator used at registration time.
 * Checks URL scheme, hostname patterns, and resolves all DNS A/AAAA answers.
 */
export async function validateWebhookUrl(raw: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "Invalid URL.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Webhook URL must use http or https.";
  }
  const rawHost = parsed.hostname.toLowerCase();
  const host = rawHost.startsWith("[") ? rawHost.slice(1, -1) : rawHost;

  const isIpv4Literal = IPV4_LITERAL_RE.test(host);
  const isIpv6Literal = host.includes(":");
  if (
    host === "localhost" ||
    (isIpv4Literal && isPrivateIp(host)) ||
    (isIpv6Literal && isPrivateIpv6(host))
  ) {
    return PRIVATE_MSG;
  }

  const isIpLiteral = /^[\d.]+$/.test(host) || host.includes(":");
  if (!isIpLiteral) {
    try {
      const addrs = await lookupHostnameAddresses(host);
      if (addressesIncludePrivate(addrs)) return PRIVATE_MSG;
    } catch {
      return DNS_MSG;
    }
  }
  return null;
}
