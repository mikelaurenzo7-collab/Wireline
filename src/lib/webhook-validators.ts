import { BlockList, isIP } from "node:net";

// Pure SSRF-guard helpers for webhook URL validation.
// Extracted from server.ts so they can be unit-tested independently.

const CGN_RE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
const BENCH_RE = /^198\.(1[89])\./;
const NON_PUBLIC_V4_RE = /^(?:22[4-9]|23\d|24\d|25[0-5])\./;

const NON_PUBLIC_IPV6 = new BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  NON_PUBLIC_IPV6.addSubnet(network, prefix, "ipv6");
}

export function isPrivateIp(ip: string): boolean {
  return (
    /^0\./.test(ip) ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^192\.0\.0\./.test(ip) ||
    /^192\.88\.99\./.test(ip) ||
    CGN_RE.test(ip) ||
    BENCH_RE.test(ip) ||
    /^192\.0\.2\./.test(ip) ||
    /^198\.51\.100\./.test(ip) ||
    /^203\.0\.113\./.test(ip) ||
    NON_PUBLIC_V4_RE.test(ip)
  );
}

export function isPrivateIpv6(ip: string): boolean {
  return isIP(ip) !== 6 || NON_PUBLIC_IPV6.check(ip, "ipv6");
}

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
    Boolean(parsed.username || parsed.password) ||
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
): { host: string; protocol: string; hasCredentials: boolean } | { error: "invalid_url" } {
  try {
    const parsed = new URL(raw);
    const rawHost = parsed.hostname.toLowerCase();
    const host = rawHost.startsWith("[") ? rawHost.slice(1, -1) : rawHost;
    return {
      host,
      protocol: parsed.protocol,
      hasCredentials: Boolean(parsed.username || parsed.password),
    };
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

export async function resolveWebhookDeliveryHostname(
  raw: string,
): Promise<WebhookHostnameResolution> {
  const parsed = parseWebhookHost(raw);
  if ("error" in parsed) return { status: "dns_error" };
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.hasCredentials
  ) {
    return { status: "dns_error" };
  }

  const { host } = parsed;
  if (host === "localhost") return { status: "private" };

  const ipFamily = isIP(host);
  if (ipFamily === 4) return { status: isPrivateIp(host) ? "private" : "public" };
  if (ipFamily === 6) return { status: isPrivateIpv6(host) ? "private" : "public" };

  try {
    const addrs = await lookupHostnameAddresses(host);
    if (!addrs.length) return { status: "dns_error" };
    if (addressesIncludePrivate(addrs)) return { status: "private" };
    return { status: "public" };
  } catch {
    return { status: "dns_error" };
  }
}

export async function hostnameResolvesToPrivate(raw: string): Promise<boolean> {
  const resolution = await resolveWebhookDeliveryHostname(raw);
  return resolution.status === "private" || resolution.status === "dns_error";
}

export async function validateWebhookUrl(raw: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "Invalid URL.";
  }
  if (parsed.protocol !== "https:") return "Webhook URL must use HTTPS.";
  if (parsed.username || parsed.password) {
    return "Webhook URL must not include embedded credentials.";
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
