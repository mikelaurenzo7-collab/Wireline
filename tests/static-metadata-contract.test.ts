import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("static marketing metadata", () => {
  it("keeps the HTML shell aligned with the voice-first Bot promise", () => {
    const index = read("index.html");

    expect(index).toContain("WIRELINE | VOICE BOTS THAT GET THE WORK DONE");
    expect(index).toContain("Build a voice-first Bot");
    expect(index).toContain("answers and makes calls");
    expect(index).toContain("text and email");
    expect(index).toContain("one workspace");
    expect(index).toContain('"slogan": "BOTS THAT GET THE WORK DONE"');
    expect(index).not.toContain("—");
    expect(index).not.toContain("Your AI Voice Employee Calls, Texts &amp; Emails");
    expect(index).not.toContain("Voice AI employee for real conversations.");
    expect(index).not.toContain("AI phone employees that turn calls into sales.");
    expect(index).not.toContain("solo business agents");
    expect(index).not.toContain("Your phone, finally answering for you.");
    expect(index).not.toContain("Voice agents that get the work done");
  });

  it("keeps install, icon, analytics, and WebSite identity assets in the HTML shell", () => {
    const index = read("index.html");

    expect(index).toContain('<link rel="preconnect" href="https://plausible.io" crossorigin />');
    // Prefer the SVG favicon on modern browsers; keep PNG as a fallback.
    expect(index).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(index).toContain('<link rel="icon" type="image/png" href="/favicon.png" />');
    expect(index).toContain('<link rel="mask-icon" href="/favicon.svg" color="#7C3AED" />');
    expect(index).toContain(
      '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
    );
    expect(index).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(index).toContain('"@type": "WebSite"');
    expect(index).toContain('"@id": "https://trywireline.com/#website"');
    expect(index).toContain('"publisher": { "@id": "https://trywireline.com/#organization" }');
  });

  it("keeps the runtime hero readable and metadata aligned", () => {
    const hero = read("src/components/marketing/MarketingHero.tsx");
    const landing = read("src/pages/LandingPage.tsx");

    expect(hero).toContain("title === MARKETING_VOICE.headline");
    expect(hero).toContain("const isHomeHero");
    expect(hero).toMatch(
      /aria-label=\{[\s\S]*?isHomeHero && typeof title === "string" \? title : undefined[\s\S]*?\}/,
    );
    expect(hero).toContain("text-[clamp(2.2rem,3.9vw,3.6rem)]");
    expect(hero).toContain("max-w-[19ch]");
    expect(hero).not.toContain("uppercase leading");
    expect(landing).toContain('title="WIRELINE | VOICE BOTS THAT GET THE WORK DONE"');
    expect(landing).toContain("MARKETING_VOICE.subline");
    expect(landing).not.toContain('title="Wireline —');
  });

  it("keeps the OG image aligned with voice, conversation, channels, and one workspace", () => {
    const ogImage = read("public/og-image.svg");

    expect(ogImage).toContain("VOICE-FIRST / CALLS / LIVE CONVERSATIONS / TEXT / EMAIL");
    expect(ogImage).toContain("BOTS THAT GET");
    expect(ogImage).toContain("THE WORK DONE");
    expect(ogImage).toContain("Answer and make calls. Continue by text and email.");
    expect(ogImage).toContain("ONE WORKSPACE / TRYWIRELINE.COM");
    expect(ogImage).not.toContain("Voice agents that");
    expect(ogImage).not.toContain("AI VOICE AGENTS");
    expect(ogImage).not.toContain("YOUR NEXT AI EMPLOYEE");
    expect(ogImage).not.toContain("·");
  });

  it("keeps every element of the OG image legible after preview downscale", () => {
    // The card is authored at 1200x630 and consumed at roughly 500px wide, so
    // it arrives at about 40%. Keep every authored text size at 14px or above.
    const ogImage = read("public/og-image.svg");
    const sizes = [...ogImage.matchAll(/font-size="([\d.]+)"/g)].map((match) => Number(match[1]));

    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
    // One two-line headline should dominate rather than compete with a second.
    expect(sizes.filter((size) => size >= 60)).toHaveLength(2);
  });

  it("keeps the installable web app manifest aligned with one-workspace Bots", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      description: string;
      start_url: string;
      shortcuts: Array<{ name: string; url: string }>;
    };

    expect(manifest.name).toBe("WIRELINE | VOICE BOTS THAT GET THE WORK DONE");
    expect(manifest.description).toContain("voice-first Bot");
    expect(manifest.description).toContain("answers and makes calls");
    expect(manifest.description).toContain("text and email");
    expect(manifest.description).toContain("one workspace");
    expect(manifest.description).not.toContain("included numbers");
    expect(manifest.description).not.toContain("—");
    expect(manifest.start_url).toBe("/overview");
    expect(manifest.shortcuts.map((shortcut) => shortcut.name)).toEqual([
      "BOT STUDIO",
      "INBOX",
      "KNOWLEDGE",
    ]);
    expect(manifest.shortcuts.some((shortcut) => shortcut.url === "/agents")).toBe(false);
  });
});
