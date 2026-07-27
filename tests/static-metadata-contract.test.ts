import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("static marketing metadata", () => {
  it("keeps the HTML shell aligned with the current AI voice agent promise", () => {
    const index = read("index.html");

    expect(index).toContain("Wireline | AI voice agents that get work done");
    expect(index).toContain("Build one for your business or your life.");
    expect(index).toContain("call, answer, text, email, book, and follow through");
    expect(index).toContain('"slogan": "Build. Train. Launch."');
    expect(index).not.toContain("—");
    expect(index).not.toContain("Your AI Voice Employee Calls, Texts &amp; Emails");
    expect(index).not.toContain("Voice AI employee for real conversations.");
    expect(index).not.toContain("AI phone employees that turn calls into sales.");
    expect(index).not.toContain("solo business agents");
    expect(index).not.toContain("Your phone, finally answering for you.");
  });

  it("keeps install, icon, analytics, and WebSite identity assets in the HTML shell", () => {
    const index = read("index.html");

    expect(index).toContain('<link rel="preconnect" href="https://plausible.io" crossorigin />');
    expect(index).toContain('<link rel="icon" type="image/png" href="/favicon.png" />');
    expect(index).toContain('<link rel="mask-icon" href="/favicon.svg" color="#6D28D9" />');
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

    expect(hero).toContain('title === MARKETING_VOICE.headline');
    expect(hero).toContain("const isHomeHero");
    expect(hero).toContain(
      'aria-label={isHomeHero && typeof title === "string" ? title : undefined}',
    );
    expect(hero).toContain("text-[clamp(2.45rem,5vw,4.75rem)]");
    expect(hero).toContain("max-w-[19ch]");
    expect(hero).not.toContain("uppercase leading");
    expect(landing).toContain('title="Wireline | AI voice agents that get work done"');
    expect(landing).toContain("MARKETING_VOICE.subline");
    expect(landing).not.toContain('title="Wireline —');
  });

  it("keeps the OG image aligned with voice, channels, number, and outcomes", () => {
    const ogImage = read("public/og-image.svg");

    expect(ogImage).toContain("Voice agents that");
    expect(ogImage).toContain("get the work done.");
    expect(ogImage).toContain("NUMBER INCLUDED ON PAID PLANS");
    expect(ogImage).toContain("Build one for business or life.");
    expect(ogImage).toContain("Conversation handled. Work finished.");
    expect(ogImage).toContain("VOICE | TEXT | EMAIL | BOOKINGS | FOLLOW UP | CONTROL");
    expect(ogImage).not.toContain("AI VOICE AGENTS");
    expect(ogImage).not.toContain("YOUR NEXT AI EMPLOYEE");
    expect(ogImage).not.toContain("·");
  });

  it("keeps the installable web app manifest aligned with the public story", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      description: string;
    };

    expect(manifest.name).toBe("Wireline | AI Voice Agents");
    expect(manifest.description).toContain("Build one for your business or your life.");
    expect(manifest.description).toContain("call, answer, text, email, book");
    expect(manifest.description).toContain("follow through while you stay in control");
    expect(manifest.description).not.toContain("included numbers");
    expect(manifest.description).not.toContain("—");
  });
});
