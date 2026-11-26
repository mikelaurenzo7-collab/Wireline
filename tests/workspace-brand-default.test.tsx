import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WorkspaceBrandEditor from "../src/components/settings/WorkspaceBrandEditor";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function render(brandName: string, businessName?: string) {
  return renderToStaticMarkup(
    <WorkspaceBrandEditor
      settings={{ brand_name: brandName, brand_logo_url: "", primary_color: "#7c3aed" }}
      businessName={businessName}
      onUpdate={() => {}}
      onSave={() => {}}
    />,
  );
}

describe("the brand name before an owner sets one", () => {
  it("previews the business name and leaves the field empty to save", () => {
    const markup = render("", "Harbor Dental");
    // The input holds nothing, so Save cannot store a name the owner did not type.
    expect(markup).toMatch(/<input[^>]*type="text"[^>]*placeholder="Harbor Dental"[^>]*value=""/);
    expect(markup).toContain(">Harbor Dental</span>");
    expect(markup).toContain(">H</span>");
    expect(markup).not.toContain("BotBound");
  });

  it("uses a neutral name when the profile has no business name either", () => {
    const markup = render("   ");
    expect(markup).toContain('placeholder="Your name or business"');
    expect(markup).toContain(">Your Business</span>");
    expect(markup).not.toContain("BotBound");
  });

  it("shows the saved brand name once there is one", () => {
    const markup = render("Harbor Smiles", "Harbor Dental");
    expect(markup).toContain(">Harbor Smiles</span>");
    expect(markup).not.toContain(">Harbor Dental</span>");
  });

  it("never seeds the platform name into an account, and trims what it saves", () => {
    const context = read("src/contexts/BrandingContext.tsx");
    expect(context).toMatch(
      /const DEFAULT_BRANDING: BrandingSettings = \{[\s\S]{0,260}brand_name: "",/,
    );
    expect(context).not.toContain('brand_name: "BotBound"');
    const settings = read("src/components/settings/WorkspaceBrandingSettings.tsx");
    expect(settings).toContain("brand_name: form.brand_name.trim()");
    expect(settings).toContain("businessName={branding.business_name}");
    expect(settings).toContain("body: JSON.stringify(draft)");
  });
});
