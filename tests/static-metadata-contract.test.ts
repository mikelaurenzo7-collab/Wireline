import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("static marketing metadata", () => {
  it("keeps the HTML shell aligned with the Phone Bot promise", () => {
    const index = read("index.html");

    expect(index).toContain("WIRELINE | WIRE YOUR PHONE BOT");
    expect(index).toContain("A Phone Bot for calls, email, and text");
    expect(index).toContain('"slogan": "WIRE YOUR PHONE BOT"');
    expect(index).toContain('"description": "Phone Bots for calls, email, and text."');
    expect(index).not.toContain("one workspace");
    expect(index).not.toContain("VOICE-FIRST");
    expect(index).not.toContain("Voice Bots");
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

  it("keeps the runtime landing metadata aligned to the new entrance", () => {
    const landing = read("src/pages/LandingPage.tsx");
    const pageMeta = read("src/lib/page-meta.tsx");

    expect(landing).toContain('title="WIRELINE | WIRE YOUR PHONE BOT"');
    expect(landing).toContain("BOT_MARKETING_VOICE.subline");
    expect(landing).not.toContain('title="Wireline —');
    expect(pageMeta).toContain('DEFAULT_TITLE = "WIRELINE | WIRE YOUR PHONE BOT"');
    expect(pageMeta).toContain("A Phone Bot for calls, email, and text");
  });

  it("keeps the OG image aligned with the same compact acquisition story", () => {
    const ogImage = read("public/og-image.svg");

    expect(ogImage).toContain("CALL / EMAIL / TEXT");
    expect(ogImage).toContain("WIRE YOUR");
    expect(ogImage).toContain("PHONE BOT");
    expect(ogImage).toContain("Put a Bot on the line. Let the work start moving.");
    expect(ogImage).toContain("TRYWIRELINE.COM");
    expect(ogImage).not.toContain("ONE WORKSPACE");
    expect(ogImage).not.toContain("VOICE-FIRST");
    expect(ogImage).not.toContain("Voice agents that");
    expect(ogImage).not.toContain("AI VOICE AGENTS");
    expect(ogImage).not.toContain("YOUR NEXT AI EMPLOYEE");
    expect(ogImage).not.toContain("·");
    expect(ogImage).not.toContain("#4ADE9A");
  });

  it("keeps every element of the OG image legible after preview downscale", () => {
    const ogImage = read("public/og-image.svg");
    const sizes = [...ogImage.matchAll(/font-size="([\d.]+)"/g)].map((match) => Number(match[1]));

    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
    expect(sizes.filter((size) => size >= 60)).toHaveLength(2);
  });

  it("keeps the installable web app manifest aligned with Phone Bot entry", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      short_name: string;
      description: string;
      start_url: string;
      shortcuts: Array<{ name: string; description: string; url: string }>;
    };

    expect(manifest.name).toBe("WIRELINE | WIRE YOUR PHONE BOT");
    expect(manifest.short_name).toBe("WIRELINE");
    expect(manifest.description).toContain("Phone Bot for calls, email, and text");
    expect(manifest.description).not.toContain("one workspace");
    expect(manifest.description).not.toContain("included numbers");
    expect(manifest.description).not.toContain("—");
    expect(manifest.start_url).toBe("/overview");
    expect(manifest.shortcuts.map((shortcut) => shortcut.name)).toEqual([
      "BOT STUDIO",
      "INBOX",
      "KNOWLEDGE",
    ]);
    expect(manifest.shortcuts.find((shortcut) => shortcut.name === "INBOX")?.description).toContain(
      "calls, email, and text",
    );
    expect(manifest.shortcuts.some((shortcut) => shortcut.url === "/agents")).toBe(false);
  });
});
