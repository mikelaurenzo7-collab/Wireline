import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("static marketing metadata", () => {
  it("keeps the HTML shell aligned with the inclusive AI voice-agent promise", () => {
    const index = read("index.html");

    expect(index).toContain("AI Voice Agents for Personal &amp; Business");
    expect(index).toContain("personal tasks and business conversations");
    expect(index).toContain("follow-through across voice, SMS, and email");
    expect(index).toContain('"slogan": "Wire → Work → Win"');
    expect(index).not.toContain("Your AI Voice Employee Calls, Texts &amp; Emails");
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
    expect(hero).toContain("text-[clamp(2.45rem,5.2vw,4.85rem)]");
    expect(hero).toContain("max-w-[24ch]");
    expect(hero).not.toContain("tracking-[-.012em] sm:whitespace-nowrap");
    expect(landing).toContain('title="Wireline — AI Voice Agents for Personal & Business"');
    expect(landing).toContain("MARKETING_VOICE.subline");
    expect(landing).not.toContain(
      'title="Wireline — Your AI Voice Employee Calls, Texts & Emails"',
    );
    expect(landing).not.toContain('title="Wireline — Wire → Work → Win"');
  });

  it("keeps the OG image aligned with voice, channels, number, and outcomes", () => {
    const ogImage = read("public/og-image.svg");

    expect(ogImage).toContain("AI VOICE AGENTS");
    expect(ogImage).toContain("PERSONAL · BUSINESS");
    expect(ogImage).toContain("PAID PLAN NUMBER INCLUDED");
    expect(ogImage).toContain("One agent or a coordinated team.");
    expect(ogImage).toContain("Conversation handled. Work completed.");
    expect(ogImage).toContain("VOICE · SMS · EMAIL · PERSONAL · BUSINESS · OUTCOMES · CONTROL");
    expect(ogImage).not.toContain("YOUR NEXT AI EMPLOYEE");
  });

  it("keeps the installable web app manifest aligned with the public story", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      description: string;
    };

    expect(manifest.name).toBe("Wireline - AI Voice Agents");
    expect(manifest.description).toContain("one AI voice agent");
    expect(manifest.description).toContain("personal tasks and business conversations");
    expect(manifest.description).toContain("follow-through across voice, SMS, and email");
    expect(manifest.description).toContain("coordinated team");
    expect(manifest.description).not.toContain("included numbers");
  });
});
