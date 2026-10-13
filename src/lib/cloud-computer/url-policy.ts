import { isIP } from "node:net";

/**
 * Network policy for a Bot's cloud computer.
 *
 * The browser runs in an isolated remote sandbox, but every request is still
 * screened here as defense in depth: only http(s) to public addresses, never
 * loopback, private, link-local, carrier-grade NAT, metadata, or reserved
 * space, and never internal hostnames. Page content and model output are both
 * untrusted, so the same checks apply to every navigation and subresource.
 */

export const HISTORY_TARGETS = ["back", "forward", "reload"] as const;
export type HistoryTarget = (typeof HISTORY_TARGETS)[number];

export type NavigateTarget =
  | { kind: "history"; action: HistoryTarget }
  | { kind: "url"; url: URL }
  | { kind: "refused"; reason: string };

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".onrender-internal",
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "kubernetes",
  "kubernetes.default",
]);

/** Parse an owner- or model-supplied navigation target. */
export function parseNavigateTarget(raw: unknown): NavigateTarget {
  if (typeof raw !== "string") return { kind: "refused", reason: "Navigation needs a URL." };
  const value = raw.trim();
  if ((HISTORY_TARGETS as readonly string[]).includes(value.toLowerCase())) {
    return { kind: "history", action: value.toLowerCase() as HistoryTarget };
  }
  if (!value || value.length > 2048) {
    return { kind: "refused", reason: "Navigation URL is empty or too long." };
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  if (hasScheme && !/^https?:\/\//i.test(value)) {
    return { kind: "refused", reason: "Navigation refused. Only http and https URLs are allowed." };
  }
  let url: URL;
  try {
    url = new URL(hasScheme ? value : `https://${value}`);
  } catch {
    return { kind: "refused", reason: "Navigation refused. That is not a valid web address." };
  }
  const verdict = checkUrlAllowed(url);
  return verdict.allowed ? { kind: "url", url } : { kind: "refused", reason: verdict.reason };
}

/** Synchronous checks that do not need DNS. */
export function checkUrlAllowed(url: URL): { allowed: true } | { allowed: false; reason: string } {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, reason: "Only http and https URLs are allowed." };
  }
  if (url.username || url.password) {
    return { allowed: false, reason: "URLs with embedded credentials are not allowed." };
  }
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port)) {
    return { allowed: false, reason: "Only standard web ports are allowed." };
  }
  const host = normalizeHostname(url.hostname);
  if (!host) return { allowed: false, reason: "That address has no host." };
  if (isBlockedHostname(host)) {
    return { allowed: false, reason: "Private and internal hosts are not reachable." };
  }
  if (isIP(host) && isNonPublicAddress(host)) {
    return { allowed: false, reason: "Private and internal addresses are not reachable." };
  }
  return { allowed: true };
}

export function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

export function isBlockedHostname(host: string): boolean {
  const normalized = normalizeHostname(host);
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;
  // Single-label names resolve through search domains inside private networks.
  if (!normalized.includes(".") && !isIP(normalized)) return true;
  return false;
}

function ipv4ToNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

const IPV4_BLOCKS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function inIpv4Block(value: number, base: string, bits: number): boolean {
  const start = ipv4ToNumber(base);
  if (start === null) return false;
  const size = 2 ** (32 - bits);
  return value >= start && value < start + size;
}

function isNonPublicIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  if (value === null) return true;
  return IPV4_BLOCKS.some(([base, bits]) => inIpv4Block(value, base, bits));
}

function expandIpv6(address: string): number[] | null {
  let value = address.toLowerCase();
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);
  let tail: number[] = [];
  const lastColon = value.lastIndexOf(":");
  const maybeIpv4 = value.slice(lastColon + 1);
  if (maybeIpv4.includes(".")) {
    const v4 = ipv4ToNumber(maybeIpv4);
    if (v4 === null) return null;
    tail = [Math.floor(v4 / 65536), v4 % 65536];
    value = `${value.slice(0, lastColon + 1)}0:0`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(":").map((h) => parseInt(h, 16)) : []);
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill(0), ...rest];
  if (groups.length !== 8 || groups.some((g) => !Number.isFinite(g) || g < 0 || g > 0xffff)) {
    return null;
  }
  if (tail.length) {
    groups[6] = tail[0];
    groups[7] = tail[1];
  }
  return groups;
}

function isNonPublicIpv6(address: string): boolean {
  const groups = expandIpv6(address);
  if (!groups) return true;
  const allZero = groups.every((g) => g === 0);
  if (allZero) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms inherit IPv4 rules.
  if (groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    const v4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return isNonPublicIpv4(v4);
  }
  // NAT64 well-known prefix embeds IPv4.
  if (groups[0] === 0x64 && groups[1] === 0xff9b) {
    // RFC 8215 reserves 64:ff9b:1::/48 for local-use translation. It can
    // route to private IPv4 destinations, so never let a hosted browser use it.
    if (groups[2] === 0x0001) return true;
    const v4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return isNonPublicIpv4(v4);
  }
  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (first === 0x2001 && groups[1] === 0x0db8) return true; // documentation
  if (first === 0x2001 && groups[1] < 0x0200) return true; // 2001::/23 IETF special purpose
  if (first === 0x2002) return true; // 6to4 can embed private IPv4
  return false;
}

/** True for any address the cloud computer must never contact. */
export function isNonPublicAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);
  if (family === 4) return isNonPublicIpv4(normalized);
  if (family === 6) return isNonPublicIpv6(normalized);
  return true;
}

/** Remove credentials and query/fragment noise before a URL reaches logs or the activity feed. */
export function displayUrl(raw: string, maxLength = 160): string {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    const value = url.toString();
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
  } catch {
    return "";
  }
}

/** A public, non-credential link that is safe to show as task evidence. */
export function publicEvidenceUrl(raw: string): { url: string; exact: boolean } | null {
  try {
    const parsed = new URL(raw);
    if (!checkUrlAllowed(parsed).allowed) return null;
    // Nested percent-encoding must not hide auth or token path segments from
    // the evidence filter. Refuse paths that remain encoded after the cap.
    let decodedPath = parsed.pathname;
    for (let pass = 0; pass < 4; pass++) {
      const next = decodeURIComponent(decodedPath);
      if (next === decodedPath) break;
      decodedPath = next;
    }
    if (/%[0-9a-f]{2}/i.test(decodedPath)) return null;
    const segments = decodedPath.split("/").filter(Boolean);
    if (
      segments.some(
        (segment) =>
          /(^|[-_])(auth|oauth|callback|login|log-in|signin|sign-in|signup|sign-up|register|verify|verification|magic|token|reset|password|invite|invitation|confirm)([-_]|$)/i.test(
            segment,
          ) ||
          (segment.length >= 20 &&
            /^[A-Za-z0-9_-]+$/.test(segment) &&
            /[A-Za-z]/.test(segment) &&
            /\d/.test(segment)) ||
          /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(segment),
      )
    )
      return null;
    const exact = !parsed.search && !parsed.hash;
    parsed.search = "";
    parsed.hash = "";
    const url = parsed.toString();
    return url.length <= 500 ? { url, exact } : null;
  } catch {
    return null;
  }
}

/** Browser state sent to the model needs site identity, never bearer material in a URL. */
export function modelBrowserUrl(raw: string): string {
  try {
    const url = new URL(raw);
    // Page title and screen provide context without a path, query, or fragment.
    return url.protocol === "http:" || url.protocol === "https:" ? `${url.origin}/` : "about:blank";
  } catch {
    return "about:blank";
  }
}
