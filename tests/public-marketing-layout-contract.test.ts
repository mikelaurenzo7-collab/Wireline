import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public marketing layout contract", () => {
  it("keeps every shared marketing hero centered and unsplit", () => {
    const hero = read("src/components/marketing/MarketingHero.tsx");

    expect(hero).toContain('"marketing-hero border-b border-border px-5 text-center');
    expect(hero).toContain('className="wl-public-rail mx-auto"');
    expect(hero).toContain("items-center justify-center");
    expect(hero).not.toContain("lg:grid-cols-[");
    expect(hero).not.toContain("<aside");
    expect(hero).not.toContain("visual ??");
    expect(hero).not.toContain('aria-label="Wireline operating preview"');
  });

  it("keeps the landing story concise and centered", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");

    expect(landing).toContain('className="mx-auto max-w-3xl text-center"');
    expect(landing).toContain('className="wl-paper mx-auto mt-8 max-w-[58rem]');
    expect(landing).toContain("Every included employee gets a number");
    expect(landing).not.toContain("visualEyebrow=");
    expect(landing).not.toContain("Every included agent gets an included number.");
  });

  it("centers supporting landing headings and functional hero previews", () => {
    const roi = read("src/components/marketing/RoiCalculator.tsx");
    const trust = read("src/components/marketing/TrustSignals.tsx");
    const showcase = read("src/pages/Showcase.tsx");
    const solutions = read("src/pages/SolutionsPage.tsx");

    expect(roi).toContain("items-center justify-center gap-2 text-center");
    expect(trust).toContain("items-center justify-center gap-2 text-center");
    expect(showcase).toContain("max-w-3xl flex-col justify-between text-center");
    expect(solutions).toContain('className="mx-auto max-w-2xl text-center"');
  });
});
