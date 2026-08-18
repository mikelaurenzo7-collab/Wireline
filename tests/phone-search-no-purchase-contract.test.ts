import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("phone search does not buy a number", () => {
  it("lists Twilio inventory without calling provision", () => {
    const native = read("src/routes/native-phone-routing-routes.ts");
    const search = native.slice(
      native.indexOf('"/api/phone-numbers/search"'),
      native.indexOf("async function respondWithProvision"),
    );
    expect(search).toContain("listNativeAvailableLocalNumbers");
    expect(search).not.toContain("provisionNativeTenantNumber");
    expect(search).not.toContain("incomingPhoneNumbers.create");
    expect(read("src/lib/voice/native-phone-carrier.ts")).toContain(
      "client.availablePhoneNumbers(\"US\").local.list",
    );
  });

  it("only treats a resolved plan's zero slots as zero", () => {
    const entitlements = read("src/lib/phone-line-entitlements.ts");
    expect(entitlements).toContain("if (tier) return slots;");
    expect(entitlements).toContain("return 1;");
    expect(entitlements.indexOf("if (tier) return slots;")).toBeLessThan(
      entitlements.indexOf("return 1;"),
    );
  });

  it("does not copy a Vapi-only E.164 onto Twilio SMS identity", () => {
    const lines = read("src/lib/agent-phone-lines.ts");
    expect(lines).toContain("opts.smsCapable && opts.phoneNumberE164");
    const provisioning = read("src/lib/phone-provisioning.ts");
    expect(provisioning).toContain("smsCapable: Boolean(twilioPurchased)");
  });

  it("lets the customer pick a previewed E.164 before purchase", () => {
    const picker = read("src/components/PhoneNumberPicker.tsx");
    expect(picker).toContain('authFetch("/api/phone-numbers/search"');
    expect(picker).toContain("previewNumbers.has(phoneNumber)");
    expect(picker).toContain('authFetch("/api/phone-numbers/provision"');
    expect(read("src/lib/api-validation-base.ts")).toContain(
      'regex(/^\\+1\\d{10}$/, "phone_number must be a US E.164 number")',
    );
    expect(read("src/components/PhoneSetupPanel.tsx")).toContain("Add another number");
  });
});
