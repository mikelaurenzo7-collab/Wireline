import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("canonical BotBound public prestige certification", () => {
  it("pins one acquisition entrance and one design-system vocabulary", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const product = read("src/lib/bot-product.ts");
    const designVision = read("src/lib/wireline-design-vision.ts");
    const botMark = read("src/components/BotMark.tsx");
    const landingCss = read("src/styles/landing-prestige.css");

    expect(product).toContain('name: "BotBound"');
    expect(product).toContain('slogan: "Voice Bots. Business Numbers."');
    expect(product).toContain('supportingLine: "VOICE BOTS · BUSINESS NUMBERS"');
    expect(landing).toContain("BOT_MARKETING_VOICE.activationLine");
    expect(landing).not.toContain("HERO_CHANNEL_ORDER");
    expect(landing).toContain("<PrecisionPublicHeader />");
    expect(landing).toContain("Voice Bots.");
    expect(landing).toContain("Business Numbers.");
    expect(landing).not.toContain("<AuthAccessPanel embedded");
    expect(landing).not.toContain("template.category");
    expect(landing).not.toContain("ONE WORKSPACE");

    expect(botMark).not.toContain("monogram");
    expect(botMark).toContain("MOTIF_ICONS");

    expect(landingCss).toMatch(
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__hero\s*\{[\s\S]*?display:\s*grid/,
    );
    expect(landingCss).not.toMatch(
      /\.landing-prestige__hero,[\s\S]*?\.landing-prestige__desktop-only\s*\{[\s\S]*?display:\s*none/,
    );

    expect(designVision).toContain("BotBound Design System");
    expect(designVision).not.toMatch(/Aurora Letterpress|Obsidian Design System/i);
  });
});
