import { describe, expect, it } from "vitest";

import {
  emailDisplayName,
  normalizeIdentifier,
  normalizePersonEmail,
  normalizePersonPhone,
  phoneDigitCandidates,
  phoneTail,
} from "../src/lib/people/identifiers";

describe("People phone normalization", () => {
  it.each([
    ["(312) 555-0101", "+13125550101"],
    ["312.555.0101", "+13125550101"],
    ["1 312 555 0101", "+13125550101"],
    ["+1 (312) 555-0101", "+13125550101"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("normalizes %s to %s", (raw, expected) => {
    expect(normalizePersonPhone(raw)).toBe(expected);
  });

  it("keeps an explicit country code exact instead of reading ten digits as North American", () => {
    // +55 is Brazil; the same digits without the + are a US number.
    expect(normalizePersonPhone("+55 51 9876 5432")).toBe("+555198765432");
    expect(normalizePersonPhone("+5551234567")).toBe("+5551234567");
    expect(normalizePersonPhone("5551234567")).toBe("+15551234567");
  });

  it.each([
    "",
    "   ",
    "call me",
    "555-0101",
    "+0 312 555 0101",
    "312-555-0101 ext 4",
    "+1234",
    null,
    42,
  ])("refuses %s", (raw) => {
    expect(normalizePersonPhone(raw)).toBeNull();
  });

  it("matches stored numbers with or without the North American 1, and other countries exactly", () => {
    expect(phoneDigitCandidates("+13125550101")).toEqual(["13125550101", "3125550101"]);
    expect(phoneDigitCandidates("+442079460958")).toEqual(["442079460958"]);
    expect(phoneTail("+442079460958")).toBe("2079460958");
  });
});

describe("People email normalization", () => {
  it.each([
    ["Sam@Example.com", "sam@example.com"],
    ["  sam@example.com  ", "sam@example.com"],
    ["Sam Ortiz <SAM@example.com>", "sam@example.com"],
    ['"Ortiz, Sam" <sam@example.com>', "sam@example.com"],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizePersonEmail(raw)).toBe(expected);
  });

  it.each([
    "sam",
    "sam@",
    "sam@example",
    "a@b.com, c@d.com",
    "a@b.com; c@d.com",
    "x@y.com <sam@example.com>",
    "Sam <sam@example.com",
    "<>",
  ])("refuses %s", (raw) => {
    expect(normalizePersonEmail(raw)).toBeNull();
  });

  it("reads a display name from a header without inventing one", () => {
    expect(emailDisplayName("Jo Ng <jo@example.com>")).toBe("Jo Ng");
    expect(emailDisplayName('"Jo Ng" <jo@example.com>')).toBe("Jo Ng");
    expect(emailDisplayName("jo@example.com")).toBeNull();
  });

  it("dispatches by kind and rejects unknown kinds", () => {
    expect(normalizeIdentifier("phone", "3125550101")).toEqual({
      kind: "phone",
      value: "+13125550101",
    });
    expect(normalizeIdentifier("email", "A@B.co")).toEqual({ kind: "email", value: "a@b.co" });
    expect(normalizeIdentifier("fax", "3125550101")).toBeNull();
  });
});
