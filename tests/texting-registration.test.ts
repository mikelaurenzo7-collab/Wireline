import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  carrierCodeLabel,
  textingRegistrationReceivedCopy,
} from "../src/components/settings/TextingRegistrationForm";
import { validateSoleProprietorDetails } from "../src/lib/carrier-registration";
import { browserPreferenceEnvelope } from "../src/lib/server-owned-preferences";
import {
  editableTextingRegistration,
  normalizeTextingRegistrationInput,
  normalizeUsPhone,
  openTextingRegistration,
  readStoredTextingRegistration,
  sealTextingRegistration,
  TEXTING_REGISTRATION_OPTIONS,
  validateTextingRegistration,
} from "../src/lib/texting-registration-details";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const businessBody = {
  flow: "business",
  details: {
    legalName: "  Ridge Inspections   LLC ",
    brandName: "Ridge Inspections",
    businessType: "Limited Liability Corporation",
    industry: "PROFESSIONAL_SERVICES",
    ein: "12-3456789",
    websiteUrl: "ridge.example",
    privacyUrl: "https://ridge.example/privacy",
    termsUrl: "ridge.example/terms",
    address: { street: "1 Main St", city: "Springfield", region: "il", postalCode: "62701" },
    representative: {
      firstName: "Pat",
      lastName: "Lee",
      email: "PAT@Ridge.example",
      phone: "(312) 555-0100",
      businessTitle: "Owner",
      jobPosition: "CEO",
    },
  },
};

const soleBody = {
  flow: "sole_proprietor",
  details: {
    brandName: "Pat Lee Appraisals",
    firstName: "Pat",
    lastName: "Lee",
    email: "pat@example.com",
    mobilePhone: "312-555-0101",
    vertical: "REAL_ESTATE",
    address: { street: "1 Main St", city: "Springfield", region: "IL", postalCode: "62701" },
  },
};

describe("texting registration details", () => {
  const previousKey = process.env.WIRELINE_DATA_KEY;
  beforeAll(() => {
    process.env.WIRELINE_DATA_KEY = randomBytes(32).toString("base64");
  });
  afterAll(() => {
    if (previousKey === undefined) delete process.env.WIRELINE_DATA_KEY;
    else process.env.WIRELINE_DATA_KEY = previousKey;
  });

  it("normalizes what an owner types into the carrier's shape", () => {
    expect(normalizeUsPhone("(312) 555-0100")).toBe("+13125550100");
    expect(normalizeUsPhone("1 312 555 0100")).toBe("+13125550100");
    const input = normalizeTextingRegistrationInput(businessBody);
    if (input.flow !== "business") throw new Error("expected business");
    expect(input.details.legalName).toBe("Ridge Inspections LLC");
    expect(input.details.ein).toBe("123456789");
    expect(input.details.websiteUrl).toBe("https://ridge.example");
    expect(input.details.termsUrl).toBe("https://ridge.example/terms");
    expect(input.details.address.region).toBe("IL");
    expect(input.details.representative.email).toBe("pat@ridge.example");
    expect(input.details.representative.phone).toBe("+13125550100");
    expect(validateTextingRegistration(input)).toEqual([]);
  });

  it("lists every problem at once and refuses a BotBound line as a personal phone", () => {
    const input = normalizeTextingRegistrationInput({ flow: "business", details: {} });
    expect(validateTextingRegistration(input).length).toBeGreaterThan(5);

    const sole = normalizeTextingRegistrationInput(soleBody);
    expect(validateTextingRegistration(sole)).toEqual([]);
    expect(validateTextingRegistration(sole, { blockedNumbers: ["+13125550101"] })).toEqual([
      "Use your own cell phone for the carrier confirmation text, not a BotBound line.",
    ]);
    const business = normalizeTextingRegistrationInput(businessBody);
    expect(validateTextingRegistration(business, { blockedNumbers: ["+13125550100"] })).toContain(
      "Use the representative's own phone, not a BotBound line.",
    );
  });

  it("checks a sole proprietor against Twilio's own vertical list, not the brand industries", () => {
    const details = normalizeTextingRegistrationInput(soleBody).details as Parameters<
      typeof validateSoleProprietorDetails
    >[0];
    expect(
      validateSoleProprietorDetails({ ...details, vertical: "PROFESSIONAL_SERVICES" as never }),
    ).toContain("Choose the kind of work you do.");
    expect(TEXTING_REGISTRATION_OPTIONS.businessTypes).not.toContain("Sole Proprietorship");
    expect(TEXTING_REGISTRATION_OPTIONS.verticals).not.toContain("POLITICAL");
  });

  it("seals the details so only the last four EIN digits are readable in storage", () => {
    const input = normalizeTextingRegistrationInput(businessBody);
    const stored = sealTextingRegistration(input, null, new Date("2026-11-22T12:00:00Z"));
    const raw = JSON.stringify(stored);
    expect(raw).not.toContain("123456789");
    expect(raw).not.toContain("3125550100");
    expect(raw).not.toContain("pat@ridge.example");
    expect(stored.summary).toEqual({
      brandName: "Ridge Inspections",
      businessName: "Ridge Inspections LLC",
      contactName: "Pat Lee",
      einLastFour: "6789",
      city: "Springfield",
      region: "IL",
    });

    const reread = readStoredTextingRegistration({ texting_registration: stored });
    expect(reread).not.toBeNull();
    expect(openTextingRegistration(reread!)).toEqual(input);
    // The owner can edit everything except the EIN, which never goes back to the browser.
    expect(editableTextingRegistration(input).ein).toBe("");

    const edited = sealTextingRegistration(input, stored, new Date("2026-11-23T12:00:00Z"));
    expect(edited.submittedAt).toBe("2026-11-22T12:00:00.000Z");
    expect(edited.updatedAt).toBe("2026-11-23T12:00:00.000Z");
    expect(readStoredTextingRegistration({ texting_registration: { version: 2 } })).toBeNull();
  });

  it("never sends the sealed details to the browser through the preferences API", () => {
    expect(
      browserPreferenceEnvelope({
        texting_registration: { sealed: "v1.x" },
        company_identity: { website: "https://a.example" },
        missed_call_text_back: { enabled: true },
      }),
    ).toEqual({
      company_identity: { website: "https://a.example" },
      missed_call_text_back: { enabled: true },
    });
    expect(read("src/routes/settings-routes.ts")).toContain(
      "preferences: browserPreferenceEnvelope(data?.preferences)",
    );
    expect(read("src/routes/user-preference-guard-routes.ts")).toContain(
      "preferences: browserPreferenceEnvelope(data?.preferences)",
    );
  });

  it("saves only through its own route, which fails closed, locks, audits and never contacts a carrier", () => {
    const route = read("src/routes/texting-registration-routes.ts");
    const registry = read("src/server/register-api-routes.ts");
    expect(registry).toContain("app.use(textingRegistrationRouter)");
    expect(route).toContain("if (!isVaultConfigured())");
    expect(route).toContain("SECURE_STORAGE_UNAVAILABLE");
    expect(route).toContain("await lockPreferenceEnvelope(tx, userId);");
    expect(route).toContain('action: "texting_registration.details_saved"');
    expect(route).toContain('action: "texting_registration.details_removed"');
    expect(route).toContain("TEXTING_REGISTRATION_INVALID");
    // Text prefixes must match the registered brand; only an existing settings row is updated.
    expect(route).toContain(".update(schema.settings)");
    expect(route).not.toContain(".insert(schema.settings)");
    // The response never carries the sealed blob or the EIN.
    expect(route).not.toMatch(/sealed:\s/);
    expect(route).not.toMatch(/from "\.\.\/lib\/twilio|executeRegistration\(/);
  });

  it("explains labels and next steps in plain words", () => {
    expect(carrierCodeLabel("PROFESSIONAL_SERVICES")).toBe("Professional services");
    expect(textingRegistrationReceivedCopy("business")).toContain("covers the registration fees");
    expect(textingRegistrationReceivedCopy("sole_proprietor")).toContain(
      "reply YES within 24 hours",
    );
  });

  it("lets the founder CLI register a workspace straight from its saved details", () => {
    const cli = read("scripts/register-customer-texting.mts");
    expect(cli).toContain('else if (arg === "--workspace") flags.workspace = next();');
    expect(cli).toContain("readStoredTextingRegistration(preferences.rows[0]?.preferences)");
    expect(cli).toContain("openTextingRegistration(stored)");
    expect(cli).toContain("is not one of this workspace's lines");
  });
});
