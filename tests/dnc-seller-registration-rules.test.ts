import { describe, expect, it } from "vitest";
import {
  dncSellerRegistrationState,
  evaluateDncSellerRegistration,
  parseAreaCodes,
  parseDncSellerRegistrationInput,
  readStoredDncSellerRegistration,
  usAreaCode,
  type DncSellerRegistration,
} from "../src/lib/dnc-seller-registration-rules";

const NOW = new Date("2026-10-18T15:00:00Z");

const registration = (overrides: Partial<DncSellerRegistration> = {}): DncSellerRegistration => ({
  san: "ABC123456",
  seller_name: "Acme Plumbing LLC",
  area_codes: ["312", "773"],
  expires_on: "2027-10-01",
  attested_at: "2026-10-18T15:00:00.000Z",
  attested_by: "owner",
  vendor_project_id: "proj-acme",
  vendor_linked_at: "2026-10-18T16:00:00.000Z",
  ...overrides,
});

describe("seller DNC registration input", () => {
  const valid = {
    san: " abc123456 ",
    seller_name: "Acme Plumbing LLC",
    area_codes: "312, 773 312",
    expires_on: "2027-10-01",
    attest: true,
  };

  it("normalizes a valid submission", () => {
    expect(parseDncSellerRegistrationInput(valid, NOW)).toEqual({
      ok: true,
      value: {
        san: "ABC123456",
        seller_name: "Acme Plumbing LLC",
        area_codes: ["312", "773"],
        expires_on: "2027-10-01",
      },
    });
  });

  it("accepts the nationwide list", () => {
    const parsed = parseDncSellerRegistrationInput({ ...valid, area_codes: "All" }, NOW);
    expect(parsed.ok && parsed.value.area_codes).toBe("all");
  });

  it.each([
    [{ san: "12" }, "subscription account number"],
    [{ seller_name: "" }, "legal business name"],
    [{ area_codes: "312, 112" }, "area codes"],
    [{ area_codes: [] }, "area codes"],
    [{ expires_on: "2027-02-30" }, "expiration date"],
    [{ expires_on: "2026-10-17" }, "already expired"],
    [{ expires_on: "2028-06-01" }, "12 months"],
    [{ attest: "yes" }, "authorize BotBound"],
  ])("rejects %j", (patch, message) => {
    const parsed = parseDncSellerRegistrationInput({ ...valid, ...patch }, NOW);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain(message);
  });

  it("never takes a vendor link from the owner", () => {
    const parsed = parseDncSellerRegistrationInput(
      { ...valid, vendor_project_id: "proj-forged" } as never,
      NOW,
    );
    expect(parsed.ok && parsed.value).not.toHaveProperty("vendor_project_id");
  });
});

describe("seller DNC registration state and gate", () => {
  it("reports each lifecycle state", () => {
    expect(dncSellerRegistrationState(null, NOW)).toBe("missing");
    expect(dncSellerRegistrationState(registration({ vendor_project_id: null }), NOW)).toBe(
      "pending_link",
    );
    expect(dncSellerRegistrationState(registration({ expires_on: "2026-10-17" }), NOW)).toBe(
      "expired",
    );
    expect(dncSellerRegistrationState(registration(), NOW)).toBe("active");
  });

  it("allows a covered area code with the seller's vendor project", () => {
    expect(evaluateDncSellerRegistration(registration(), "+1 (312) 555-1234", NOW)).toEqual({
      allowed: true,
      vendorProjectId: "proj-acme",
    });
    expect(
      evaluateDncSellerRegistration(registration({ area_codes: "all" }), "+14155551234", NOW),
    ).toMatchObject({ allowed: true });
  });

  it.each([
    [null, "+13125551234", "SELLER_DNC_REGISTRATION_REQUIRED"],
    [registration({ vendor_project_id: null }), "+13125551234", "SELLER_DNC_REGISTRATION_PENDING"],
    [registration({ expires_on: "2026-10-17" }), "+13125551234", "SELLER_DNC_REGISTRATION_EXPIRED"],
    [registration(), "+14155551234", "SELLER_DNC_AREA_CODE_NOT_COVERED"],
    [registration({ area_codes: "all" }), "+442071234567", "SELLER_DNC_AREA_CODE_NOT_COVERED"],
  ])("fails closed: %#", (stored, phone, code) => {
    expect(evaluateDncSellerRegistration(stored, phone, NOW)).toMatchObject({
      allowed: false,
      code,
    });
  });

  it("treats malformed stored data as missing", () => {
    expect(readStoredDncSellerRegistration(null)).toBeNull();
    expect(readStoredDncSellerRegistration({ san: "ABC123456" })).toBeNull();
    expect(readStoredDncSellerRegistration({ ...registration(), area_codes: ["12"] })).toBeNull();
    expect(
      readStoredDncSellerRegistration({ ...registration(), vendor_project_id: "bad id!" }),
    ).toMatchObject({ vendor_project_id: null });
  });

  it("parses area codes and US numbers", () => {
    expect(parseAreaCodes(["773", "312", "312"])).toEqual(["312", "773"]);
    expect(parseAreaCodes("012")).toBeNull();
    expect(usAreaCode("3125551234")).toBe("312");
    expect(usAreaCode("+1 212 555 1234")).toBe("212");
    expect(usAreaCode("+44 20 7123 4567")).toBeNull();
  });
});
