import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Stripe merchant-brand assets", () => {
  it("ships FINAL BotBound billing art from the letterpress glyph and wordmark", () => {
    const renderer = read("scripts/render-image-assets.mjs");
    const logo = read("public/botbound-stripe-logo.svg");
    expect(renderer).toContain('copyOut("public/brand/botbound-stripe-logo.png"');
    expect(renderer).toContain('copyOut("public/brand/botbound-stripe-icon.png"');
    expect(renderer).toContain("BotBound");
    expect(renderer).not.toContain('out: "public/wireline-stripe-logo.png"');
    expect(renderer).toContain("ios/Wireline/Assets.xcassets/AppIcon.appiconset/icon.png");
    expect(logo).toContain("BotBound");
    expect(logo).toContain(">Bot</tspan>");
    expect(logo).toContain(">Bound</tspan>");
    expect(logo).toContain("#A78BFA");
    expect(logo).not.toContain("Wireline");
  });

  it("does not keep Wireline-named Stripe or icon compatibility twins", () => {
    for (const twin of [
      "public/wireline-icon.svg",
      "public/wireline-stripe-logo.png",
      "public/wireline-stripe-logo.svg",
      "public/wireline-stripe-logo.jpg",
      "public/wireline-stripe-icon.png",
      "public/wireline-stripe-icon.jpg",
    ]) {
      expect(existsSync(resolve(root, twin)), twin).toBe(false);
    }
  });
});
