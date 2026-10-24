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
    expect(liveVoice).toContain("Telephone calls run on xAI voice");
    expect(liveVoice).toContain("A call never moves between providers mid-flight.");
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

    expect(root).toContain("unused capacity does not pre-provision carrier numbers");
    expect(pricing).toContain("Email-only does not include a phone number.");
    expect(pricing).toContain("Personal and Calls packages include one local number.");
    expect(pricing).toContain("Personal · $12/month");
    expect(root).toContain("BotBound Personal is a paid plan");
    expect(pricing).not.toContain("The Free plan");
    expect(catalog).toContain("included_mailboxes");
    const identity = read("src/lib/paid-bot-identity.ts");
    expect(identity).toContain('const PAID_IDENTITY_STATUSES = new Set(["active"])');
    expect(identity).toContain("PAID_IDENTITY_STATUSES.has(status)");
    expect(identity).toContain("plan.price_usd_monthly > 0");
    expect(identity).toContain('entitlement.channels.includes("email")');
    expect(identity).toContain('channel === "voice" || channel === "sms"');
    expect(identity).toContain("phoneAgentIds");
    expect(identity).toContain("mailboxAgentIds");
  });
});
