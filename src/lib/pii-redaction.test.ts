import { describe, it, expect } from "vitest";
import { redactPII, hasPII, luhnValid } from "./pii-redaction";

describe("luhnValid", () => {
  it("accepts a known-valid test card", () => {
    // Stripe / generic 4242-4242-4242-4242
    expect(luhnValid("4242424242424242")).toBe(true);
  });

  it("rejects a random 16-digit string", () => {
    expect(luhnValid("1234567812345678")).toBe(false);
  });

  it("ignores separators", () => {
    expect(luhnValid("4242 4242 4242 4242")).toBe(true);
    expect(luhnValid("4242-4242-4242-4242")).toBe(true);
  });

  it("rejects strings outside 13–19 digit range", () => {
    expect(luhnValid("123456789012")).toBe(false);    // 12
    expect(luhnValid("12345678901234567890")).toBe(false); // 20
  });
});

describe("redactPII", () => {
  it("redacts emails", () => {
    const { text, counts } = redactPII("Contact alice@example.com or bob+tag@sub.foo.io please.");
    expect(text).toBe("Contact [REDACTED:email] or [REDACTED:email] please.");
    expect(counts.email).toBe(2);
  });

  it("redacts US SSNs", () => {
    const { text, counts } = redactPII("My SSN is 123-45-6789, ok?");
    expect(text).toBe("My SSN is [REDACTED:ssn], ok?");
    expect(counts.ssn).toBe(1);
  });

  it("does not redact obviously-invalid SSN prefixes", () => {
    const { counts } = redactPII("000-12-3456 or 666-12-3456 or 999-12-3456");
    expect(counts.ssn).toBe(0);
  });

  it("redacts a Luhn-valid credit card", () => {
    const { text, counts } = redactPII("Card: 4242-4242-4242-4242 expires 12/30");
    expect(text).toContain("[REDACTED:credit_card]");
    expect(counts.credit_card).toBe(1);
  });

  it("does NOT redact a non-Luhn 16-digit string as a card", () => {
    const { counts } = redactPII("Order number 1234567890123456 was shipped.");
    expect(counts.credit_card).toBe(0);
  });

  it("redacts phone numbers in multiple formats", () => {
    const inputs = [
      "Call me at +1 (415) 555-0123 tomorrow.",
      "Phone: 415-555-0123",
      "Reach me on +442071234567",
    ];
    for (const input of inputs) {
      const { counts } = redactPII(input, { categories: ["phone"] });
      expect(counts.phone).toBeGreaterThanOrEqual(1);
    }
  });

  it("redacts API key shapes", () => {
    const text =
      "Token sk-ant-1234567890abcdef1234567890abcdef and key sk_test_abcdef1234567890";
    const { counts } = redactPII(text);
    expect(counts.api_key).toBeGreaterThanOrEqual(1);
  });

  it("redacts IPv4 addresses", () => {
    const { text, counts } = redactPII("Source IP 192.168.1.42 hit the API");
    expect(text).toContain("[REDACTED:ipv4]");
    expect(counts.ipv4).toBe(1);
  });

  it("respects the categories opt-in list", () => {
    const input = "Reach alice@x.com at 415-555-0123.";
    const { text, counts } = redactPII(input, { categories: ["email"] });
    expect(text).toContain("[REDACTED:email]");
    expect(text).toContain("415-555-0123");
    expect(counts.email).toBe(1);
    expect(counts.phone).toBe(0);
  });

  it("supports a custom formatter", () => {
    const input = "Email alice@x.com";
    const { text } = redactPII(input, {
      formatter: (_m, cat) => `<${cat.toUpperCase()}>`,
    });
    expect(text).toBe("Email <EMAIL>");
  });

  it("is a no-op on empty / missing input", () => {
    expect(redactPII("").text).toBe("");
    expect(redactPII(undefined as unknown as string).text).toBe("");
  });
});

describe("hasPII", () => {
  it("returns true when the text contains any matching PII", () => {
    expect(hasPII("contact alice@example.com")).toBe(true);
    expect(hasPII("call 415-555-0123")).toBe(true);
  });

  it("returns false on PII-free text", () => {
    expect(hasPII("This is a perfectly mundane sentence with no PII.")).toBe(false);
  });

  it("respects the categories filter", () => {
    expect(hasPII("alice@example.com", ["phone"])).toBe(false);
    expect(hasPII("alice@example.com", ["email"])).toBe(true);
  });
});
