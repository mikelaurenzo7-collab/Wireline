import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isPrivateIp,
  isPrivateIpv6,
  isSsrfUrl,
  assertUrlSafeForServerFetch,
  resolveWebhookDeliveryHostname,
  validateWebhookUrl,
} from "./webhook-validators";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup } from "node:dns/promises";

describe("webhook-validators — SSRF guard", () => {
  describe("isPrivateIp", () => {
    it("blocks loopback 127.0.0.1", () => {
      expect(isPrivateIp("127.0.0.1")).toBe(true);
    });

    it("blocks loopback 127.x.x.x range", () => {
      expect(isPrivateIp("127.255.255.255")).toBe(true);
    });

    it("blocks 10.x.x.x (RFC 1918)", () => {
      expect(isPrivateIp("10.0.0.1")).toBe(true);
      expect(isPrivateIp("10.255.255.255")).toBe(true);
    });

    it("blocks 172.16-31.x.x (RFC 1918)", () => {
      expect(isPrivateIp("172.16.0.1")).toBe(true);
      expect(isPrivateIp("172.31.255.255")).toBe(true);
    });

    it("does NOT block 172.32.x.x", () => {
      expect(isPrivateIp("172.32.0.1")).toBe(false);
    });

    it("blocks 192.168.x.x (RFC 1918)", () => {
      expect(isPrivateIp("192.168.0.1")).toBe(true);
      expect(isPrivateIp("192.168.255.255")).toBe(true);
    });

    it("blocks link-local 169.254.x.x", () => {
      expect(isPrivateIp("169.254.1.1")).toBe(true);
    });

    it("blocks CGN range 100.64-127.x.x (RFC 6598)", () => {
      expect(isPrivateIp("100.64.0.1")).toBe(true);
      expect(isPrivateIp("100.127.255.255")).toBe(true);
    });

    it("does NOT block 100.128.0.1 (outside CGN)", () => {
      expect(isPrivateIp("100.128.0.1")).toBe(false);
    });

    it("blocks benchmarking 198.18-19.x.x (RFC 2544)", () => {
      expect(isPrivateIp("198.18.0.1")).toBe(true);
      expect(isPrivateIp("198.19.255.255")).toBe(true);
    });

    it("blocks TEST-NET-1 192.0.2.x (RFC 5737)", () => {
      expect(isPrivateIp("192.0.2.1")).toBe(true);
    });

    it("blocks TEST-NET-2 198.51.100.x (RFC 5737)", () => {
      expect(isPrivateIp("198.51.100.1")).toBe(true);
    });

    it("blocks TEST-NET-3 203.0.113.x (RFC 5737)", () => {
      expect(isPrivateIp("203.0.113.1")).toBe(true);
    });

    it("blocks 0.0.0.0", () => {
      expect(isPrivateIp("0.0.0.0")).toBe(true);
    });

    it("allows public IPs", () => {
      expect(isPrivateIp("8.8.8.8")).toBe(false);
      expect(isPrivateIp("1.1.1.1")).toBe(false);
      expect(isPrivateIp("203.0.114.1")).toBe(false);
    });
  });

  describe("isPrivateIpv6", () => {
    it("blocks ::1 (loopback)", () => {
      expect(isPrivateIpv6("::1")).toBe(true);
    });

    it("blocks :: (unspecified)", () => {
      expect(isPrivateIpv6("::")).toBe(true);
    });

    it("blocks fe80:: (link-local)", () => {
      expect(isPrivateIpv6("fe80::1")).toBe(true);
    });

    it("blocks fc00::/fd00:: (ULA)", () => {
      expect(isPrivateIpv6("fc00::1")).toBe(true);
      expect(isPrivateIpv6("fd12:3456::1")).toBe(true);
    });

    it("blocks ::ffff: (IPv4-mapped)", () => {
      expect(isPrivateIpv6("::ffff:127.0.0.1")).toBe(true);
    });

    it("allows public IPv6", () => {
      expect(isPrivateIpv6("2001:db8::1")).toBe(false);
      expect(isPrivateIpv6("2607:f8b0:4004:800::200e")).toBe(false);
    });
  });

  describe("isSsrfUrl", () => {
    it("blocks localhost URLs", () => {
      expect(isSsrfUrl("http://localhost/webhook")).toBe(true);
      expect(isSsrfUrl("http://localhost:3000/hook")).toBe(true);
    });

    it("blocks private IPv4 URLs", () => {
      expect(isSsrfUrl("http://10.0.0.1/webhook")).toBe(true);
      expect(isSsrfUrl("http://192.168.1.1:8080/hook")).toBe(true);
      expect(isSsrfUrl("http://172.16.0.1/hook")).toBe(true);
    });

    it("blocks private IPv6 URLs", () => {
      expect(isSsrfUrl("http://[::1]/webhook")).toBe(true);
      expect(isSsrfUrl("http://[fe80::1]/hook")).toBe(true);
    });

    it("allows public URLs", () => {
      expect(isSsrfUrl("https://example.com/webhook")).toBe(false);
      expect(isSsrfUrl("https://hooks.zapier.com/hooks/catch/123")).toBe(false);
      expect(isSsrfUrl("https://api.customer-crm.io/wireline-events")).toBe(false);
    });

    it("blocks URLs with no valid parse", () => {
      expect(isSsrfUrl("not-a-url")).toBe(true);
      expect(isSsrfUrl("")).toBe(true);
    });

    it("does NOT flag domains that start with private-looking strings", () => {
      // Regression: "10.example.com" is a valid public domain
      expect(isSsrfUrl("https://10.example.com/webhook")).toBe(false);
      // "192.168.example.com" is a valid public domain
      expect(isSsrfUrl("https://192.168.example.com/webhook")).toBe(false);
    });

    it("does NOT flag domains that start with IPv6-prefix-like strings", () => {
      // "fd-prod.example.com" should NOT be flagged as ULA
      expect(isSsrfUrl("https://fd-prod.example.com/hook")).toBe(false);
      // "feb-promo.example.com" should NOT be flagged as link-local
      expect(isSsrfUrl("https://feb-promo.example.com/hook")).toBe(false);
    });
  });

  describe("resolveWebhookDeliveryHostname (DNS fail-closed)", () => {
    beforeEach(() => {
      vi.mocked(lookup).mockReset();
    });

    it("returns dns_error when lookup throws", async () => {
      vi.mocked(lookup).mockRejectedValue(new Error("ENOTFOUND"));
      await expect(resolveWebhookDeliveryHostname("https://example.com/hook")).resolves.toEqual({
        status: "dns_error",
      });
    });

    it("returns private when resolved A record is RFC1918", async () => {
      vi.mocked(lookup).mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
      await expect(
        resolveWebhookDeliveryHostname("https://customer.example/hook"),
      ).resolves.toEqual({
        status: "private",
      });
    });

    it("returns public for safe DNS answers", async () => {
      vi.mocked(lookup).mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
      await expect(
        resolveWebhookDeliveryHostname("https://hooks.zapier.com/hooks/catch/1"),
      ).resolves.toEqual({ status: "public" });
    });
  });

  describe("assertUrlSafeForServerFetch", () => {
    beforeEach(() => {
      vi.mocked(lookup).mockReset();
    });

    it("rejects literal private hosts synchronously", async () => {
      await expect(assertUrlSafeForServerFetch("http://127.0.0.1/admin")).resolves.toMatch(
        /private or internal/,
      );
    });

    it("rejects hostnames that resolve to private IPs", async () => {
      vi.mocked(lookup).mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
      await expect(assertUrlSafeForServerFetch("https://metadata.attacker.com/")).resolves.toMatch(
        /resolves to a private/,
      );
    });

    it("returns null for public hostnames", async () => {
      vi.mocked(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
      await expect(assertUrlSafeForServerFetch("https://example.com/page")).resolves.toBeNull();
    });
  });

  describe("validateWebhookUrl (registration-time DNS)", () => {
    beforeEach(() => {
      vi.mocked(lookup).mockReset();
    });

    it("rejects when DNS lookup fails", async () => {
      vi.mocked(lookup).mockRejectedValue(new Error("SERVFAIL"));
      await expect(validateWebhookUrl("https://example.com/hook")).resolves.toBe(
        "Could not resolve webhook hostname.",
      );
    });

    it("accepts public hostnames that resolve cleanly", async () => {
      vi.mocked(lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
      await expect(validateWebhookUrl("https://example.com/hook")).resolves.toBeNull();
    });
  });
});
