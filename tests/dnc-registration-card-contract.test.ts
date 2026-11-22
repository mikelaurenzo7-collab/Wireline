import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const card = readFileSync(resolve(process.cwd(), "src/components/DncRegistrationCard.tsx"), "utf8");
const compliance = readFileSync(
  resolve(process.cwd(), "src/components/ComplianceCenter.tsx"),
  "utf8",
);

describe("DNC registration card", () => {
  it("opens the seller's registration form from Compliance", () => {
    expect(compliance).toMatch(/<summary[^>]*>\s*Do Not Call Registry\s*<\/summary>/);
    expect(compliance).toContain("<DncRegistrationCard />");
    expect(card).toContain('"/api/compliance/dnc-registration"');
  });

  it("copies the owner's chosen codes for the FTC order", () => {
    expect(card).toContain('navigator.clipboard.writeText(chosenCodes.join(", "))');
    expect(card).toContain("disabled={!chosenCodes.length}");
    expect(card).toContain("aria-pressed={selected}");
    expect(card).toContain("onClick={() => toggleAreaCode(code)}");
    expect(card).toContain('setAreaCodes(next.join(", "))');
  });

  it("sends only the seller's FTC IDs and authorization for validation", () => {
    expect(card).toContain("JSON.stringify({ ftc_org_id: orgId, san, attest })");
  });
});
