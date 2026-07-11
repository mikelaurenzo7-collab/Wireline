import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("static marketing metadata", () => {
  it("keeps the HTML shell aligned with the AI voice employee promise", () => {
    const index = read("index.html");

    expect(index).toContain("Your AI Voice Employee Calls, Texts &amp; Emails");
    expect(index).toContain("Every paid plan includes a Wireline number at no extra line fee");
    expect(index).toContain("answer, sell, support, book, follow up, update your systems");
    expect(index).toContain("log every outcome across every customer conversation");
    expect(index).toContain('"slogan": "Wire → Work → Win"');
    expect(index).not.toContain("Your next AI employee calls, texts &amp; emails");
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
    expect(landing).toContain('title="Wireline — Your AI Voice Employee Calls, Texts & Emails"');
    expect(landing).toContain("MARKETING_VOICE.subline");
    expect(landing).not.toContain('title="Wireline — Your next AI employee calls, texts & emails"');
    expect(landing).not.toContain('title="Wireline — Wire → Work → Win"');
  });

  it("keeps the OG image aligned with voice, channels, number, and outcomes", () => {
    const ogImage = read("public/og-image.svg");

    expect(ogImage).toContain("YOUR AI VOICE EMPLOYEE");
    expect(ogImage).toContain("CALLS · TEXTS · EMAILS");
    expect(ogImage).toContain("PAID PLAN NUMBER INCLUDED");
    expect(ogImage).toContain("One trained employee. One shared memory.");
    expect(ogImage).toContain("Conversation handled. Work completed.");
    expect(ogImage).toContain("VOICE · SMS · EMAIL · NUMBER INCLUDED · OUTCOMES · CONTROL");
    expect(ogImage).not.toContain("FREE NUMBER");
    expect(ogImage).not.toContain("YOUR NEXT AI EMPLOYEE");
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
