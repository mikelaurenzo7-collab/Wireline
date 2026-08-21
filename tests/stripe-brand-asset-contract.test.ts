import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Stripe merchant-brand assets", () => {
  it("generates BotBound billing art from the same canonical phone-Bot icon", () => {
    const renderer = readFileSync(resolve(root, "scripts/render-image-assets.mjs"), "utf8");
    expect(renderer).toContain('readFileSync(resolve(root, "public/brand/botbound-app-icon.png"))');
    expect(renderer).toContain("const stripeLogoSource = writeStripeLogoSource(appIcon)");
    expect(renderer).toContain("BotBound");
    expect(renderer).toContain("AI EMPLOYEES FOR CALLS, TEXTS, AND EMAIL");
    expect(renderer).toContain('out: "public/botbound-stripe-logo.png"');
    expect(renderer).toContain('out: "public/wireline-stripe-logo.png"');
    expect(renderer).toContain('out: "ios/Wireline/Assets.xcassets/AppIcon.appiconset/icon.png"');
  });

  it("keeps legacy Wireline asset paths as compatibility aliases during external dashboard cutover", () => {
    const icon = readFileSync(resolve(root, "public/wireline-icon.svg"), "utf8");
    expect(icon).toContain("BotBound");
    expect(icon).toContain("Compatibility asset path");
  });
});
