import { createHash } from "node:crypto";
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
    expect(renderer).toMatch(/>Your Bot for Calls, Texts, and Email<\/text>/i);
    expect(renderer).toContain('out: "public/botbound-stripe-logo.png"');
    expect(renderer).toContain('out: "public/botbound-stripe-icon.png"');
    expect(renderer).toContain("letterpress violet phone glyph");
    expect(renderer).toContain('out: "public/wireline-stripe-logo.png"');
    expect(renderer).toContain('out: "ios/Wireline/Assets.xcassets/AppIcon.appiconset/icon.png"');
  });

  it("keeps legacy Wireline asset paths as compatibility aliases during external dashboard cutover", () => {
    const icon = readFileSync(resolve(root, "public/wireline-icon.svg"), "utf8");
    expect(icon).toContain("BotBound");
    expect(icon).toContain("Compatibility asset path");
  });

  it("keeps frozen JPEG compatibility URLs on current BotBound artwork", () => {
    const aliases = new Map([
      [
        "public/wireline-stripe-logo.jpg",
        "4303b062b29759a130b6d45af5b106b985f7ad73ab8ce088c9f5d46f7af80023",
      ],
      [
        "public/wireline-stripe-icon.jpg",
        "e59849e72c08cd9d1382cd079c258fa97488a128095e38db85f42d174a26f43a",
      ],
    ]);

    for (const [path, expectedHash] of aliases) {
      const hash = createHash("sha256")
        .update(readFileSync(resolve(root, path)))
        .digest("hex");
      expect(hash).toBe(expectedHash);
    }
  });
});
