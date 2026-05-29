import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  normalizeEmail,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  buildListUnsubscribeHeaders,
  buildComplianceFooterText,
  buildComplianceFooterHtml,
  getPostalAddress,
  unsubscribeUrl,
} from "./email-compliance";

describe("email-compliance", () => {
  describe("normalizeEmail", () => {
    it("lowercases and trims", () => {
      expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com");
    });
  });

  describe("unsubscribe token round-trip", () => {
    it("signs and verifies a token, recovering the normalized email", () => {
      const token = signUnsubscribeToken("Jane@Example.com");
      expect(verifyUnsubscribeToken(token)).toBe("jane@example.com");
    });

    it("is deterministic for the same email", () => {
      expect(signUnsubscribeToken("a@b.com")).toBe(signUnsubscribeToken("A@B.com"));
    });

    it("rejects a tampered payload", () => {
      const token = signUnsubscribeToken("jane@example.com");
      const [, sig] = token.split(".");
      const forgedPayload = Buffer.from("attacker@evil.com", "utf8").toString("base64url");
      expect(verifyUnsubscribeToken(`${forgedPayload}.${sig}`)).toBeNull();
    });

    it("rejects a tampered signature", () => {
      const token = signUnsubscribeToken("jane@example.com");
      const [payload] = token.split(".");
      expect(verifyUnsubscribeToken(`${payload}.deadbeef`)).toBeNull();
    });

    it("rejects malformed / empty tokens without throwing", () => {
      expect(verifyUnsubscribeToken("")).toBeNull();
      expect(verifyUnsubscribeToken(null)).toBeNull();
      expect(verifyUnsubscribeToken(undefined)).toBeNull();
      expect(verifyUnsubscribeToken("no-dot")).toBeNull();
      expect(verifyUnsubscribeToken(".onlysig")).toBeNull();
    });
  });

  describe("List-Unsubscribe headers", () => {
    it("includes a one-click HTTPS URL, a mailto fallback, and the POST signal", () => {
      const headers = buildListUnsubscribeHeaders("jane@example.com");
      expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      expect(headers["List-Unsubscribe"]).toContain("/api/email/unsubscribe?token=");
      expect(headers["List-Unsubscribe"]).toContain("<mailto:");
      // RFC 8058: the HTTPS URI must be angle-bracketed.
      expect(headers["List-Unsubscribe"]).toMatch(/^<https?:\/\//);
    });

    it("embeds a token that verifies back to the recipient", () => {
      const headers = buildListUnsubscribeHeaders("jane@example.com");
      const m = headers["List-Unsubscribe"].match(/token=([^>,\s]+)/);
      expect(m).toBeTruthy();
      const token = decodeURIComponent(m![1]);
      expect(verifyUnsubscribeToken(token)).toBe("jane@example.com");
    });
  });

  describe("compliance footers", () => {
    const ENV = process.env.WIRELINE_POSTAL_ADDRESS;
    beforeEach(() => {
      process.env.WIRELINE_POSTAL_ADDRESS = "Wireline, Inc., 123 Test St, SF, CA 94114";
    });
    afterEach(() => {
      if (ENV === undefined) delete process.env.WIRELINE_POSTAL_ADDRESS;
      else process.env.WIRELINE_POSTAL_ADDRESS = ENV;
    });

    it("text footer includes the unsubscribe URL and the postal address", () => {
      const footer = buildComplianceFooterText("jane@example.com");
      expect(footer).toContain("/api/email/unsubscribe?token=");
      expect(footer).toContain("123 Test St");
      expect(footer).toContain("jane@example.com");
    });

    it("html footer includes an unsubscribe link and the postal address", () => {
      const footer = buildComplianceFooterHtml("jane@example.com");
      expect(footer).toContain("Unsubscribe");
      expect(footer).toContain("123 Test St");
      expect(footer).toContain(unsubscribeUrl("jane@example.com").replace(/&/g, "&amp;"));
    });

    it("omits the postal line when WIRELINE_POSTAL_ADDRESS is unset", () => {
      delete process.env.WIRELINE_POSTAL_ADDRESS;
      expect(getPostalAddress()).toBeNull();
      const footer = buildComplianceFooterText("jane@example.com");
      expect(footer).not.toContain("123 Test St");
      // The unsubscribe link must still be present even without an address.
      expect(footer).toContain("/api/email/unsubscribe?token=");
    });
  });
});
