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
    const botMarkCss = read("src/styles/bot-mark.css");
    const landingCss = read("src/styles/landing-prestige.css");

    expect(product).toContain('name: "BotBound"');
    expect(product).toContain('slogan: "PUT YOUR BOT ON THE LINE"');
    expect(product).toContain('supportingLine: "CALL · TEXT · EMAIL"');
    expect(landing).toContain('const HERO_CHANNEL_ORDER = ["voice", "text", "email"] as const;');
    expect(landing).toContain("BOT_CHANNELS.find((candidate) => candidate.key === key)");
    expect(landing).toContain('<AuthAccessPanel embedded initialMode="signin" />');
    expect(landing).not.toContain("template.category");
    expect(landing).not.toContain("ONE WORKSPACE");

    expect(botMark).not.toContain("monogram");
    expect(botMarkCss).toContain("wl-bot-mark-flow");
    expect(botMarkCss).toContain("prefers-reduced-motion: reduce");

    expect(landingCss).toMatch(
      /@media \(max-width: 820px\)[\s\S]*\.landing-prestige__hero,[\s\S]*\.landing-prestige__desktop-only[\s\S]*display:\s*none/,
    );
    expect(landingCss).toMatch(
      /@media \(max-width: 820px\)[\s\S]*\.landing-prestige__auth[\s\S]*min-height:\s*100dvh/,
    );

    expect(designVision).toContain("BotBound Design System");
    expect(designVision).not.toMatch(/Aurora Letterpress|Obsidian Design System/i);
  });
});
