import { isIP } from "node:net";

// Pure SSRF-guard helpers for webhook URL validation.
// Extracted from server.ts so they can be unit-tested independently.

// Matches 100.64.0.0/10 — Carrier-grade NAT (RFC 6598). 100.{64..127}.x.x.
const CGN_RE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
// Matches 198.18.0.0/15 — Benchmarking networks (RFC 2544).
const BENCH_RE = /^198\.(1[89])\./;
// Multicast and reserved/future-use IPv4 space must never be a webhook destination.
const NON_PUBLIC_V4_RE = /^(?:22[4-9]|23\d|24\d|25[0-5])\./;

export function isPrivateIp(ip: string): boolean {
  return (
    /^0\./.test(ip) || // 0.0.0.0/8 — current network / unspecified
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^192\.0\.0\./.test(ip) || // IETF protocol assignments
    /^192\.88\.99\./.test(ip) || // deprecated 6to4 relay anycast
    CGN_RE.test(ip) ||
    BENCH_RE.test(ip) || // 198.18.0.0/15 benchmarking
    /^192\.0\.2\./.test(ip) || // 192.0.2.0/24 TEST-NET-1 (RFC 5737)
    /^198\.51\.100\./.test(ip) || // 198.51.100.0/24 TEST-NET-2 (RFC 5737)
    /^203\.0\.113\./.test(ip) || // 203.0.113.0/24 TEST-NET-3 (RFC 5737)
    NON_PUBLIC_V4_RE.test(ip)
  );
}

export function isPrivateIpv6(ip: string): boolean {
  const h = ip.toLowerCase();
  return (
    h === "::1" ||
    h === "::" || // unspecified — binds to all interfaces
    /^::(?:ffff:)?/i.test(h) || // IPv4-compatible/mapped low-address space
    /^64:ff9b(?::1)?:/i.test(h) || // NAT64 translation prefixes
    /^100:/i.test(h) || // 100::/64 discard-only
    /^fe[89abcdef]/i.test(h) || // link-local and deprecated site-local
    /^f[cd]/i.test(h) || // fc00::/7 ULA
    /^ff/i.test(h) || // ff00::/8 multicast
    /^2001:(?:0:|10:|1[1-9a-f]:|2:|2[0-9a-f]:|db8:)/i.test(h) || // transition, ORCHID, benchmark, docs
    /^2002:/i.test(h) // deprecated 6to4 transition space
  );
}

/**
 * Fail-closed SSRF guard for server-initiated fetches of user-supplied URLs.
 * Combines literal/private-host checks with DNS resolution. Callers that need
 * full DNS-rebinding resistance must also pin the validated address during the
 * network connection rather than performing an unrelated second lookup.
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

/** Sync SSRF guard — pattern and normalized IP-literal checks only, no DNS. */
export function isSsrfUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return true;
  }
  const rawHost = parsed.hostname.toLowerCase();
  const host = rawHost.startsWith("[") ? rawHost.slice(1, -1) : rawHost;
  const ipFamily = isIP(host);
  return (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    host === "localhost" ||
    (ipFamily === 4 && isPrivateIp(host)) ||
    (ipFamily === 6 && isPrivateIpv6(host))
  );
}

const PRIVATE_MSG = "Webhook URL must not target private or internal addresses.";
const DNS_MSG = "Could not resolve webhook hostname.";

export type WebhookHostnameResolution =
  | { status: "public" }
  | { status: "private" }
  | { status: "dns_error" };

function parseWebhookHost(
  raw: string,
): { host: string; protocol: string } | { error: "invalid_url" } {
  try {
    const parsed = new URL(raw);
    const rawHost = parsed.hostname.toLowerCase();
    const host = rawHost.startsWith("[") ? rawHost.slice(1, -1) : rawHost;
    return { host, protocol: parsed.protocol };
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
 * Hostname classification helper retained for non-webhook server fetches. It
 * rejects private IP literals directly and fails closed when a hostname does
 * not resolve or any A/AAAA answer is not public. Webhook delivery itself uses
 * the DNS-pinned transport in safe-webhook-delivery.ts.
 */
export async function resolveWebhookDeliveryHostname(
  raw: string,
): Promise<WebhookHostnameResolution> {
  const parsed = parseWebhookHost(raw);
  if ("error" in parsed) return { status: "dns_error" };
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { status: "dns_error" };
  }

  const { host } = parsed;
  if (host === "localhost") return { status: "private" };

  const ipFamily = isIP(host);
  if (ipFamily === 4) {
    return { status: isPrivateIp(host) ? "private" : "public" };
  }
  if (ipFamily === 6) {
    return { status: isPrivateIpv6(host) ? "private" : "public" };
  }

  try {
    const addrs = await lookupHostnameAddresses(host);
    if (!addrs.length) return { status: "dns_error" };
    if (addressesIncludePrivate(addrs)) return { status: "private" };
    return { status: "public" };
  } catch {
    return { status: "dns_error" };
  }
}

/**
 * @deprecated Prefer resolveWebhookDeliveryHostname for classification and the
 * DNS-pinned delivery transport for actual customer webhook sends.
 */
export async function hostnameResolvesToPrivate(raw: string): Promise<boolean> {
  const resolution = await resolveWebhookDeliveryHostname(raw);
  return resolution.status === "private" || resolution.status === "dns_error";
}

/**
 * Full async validator used at webhook registration time.
 * Customer webhook payloads may contain sensitive business and communication
 * data, so only HTTPS endpoints are accepted.
 */
export async function validateWebhookUrl(raw: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "Invalid URL.";
  }
  if (parsed.protocol !== "https:") {
    return "Webhook URL must use HTTPS.";
  }
  const rawHost = parsed.hostname.toLowerCase();
  const host = rawHost.startsWith("[") ? rawHost.slice(1, -1) : rawHost;
  const ipFamily = isIP(host);
  if (
    host === "localhost" ||
    (ipFamily === 4 && isPrivateIp(host)) ||
    (ipFamily === 6 && isPrivateIpv6(host))
  ) {
    return PRIVATE_MSG;
  }

  if (ipFamily === 0) {
    try {
      const addrs = await lookupHostnameAddresses(host);
      if (!addrs.length) return DNS_MSG;
      if (addressesIncludePrivate(addrs)) return PRIVATE_MSG;
    } catch {
      return DNS_MSG;
    }
  }
  return null;
}
