import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("product doctrine parity", () => {
  it("keeps public setup sequences out of active source-of-truth documents", () => {
    const activeDocs = [
      "README.md",
      "docs/README.md",
      "docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md",
      "docs/PRODUCT_SHOWCASE_MATRIX.md",
      "docs/CLIENT_SURFACES.md",
      "brand-work/gtm/BOTBOUND-LAUNCH-COPY-KIT.md",
      "brand-work/launch-2026-09/README.md",
      "brand-work/launch-2026-09/copy/SOCIAL_POSTS.md",
      "brand-work/launch-2026-09/copy/PAID_MEDIA_AND_PLACEMENT_NOTES.md",
      "brand-work/launch-2026-09/investor/BOTBOUND-INVESTOR-ONE-PAGER.md",
    ];

    for (const path of activeDocs) {
      const source = read(path);
      expect(source, path).not.toMatch(/Build\s*(?:->|→|\.|,)\s*Train\s*(?:->|→|\.|,)\s*Launch/);
      expect(source, path).not.toMatch(/Build\s*(?:->|→|\.|,)\s*Train\s*(?:->|→|\.|,)\s*Employ/);
      expect(source, path).not.toMatch(/(?:Customize|Train)\s*(?:->|→|\.|,)\s*Employ/);
    }

    const root = read("README.md");
    const showcase = read("docs/PRODUCT_SHOWCASE_MATRIX.md");
    expect(root).not.toContain("The customer-facing loop is **Create -> Train -> Run**");
    expect(showcase).not.toContain(
      "Every surface should reinforce one clear loop before it branches outward: **Create -> Train -> Wire -> Run**",
    );
  });

  it("keeps Live Video retired and work companions deleted across code and current docs", () => {
    const root = read("README.md");
    const docsIndex = read("docs/README.md");
    const showcase = read("docs/PRODUCT_SHOWCASE_MATRIX.md");
    const clientSurfaces = read("docs/CLIENT_SURFACES.md");
    const entitlements = read("src/lib/video-presenter/live-video-entitlements.ts");
    const liveVoice = read("docs/OPENAI_REALTIME_VOICE.md");

    expect(root).toContain("**Identity - retired live talking-head:**");
    expect(docsIndex).toContain("**Retired live talking-head.**");
    expect(docsIndex).not.toContain("GROK_BOT_COMPANION_RUNTIME.md");
    expect(showcase).toContain("| Live Video        | **Retired**");
    expect(clientSurfaces).toMatch(/Launch status\s+\|\s+\*\*Retired\*\*/);
    expect(entitlements).toContain("Live talking-head video is no longer offered");
    expect(entitlements).toContain("addonOffered: false");
    expect(liveVoice).toContain("BotBound uses one live-conversation runtime: OpenAI Realtime");
    expect(liveVoice).toContain(
      "No alternate voice provider or automatic model fallback is permitted",
    );
    expect(liveVoice).not.toMatch(/work-companion|Grok Bot companion/i);
    expect(existsSync(resolve(process.cwd(), "docs/GROK_BOT_COMPANION_RUNTIME.md"))).toBe(false);

    for (const [path, source] of [
      ["README.md", root],
      ["docs/PRODUCT_SHOWCASE_MATRIX.md", showcase],
      ["docs/CLIENT_SURFACES.md", clientSurfaces],
    ] as const) {
      expect(source, path).not.toContain("**Live paid add-on**");
      expect(source, path).not.toContain("**Video presenters - planned/beta add-on:**");
    }
  });

  it("allocates identity to active paid Bots without pre-provisioning unused capacity", () => {
    const root = read("README.md");
    const pricing = read("src/pages/Pricing.tsx");
    const catalog = read("src/lib/plan-catalog.ts");

    expect(root).toContain(
      "Every **active paid Bot gets a dedicated production number and BotBound-managed email identity**",
    );
    expect(root).toContain("Unused Bot capacity does not pre-provision carrier numbers");
    expect(pricing).toContain("Every active paid Bot gets its own BotBound phone number");
    expect(pricing).not.toContain("Every active paid Bot gets its own production number");
    expect(pricing).toContain("Free Builder and unused Bot slots do not receive live numbers.");
    expect(catalog).toContain("Every active paid Bot gets a dedicated production number");
    expect(catalog).toContain("Unused Bot capacity does not pre-provision orphan carrier numbers");
    expect(catalog).toContain(
      "1 dedicated production number, provisioned automatically for the active Bot",
    );
  });
});
