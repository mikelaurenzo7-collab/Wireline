import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { WEDGES } from "../src/data/vertical-wedges";
import {
  HOME_DESCRIPTION,
  HOME_TITLE,
  PRERENDERED_MARKETING_ROUTES,
  resolveRouteMeta,
} from "../src/lib/marketing-route-meta";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * BotBound avoids hyphens, en dashes, and em dashes in product prose. Slugs,
 * links, classes, and identifiers are not copy and are excluded from the scan.
 */
const LONG_DASH = /[–—]|[a-z]-[a-z]/i;
const SKIP_KEYS = new Set(["href", "slug", "key", "id", "icon", "image"]);
const isNonCopy = (value: string) =>
  value.startsWith("tel:") ||
  value.startsWith("/") ||
  value.startsWith("http") ||
  value.startsWith("mailto:");

function collectLongDashes(node: unknown, path: string, hits: string[]): void {
  if (typeof node === "string") {
    if (!isNonCopy(node) && LONG_DASH.test(node)) hits.push(`${path}: ${node}`);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectLongDashes(item, `${path}[${index}]`, hits));
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (SKIP_KEYS.has(key)) continue;
      collectLongDashes(value, `${path}.${key}`, hits);
    }
  }
}

describe("marketing copy punctuation and retired-positioning contract", () => {
  it("keeps every wedge copy string free of en and em dashes", () => {
    const hits: string[] = [];
    collectLongDashes(WEDGES, "WEDGES", hits);
    expect(hits).toEqual([]);
  });

  it("keeps wedge meta fields free of en and em dashes", () => {
    for (const [slug, wedge] of Object.entries(WEDGES)) {
      expect(wedge.metaTitle, `${slug}.metaTitle`).not.toMatch(LONG_DASH);
      expect(wedge.metaDescription, `${slug}.metaDescription`).not.toMatch(LONG_DASH);
    }
  });

  it("keeps every prerendered route title and description free of long dashes", () => {
    for (const route of PRERENDERED_MARKETING_ROUTES) {
      const meta = resolveRouteMeta(route);
      expect(meta, route).not.toBeNull();
      expect(meta!.title, `${route} title`).not.toMatch(LONG_DASH);
      expect(meta!.description, `${route} description`).not.toMatch(LONG_DASH);
    }
    expect(HOME_TITLE).not.toMatch(LONG_DASH);
    expect(HOME_DESCRIPTION).not.toMatch(LONG_DASH);
  });

  it("keeps the installable manifest identity free of long dashes", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      description: string;
    };
    expect(manifest.name).not.toMatch(LONG_DASH);
    expect(manifest.description).not.toMatch(LONG_DASH);
  });

  it("keeps retired Agent-era positioning out of the commercial funnel", () => {
    const sources = [
      "src/pages/Pricing.tsx",
      "src/pages/Features.tsx",
      "src/pages/Compare.tsx",
      "src/pages/SolutionsPage.tsx",
      "src/components/marketing/WireAgentLanding.tsx",
    ].map((path) => [path, read(path)] as const);

    const retired = [
      "AI profit agent",
      "AI Profit Agent",
      "phone employee",
      "Phone Employee",
      "AI VOICE AGENTS",
      "Voice agents that get the work done",
      "AI conversation workforce",
    ];

    for (const [path, source] of sources) {
      for (const phrase of retired) {
        expect(source, `${path} must not contain retired phrase "${phrase}"`).not.toContain(phrase);
      }
    }
  });

  it("keeps the brand spine and product family explicit without compound hyphens", () => {
    expect(HOME_TITLE).toBe("BotBound | Your Bot for calls, texts, email, and computer.");
    expect(HOME_DESCRIPTION).toBe(
      "Voice Bots with a computer, phone number, and email address. Answer calls, handle requests, and get everyday work done for you or your business.",
    );
    expect(read("src/lib/bot-product.ts")).toContain('name: "Phone Bot"');
    expect(read("src/components/marketing/WireAgentLanding.tsx")).toContain(
      "Voice Calls. Texts. Email. Computer Use.",
    );
    expect(read("src/pages/Compare.tsx")).toContain("feature by feature");
  });
});
