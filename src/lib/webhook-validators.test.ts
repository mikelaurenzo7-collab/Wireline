import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isPrivateIp,
  isPrivateIpv6,
  isSsrfUrl,
  validateWebhookUrl,
  hostnameResolvesToPrivate,
} from "./webhook-validators";

// ---------------------------------------------------------------------------
// isPrivateIp
// ---------------------------------------------------------------------------
describe("isPrivateIp", () => {
  it.each([
    "127.0.0.1", "127.255.255.255",
    "10.0.0.1", "10.255.255.255",
    "172.16.0.1", "172.31.255.255",
    "192.168.0.1", "192.168.255.255",
    "169.254.0.1", "169.254.169.254",
    "0.0.0.0",
    // 100.64.0.0/10 — Carrier-grade NAT (RFC 6598). Covers 100.64–100.127.
    "100.64.0.1", "100.65.0.0", "100.99.255.255", "100.110.0.1", "100.127.255.255",
    // 198.18.0.0/15 — Benchmarking (RFC 2544). Covers 198.18–198.19.
    "198.18.0.1", "198.18.255.255", "198.19.0.0", "198.19.255.255",
    // RFC 5737 documentation ranges.
    "192.0.2.1", "192.0.2.255",      // TEST-NET-1
    "198.51.100.1", "198.51.100.255", // TEST-NET-2
    "203.0.113.1", "203.0.113.255",   // TEST-NET-3
  ])("blocks %s", (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each([
    "1.1.1.1", "8.8.8.8", "172.15.0.1", "172.32.0.1", "192.169.0.1",
    // Just outside the CGN range — must be allowed.
    "100.63.255.255", "100.128.0.0",
    // Just outside the benchmarking range — must be allowed.
    "198.17.255.255", "198.20.0.0",
  ])("allows %s", (ip) => expect(isPrivateIp(ip)).toBe(false));
});

// ---------------------------------------------------------------------------
// isPrivateIpv6
// ---------------------------------------------------------------------------
describe("isPrivateIpv6", () => {
  it.each([
    "::1", "::",
    "fe80::1", "fe90::1", "fea0::1", "feb0::1", "febf::1",
    "fc00::1", "fd00::1", "fd12::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1",
  ])("blocks %s", (ip) => expect(isPrivateIpv6(ip)).toBe(true));

  it.each([
    "2001:db8::1", "2606:4700::1", "fe00::1", "fec0::1",
  ])("allows %s", (ip) => expect(isPrivateIpv6(ip)).toBe(false));
});

// ---------------------------------------------------------------------------
// isSsrfUrl
// ---------------------------------------------------------------------------
describe("isSsrfUrl", () => {
  it.each([
    "http://127.0.0.1/",
    "http://localhost/",
    "http://0.0.0.0/",
    "http://10.0.0.1/",
    "http://172.20.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1/",
    "http://100.127.255.255/",
    // Benchmarking / documentation ranges.
    "http://198.18.0.1/",
    "http://198.19.255.255/",
    "http://192.0.2.1/",
    "http://198.51.100.1/",
    "http://203.0.113.1/",
    "http://[::1]/",
    "http://[::]/",
    "http://[fe80::1]/",
    "http://[fe90::1]/",
    "http://[fc00::1]/",
    "http://[fd12::1]/",
    "http://[::ffff:127.0.0.1]/",
    "not-a-url",
  ])("blocks %s", (url) => expect(isSsrfUrl(url)).toBe(true));

  it.each([
    "https://example.com/webhook",
    "https://hooks.slack.com/services/abc",
    "http://1.1.1.1/",
    // Domains that happen to start with IPv6-prefix-like characters must not
    // be flagged — they're not IPv6 literals (no colon).
    "https://fd-prod.example.com/",
    "https://fc-cdn.example.com/",
    "https://feb-promo.example.com/",
    "https://fe80-marketing.example.com/",
    // Domains that happen to start with IPv4-prefix-like labels must not be
    // flagged — they're not IPv4 literals.
    "https://10.example.com/",
    "https://192.168.example.com/",
    "https://127.example.com/",
    "https://172.16.example.com/",
    "https://169.254.example.com/",
    "https://100.64.example.com/",
  ])("allows %s", (url) => expect(isSsrfUrl(url)).toBe(false));
});

// ---------------------------------------------------------------------------
// validateWebhookUrl (mocked DNS)
// ---------------------------------------------------------------------------
const mockLookup = vi.fn();

vi.mock("node:dns/promises", () => ({ lookup: mockLookup }));

beforeEach(() => mockLookup.mockReset());

describe("validateWebhookUrl — scheme checks", () => {
  it("rejects non-http(s) schemes", async () => {
    expect(await validateWebhookUrl("ftp://example.com")).toMatch(/http/);
    expect(await validateWebhookUrl("file:///etc/passwd")).toMatch(/http/);
  });

  it("rejects unparseable URLs", async () => {
    expect(await validateWebhookUrl("not a url")).toBe("Invalid URL.");
  });
});

describe("validateWebhookUrl — IPv4 literals", () => {
  it.each([
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/",
    "http://0.0.0.0/",
  ])("blocks %s", async (url) => {
    expect(await validateWebhookUrl(url)).toMatch(/private/);
  });
});

describe("validateWebhookUrl — IPv6 literals", () => {
  it.each([
    "http://[::1]/",
    "http://[::]/",
    "http://[fe80::1]/",
    "http://[fe90::1]/",      // fe80::/10 — within link-local range
    "http://[fc00::1]/",
    "http://[fd12::1]/",
    "http://[::ffff:127.0.0.1]/",
  ])("blocks %s", async (url) => {
    expect(await validateWebhookUrl(url)).toMatch(/private/);
  });

  it("allows a public IPv6 literal", async () => {
    expect(await validateWebhookUrl("https://[2001:db8::1]/")).toBeNull();
  });
});

describe("validateWebhookUrl — DNS checks for domain names", () => {
  it("blocks a domain whose A record resolves to a private IP", async () => {
    mockLookup.mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    expect(await validateWebhookUrl("https://evil.example.com/")).toMatch(/private/);
  });

  it("blocks a domain with a mixed public+private A RRset", async () => {
    mockLookup.mockResolvedValueOnce([
      { address: "1.2.3.4", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    expect(await validateWebhookUrl("https://mixed.example.com/")).toMatch(/private/);
  });

  it("blocks a domain whose AAAA record resolves to ::1", async () => {
    mockLookup.mockResolvedValueOnce([{ address: "::1", family: 6 }]);
    expect(await validateWebhookUrl("https://ipv6only.example.com/")).toMatch(/private/);
  });

  it("allows a domain whose addresses are all public", async () => {
    mockLookup.mockResolvedValueOnce([
      { address: "1.2.3.4", family: 4 },
      { address: "2001:db8::1", family: 6 },
    ]);
    expect(await validateWebhookUrl("https://public.example.com/")).toBeNull();
  });

  it("allows a domain when DNS lookup fails (conservative fail-open)", async () => {
    mockLookup.mockRejectedValueOnce(new Error("SERVFAIL"));
    expect(await validateWebhookUrl("https://dns-fail.example.com/")).toBeNull();
  });

  it("does not flag domains that begin with IPv6 prefix-like characters", async () => {
    // fd-prod.example.com isn't an IPv6 literal (no colon) — it must be resolved.
    mockLookup.mockResolvedValueOnce([{ address: "1.2.3.4", family: 4 }]);
    expect(await validateWebhookUrl("https://fd-prod.example.com/")).toBeNull();

    mockLookup.mockResolvedValueOnce([{ address: "1.2.3.4", family: 4 }]);
    expect(await validateWebhookUrl("https://feb-promo.example.com/")).toBeNull();
  });

  it("does not flag domains that begin with IPv4-prefix-like labels", async () => {
    // 10.example.com isn't an IPv4 literal — must be resolved, not pattern-rejected.
    mockLookup.mockResolvedValueOnce([{ address: "1.2.3.4", family: 4 }]);
    expect(await validateWebhookUrl("https://10.example.com/")).toBeNull();

    mockLookup.mockResolvedValueOnce([{ address: "1.2.3.4", family: 4 }]);
    expect(await validateWebhookUrl("https://192.168.example.com/")).toBeNull();
  });

  it("blocks literal benchmarking and documentation IPs", async () => {
    expect(await validateWebhookUrl("http://198.18.0.1/")).toMatch(/private/);
    expect(await validateWebhookUrl("http://192.0.2.1/")).toMatch(/private/);
    expect(await validateWebhookUrl("http://198.51.100.1/")).toMatch(/private/);
    expect(await validateWebhookUrl("http://203.0.113.1/")).toMatch(/private/);
  });

  it("blocks a domain whose A record resolves to a benchmarking IP", async () => {
    mockLookup.mockResolvedValueOnce([{ address: "198.18.0.1", family: 4 }]);
    expect(await validateWebhookUrl("https://bench.example.com/")).toMatch(/private/);
  });
});

// ---------------------------------------------------------------------------
// hostnameResolvesToPrivate
// ---------------------------------------------------------------------------
describe("hostnameResolvesToPrivate", () => {
  it("returns true when domain resolves to a private IPv4", async () => {
    mockLookup.mockResolvedValueOnce([{ address: "192.168.1.1", family: 4 }]);
    expect(await hostnameResolvesToPrivate("https://evil.example.com/")).toBe(true);
  });

  it("returns true when domain resolves to a private IPv6", async () => {
    mockLookup.mockResolvedValueOnce([{ address: "fd00::1", family: 6 }]);
    expect(await hostnameResolvesToPrivate("https://evil6.example.com/")).toBe(true);
  });

  it("returns false for IP literals (handled by isSsrfUrl)", async () => {
    expect(await hostnameResolvesToPrivate("http://127.0.0.1/")).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("returns false on DNS failure (conservative fail-open)", async () => {
    mockLookup.mockRejectedValueOnce(new Error("NXDOMAIN"));
    expect(await hostnameResolvesToPrivate("https://nxdomain.example.com/")).toBe(false);
  });
});
