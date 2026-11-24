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
 * BotBound avoids en and em dashes in product prose, because they read as an
 * authored aside rather than a claim and they break the compact marketing
 * measure.
 *
 * Hyphenated compounds are copy, not punctuation debt. This contract used to
 * ban every `a-b` pattern, which outlawed ordinary marketing English — always
 * on became unsayable as "always-on", and so did AI-native, self-service,
 * round-the-clock, and first-call resolution. That turned a punctuation rule
 * into a cap on how persuasive the copy could be, so the rule is now scoped to
 * the two characters it was always about.
 *
 * Slugs, links, classes, and identifiers are not copy and stay excluded.
 */
const LONG_DASH = /[–—]/;
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

  it("keeps wedge meta fields free of long dashes", () => {
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

  /**
   * The home title and description are marketing copy and are expected to
   * change. What must hold is that they name the brand and stay inside the
   * length search engines actually render.
   */
  it("keeps the home metadata branded and within search limits", () => {
    expect(HOME_TITLE).toContain("BotBound");
    expect(HOME_TITLE.length).toBeLessThanOrEqual(70);
    expect(HOME_DESCRIPTION.length).toBeGreaterThan(50);
    expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(165);
    expect(read("src/lib/bot-product.ts")).toContain('name: "BotBound"');
  });
});
