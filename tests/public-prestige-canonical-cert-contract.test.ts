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
    expect(product).toContain('slogan: "For You. For Your Business."');
    expect(product).toContain('supportingLine: "CALL · TEXT · EMAIL"');
    expect(landing).not.toContain("landing-prestige__promise");
    expect(landing).not.toContain("HERO_CHANNEL_ORDER");
    expect(landing).not.toContain("<AuthAccessPanel");
    expect(landing).toContain('to={signupHrefForPlan("personal")}');
    expect(landing).not.toContain("template.category");
    expect(landing).not.toContain("ONE WORKSPACE");

    expect(botMark).not.toContain("monogram");
    expect(botMark).toContain("MOTIF_ICONS");

    expect(landingCss).toMatch(
      /\.landing-prestige__hero\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*text-align:\s*center;/,
    );
    expect(landingCss).toMatch(
      /@media \(max-width: 820px\)[\s\S]*?\.landing-prestige__hero\s*\{[\s\S]*?min-height:\s*auto/,
    );
    expect(landingCss).not.toMatch(/\.landing-prestige__(?:auth|entrance|desktop-only)\b/);

    expect(designVision).toContain("BotBound Design System");
    expect(designVision).not.toMatch(/Aurora Letterpress|Obsidian Design System/i);
  });
});
