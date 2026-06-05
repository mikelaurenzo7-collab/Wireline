import { afterEach, describe, expect, it } from "vitest";
import {
  extractFromDomain,
  formatResendApiError,
  normalizeResendFromAddress,
  resolveResendFromAddress,
} from "./resend-config";

describe("resend-config", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("defaults to noreply@trywireline.com when unset", () => {
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_FROM_DOMAIN;
    expect(resolveResendFromAddress()).toBe("Wireline <noreply@trywireline.com>");
  });

  it("wraps bare email in RESEND_FROM_EMAIL", () => {
    process.env.RESEND_FROM_EMAIL = "hello@verified.com";
    expect(resolveResendFromAddress()).toBe("Wireline <hello@verified.com>");
  });

  it("builds from RESEND_FROM_DOMAIN", () => {
    delete process.env.RESEND_FROM_EMAIL;
    process.env.RESEND_FROM_DOMAIN = "mail.verified.com";
    expect(resolveResendFromAddress()).toBe("Wireline <noreply@mail.verified.com>");
  });

  it("prefers RESEND_FROM_EMAIL over RESEND_FROM_DOMAIN", () => {
    process.env.RESEND_FROM_EMAIL = "Wireline <custom@verified.com>";
    process.env.RESEND_FROM_DOMAIN = "other.com";
    expect(resolveResendFromAddress()).toBe("Wireline <custom@verified.com>");
  });

  it("extractFromDomain parses angle-bracket form", () => {
    expect(extractFromDomain("Wireline <noreply@trywireline.com>")).toBe("trywireline.com");
  });

  it("formatResendApiError surfaces domain verification hint on 403", () => {
    const msg = formatResendApiError(
      403,
      JSON.stringify({ message: "The domain is not verified" }),
    );
    expect(msg).toMatch(/verified/i);
    expect(msg).toMatch(/RESEND_FROM/i);
  });

  it("normalizeResendFromAddress leaves full header intact", () => {
    expect(normalizeResendFromAddress("Sarah <sarah@wireline.com>")).toBe(
      "Sarah <sarah@wireline.com>",
    );
  });
});
