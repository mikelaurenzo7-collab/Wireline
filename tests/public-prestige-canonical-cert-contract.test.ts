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
    expect(product).toContain('slogan: "Your next hire is a bot."');
    expect(product).toContain('supportingLine: "CALL · TEXT · EMAIL · COMPUTER"');
    expect(landing).not.toContain("landing-prestige__promise");
    expect(landing).not.toContain("HERO_CHANNEL_ORDER");
    expect(landing).not.toContain("<AuthAccessPanel");
    expect(landing).toContain('signedIn ? "/studio" : "/signup"');
    expect(landing).not.toContain("to={signupHrefForPlan(id)}");
    expect(landing).not.toContain("template.category");
    expect(landing).not.toContain("ONE WORKSPACE");

    expect(botMark).not.toContain("monogram");
    expect(botMark).toContain("MOTIF_ICONS");

    expect(landingCss).toMatch(
      /\.landing-prestige__hero\s*\{[^}]*place-items:\s*center;[^}]*text-align:\s*center;/,
    );
    expect(read("src/styles/landing-prestige.css")).toContain("flex-wrap: wrap;");
    expect(landingCss).not.toMatch(/\.landing-prestige__(?:auth|entrance|desktop-only)\b/);

    expect(designVision).toContain("BotBound Design System");
    expect(designVision).not.toMatch(/Aurora Letterpress|Obsidian Design System/i);
  });
});
