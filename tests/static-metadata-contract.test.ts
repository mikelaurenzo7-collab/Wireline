import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("BotBound static marketing metadata", () => {
  it("keeps the HTML shell aligned with the BotBound promise", () => {
    const index = read("index.html");

    expect(index).toContain("BotBound | Put Your Bot on the Line");
    expect(index).toContain("AI employees for calls, texts, and email.");
    expect(index).toContain('"name":"BotBound"');
    expect(index).toContain('"slogan":"Put Your Bot on the Line"');
    expect(index).toContain('"logo":"https://botbound.me/botbound-icon.svg"');
    expect(index).toContain('<link rel="canonical" href="https://botbound.me/" />');
    expect(index).toContain('<meta property="og:url" content="https://botbound.me/" />');
    expect(index).toContain('<meta property="og:image" content="https://botbound.me/og-image.png" />');
    expect(index).not.toContain("https://trywireline.com");
    expect(index).not.toContain("support@trywireline.com");
    expect(index).not.toContain("WIRE YOUR PHONE BOT");
    expect(index).not.toContain("folded violet and platinum W");
    expect(index).not.toContain("VOICE-FIRST");
    expect(index).not.toContain("—");
  });

  it("keeps crawler discovery canonical to BotBound", () => {
    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");

    expect(robots).toContain("Sitemap: https://botbound.me/sitemap.xml");
    expect(robots).not.toContain("trywireline.com");
    expect(sitemap).toContain("<loc>https://botbound.me/</loc>");
    expect(sitemap).toContain("<loc>https://botbound.me/pricing</loc>");
    expect(sitemap).not.toContain("trywireline.com");
    expect(sitemap).not.toMatch(/\bWireline\b/);
  });

  it("keeps install, icon, analytics, and WebSite identity assets in the HTML shell", () => {
    const index = read("index.html");

    expect(index).toContain('<link rel="preconnect" href="https://plausible.io" crossorigin />');
    expect(index).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(index).toContain('<link rel="icon" type="image/png" href="/favicon.png" />');
    expect(index).toContain('<link rel="mask-icon" href="/favicon.svg" color="#8B5CF6" />');
    expect(index).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />');
    expect(index).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(index).toContain('"@type":"WebSite"');
    expect(index).toContain('"@id":"https://botbound.me/#website"');
    expect(index).toContain('"publisher":{"@id":"https://botbound.me/#organization"}');
  });

  it("keeps runtime and hydrated landing metadata pinned to the same BotBound entrance", () => {
    const landing = read("src/pages/LandingPage.tsx");
    const pageMeta = read("src/lib/page-meta.tsx");

    expect(landing).toContain('title="BotBound | Put Your Bot on the Line"');
    expect(landing).toContain("BOT_MARKETING_VOICE.subline");
    expect(landing).toContain("BOTBOUND_PRODUCTION_ORIGIN");
    expect(landing).not.toContain("LEGACY_PRODUCTION_ORIGIN");
    expect(landing).not.toContain("VITE_PUBLIC_SITE_URL");
    expect(pageMeta).toContain('DEFAULT_TITLE = "BotBound | Put Your Bot on the Line"');
    expect(pageMeta).toContain('DEFAULT_DESCRIPTION = "AI employees for calls, texts, and email."');
    expect(pageMeta).toContain("BOTBOUND_PRODUCTION_ORIGIN");
    expect(pageMeta).not.toContain("VITE_PUBLIC_SITE_URL");
    expect(pageMeta).not.toContain('DEFAULT_TITLE = "WIRELINE');
  });

  it("keeps the OG image aligned with the phone-Bot identity and concise story", () => {
    const ogImage = read("public/og-image.svg");

    expect(ogImage).toContain("BotBound");
    expect(ogImage).toContain("PUT YOUR BOT ON THE LINE");
    expect(ogImage).toContain("AI employees for calls, texts, and email.");
    expect(ogImage).toMatch(/phone|Phone/);
    expect(ogImage).toContain("#8B5CF6");
    expect(ogImage).not.toContain("WIRE YOUR");
    expect(ogImage).not.toContain("ONE WORKSPACE");
    expect(ogImage).not.toContain("VOICE-FIRST");
  });

  it("keeps every OG text element legible after preview downscale", () => {
    const ogImage = read("public/og-image.svg");
    const sizes = [...ogImage.matchAll(/font-size="([\d.]+)"/g)].map((match) => Number(match[1]));

    expect(sizes.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(80);
  });

  it("keeps the installable app Studio-first and BotBound-branded", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      short_name: string;
      description: string;
      start_url: string;
      icons: Array<{ src: string }>;
      shortcuts: Array<{ name: string; description: string; url: string }>;
    };

    expect(manifest.name).toBe("BotBound | Put Your Bot on the Line");
    expect(manifest.short_name).toBe("BotBound");
    expect(manifest.description).toBe("AI employees for calls, texts, and email.");
    expect(manifest.start_url).toBe("/studio");
    expect(manifest.icons[0]?.src).toBe("/botbound-icon.svg");
    expect(manifest.shortcuts.map((shortcut) => shortcut.name)).toEqual(["BOT STUDIO", "INBOX", "CALLS"]);
    expect(manifest.shortcuts.find((shortcut) => shortcut.name === "INBOX")?.description).toContain("texts and email");
    expect(manifest.shortcuts.some((shortcut) => shortcut.url === "/agents")).toBe(false);
  });
});
