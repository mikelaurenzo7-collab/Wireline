// Exact-head public-brand cutover release contract.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const structuredData = () =>
  JSON.parse(
    read("index.html").match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1],
  )["@graph"] as Array<Record<string, unknown>>;

describe("BotBound static marketing metadata", () => {
  it("keeps the HTML shell aligned with the BotBound promise", () => {
    const index = read("index.html");

    expect(index).toContain("BotBound | Your next hire is a bot.");
    expect(index).toContain(
      "Your next hire is a bot. Inbound and outbound calls, SMS, email, and computer tasks for small businesses.",
    );
    expect(index).toContain('<meta name="msapplication-TileColor" content="#F7F7F3" />');
    expect(structuredData().find((entry) => entry["@type"] === "Organization")).toMatchObject({
      name: "BotBound",
      slogan: "Your next hire is a bot.",
      logo: "https://botbound.app/botbound-icon-512.png",
    });
    expect(index).toContain('<link rel="canonical" href="https://botbound.app/" />');
    expect(index).toContain('<meta property="og:url" content="https://botbound.app/" />');
    expect(index).toContain(
      '<meta property="og:image" content="https://botbound.app/og-image.png?v=20261028" />',
    );
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

    expect(robots).toContain("Sitemap: https://botbound.app/sitemap.xml");
    expect(robots).not.toContain("trywireline.com");
    expect(sitemap).toContain("<loc>https://botbound.app/</loc>");
    expect(sitemap).toContain("<loc>https://botbound.app/pricing</loc>");
    expect(sitemap).not.toContain("trywireline.com");
    expect(sitemap).not.toMatch(/\bWireline\b/);
  });

  it("keeps install, icon, analytics, and WebSite identity assets in the HTML shell", () => {
    const index = read("index.html");

    expect(index).toContain('<link rel="preconnect" href="https://plausible.io" crossorigin />');
    expect(index).toContain(
      '<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png" />',
    );
    expect(index).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(index).not.toContain('rel="mask-icon"');
    expect(index).toContain(
      '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
    );
    expect(index).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(structuredData().find((entry) => entry["@type"] === "WebSite")).toMatchObject({
      "@id": "https://botbound.app/#website",
      publisher: { "@id": "https://botbound.app/#organization" },
    });
  });

  it("keeps runtime and hydrated landing metadata pinned to the same BotBound entrance", () => {
    const landing = read("src/pages/LandingPage.tsx");
    const pageMeta = read("src/lib/page-meta.tsx");

    expect(landing).toContain("title={HOME_TITLE}");
    expect(landing).toContain("description={HOME_DESCRIPTION}");
    expect(landing).toContain("BOTBOUND_PRODUCTION_ORIGIN");
    expect(landing).not.toContain("LEGACY_PRODUCTION_ORIGIN");
    expect(landing).not.toContain("VITE_PUBLIC_SITE_URL");
    expect(pageMeta).toContain('DEFAULT_TITLE = "BotBound | Your next hire is a bot."');
    expect(pageMeta).toMatch(
      /DEFAULT_DESCRIPTION =\s*"Your next hire is a bot\. Inbound and outbound calls, SMS, email, and computer tasks for small businesses\./,
    );
    expect(pageMeta).toContain("BOTBOUND_PRODUCTION_ORIGIN");
    expect(pageMeta).not.toContain("VITE_PUBLIC_SITE_URL");
    expect(pageMeta).not.toContain('DEFAULT_TITLE = "WIRELINE');
  });

  it("keeps the OG source aligned with incoming calls, email, and computer tasks", () => {
    const ogImage = read("public/og-image.svg");

    expect(ogImage).toContain("BotBound");
    expect(ogImage).toContain("YOUR NEXT HIRE");
    expect(ogImage).toContain("IS A BOT.");
    expect(ogImage).toContain("Inbound and outbound calls, SMS,");
    expect(ogImage).toContain("email, and computer tasks for small businesses.");
    expect(ogImage).not.toContain("Start Free");
    expect(ogImage).not.toContain("ONE BOT");
    expect(ogImage).not.toContain("Find. Call. Book");
    expect(ogImage).toMatch(/phone|Phone/);
    expect(ogImage).toContain('width="1200" height="630"');
    expect(ogImage).not.toContain("PUT YOUR BOT ON THE LINE");
    expect(
      readFileSync(resolve(process.cwd(), "public/brand/botbound-current-offer-og.png")),
    ).toEqual(readFileSync(resolve(process.cwd(), "public/og-image.png")));
  });

  it("ships the approved Bot mark in the warm 1200 by 630 OG raster", () => {
    const source = read("public/og-image.svg");
    const encodedImage = source.match(/href="data:image\/png;base64,([^"]+)"/)?.[1];
    const canonicalImage = readFileSync(
      resolve(process.cwd(), "public/brand/botbound-operator-polished.png"),
    );
    expect(encodedImage).toBeTruthy();
    expect(Buffer.from(encodedImage!, "base64").equals(canonicalImage)).toBe(true);
    const ogImage = new Resvg(source, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
    expect(ogImage.readUInt32BE(16)).toBe(1200);
    expect(ogImage.readUInt32BE(20)).toBe(630);
  });

  it("keeps the installable app Studio-first and BotBound-branded", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      short_name: string;
      description: string;
      theme_color: string;
      background_color: string;
      start_url: string;
      icons: Array<{ src: string }>;
      shortcuts: Array<{ name: string; description: string; url: string }>;
    };

    expect(manifest.name).toBe("BotBound");
    expect(manifest.short_name).toBe("BotBound");
    expect(manifest.description).toBe(
      "Inbound and outbound calls, SMS, email, and computer tasks for small businesses.",
    );
    expect(manifest.theme_color).toBe("#F7F7F3");
    expect(manifest.background_color).toBe("#F7F7F3");
    expect(manifest.start_url).toBe("/studio");
    expect(manifest.icons[0]?.src).toBe("/botbound-icon-192.png");
    expect(manifest.shortcuts.map((shortcut) => shortcut.name)).toEqual([
      "BOT STUDIO",
      "INBOX",
      "CALLS",
    ]);
    expect(manifest.shortcuts.find((shortcut) => shortcut.name === "INBOX")?.description).toContain(
      "email and conversations",
    );
    expect(manifest.shortcuts.some((shortcut) => shortcut.url === "/agents")).toBe(false);
  });
});
