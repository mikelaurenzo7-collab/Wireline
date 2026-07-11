import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("static marketing metadata", () => {
  it("keeps the HTML shell aligned with the multichannel AI employee promise", () => {
    const index = read("index.html");

    expect(index).toContain("Your next AI employee calls, texts &amp; emails");
    expect(index).toContain("One trained AI employee handles customer conversations");
    expect(index).toContain("voice, SMS, and email");
    expect(index).toContain("follows up, books the next step, and logs every outcome");
    expect(index).toContain('"slogan": "Wire → Work → Win"');
    expect(index).not.toContain("Voice AI employee for real conversations.");
    expect(index).not.toContain("AI phone employees that turn calls into sales.");
    expect(index).not.toContain("solo business agents");
    expect(index).not.toContain("Your phone, finally answering for you.");
  });

  it("keeps the runtime hero readable and metadata-aligned", () => {
    const hero = read("src/components/marketing/MarketingHero.tsx");
    const landing = read("src/pages/LandingPage.tsx");

    expect(hero).toContain("title === MARKETING_VOICE.headline");
    expect(hero).toContain("const isHomeHero");
    expect(hero).toContain(
      'aria-label={isHomeHero && typeof title === "string" ? title : undefined}',
    );
    expect(hero).toContain("text-[clamp(2.45rem,5.5vw,4.65rem)]");
    expect(landing).toContain('title="Wireline — Your next AI employee calls, texts & emails"');
    expect(landing).toContain("MARKETING_VOICE.subline");
    expect(landing).not.toContain('title="Wireline — Wire → Work → Win"');
  });

  it("keeps the OG image aligned with one employee across three channels", () => {
    const ogImage = read("public/og-image.svg");

    expect(ogImage).toContain("YOUR NEXT AI EMPLOYEE");
    expect(ogImage).toContain("CALLS · TEXTS · EMAILS");
    expect(ogImage).toContain("One trained employee. One shared memory.");
    expect(ogImage).toContain("VOICE · SMS · EMAIL · OUTCOMES · CONTROL");
    expect(ogImage).not.toContain("VOICE AI EMPLOYEE");
  });

  it("keeps the installable web app manifest aligned with the public story", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      description: string;
    };

    expect(manifest.name).toBe("Wireline - AI employees");
    expect(manifest.description).toContain("AI employees");
    expect(manifest.description).toContain("included numbers");
    expect(manifest.description).toContain("book appointments");
    expect(manifest.description).toContain("every result");
  });
});
