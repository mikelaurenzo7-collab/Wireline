import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { WEDGES } from "../src/data/vertical-wedges";
import {
  HOME_TITLE,
  HOME_DESCRIPTION,
  PRERENDERED_MARKETING_ROUTES,
  resolveRouteMeta,
} from "../src/lib/marketing-route-meta";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * Marketing copy carries no hyphens. Slugs, hrefs, tel: links, CSS classes,
 * and code identifiers keep theirs — the ban is on customer-facing prose.
 * SERP-visible meta fields (titles/descriptions) additionally carry no en/em
 * dashes; the "|" separator is the house convention there.
 */
const HYPHEN = /[-‐‑]/;
const ANY_DASH = /[-‐‑–—]/;

const SKIP_KEYS = new Set(["href", "slug", "key", "id", "icon", "image"]);
const isNonCopy = (value: string) =>
  value.startsWith("tel:") ||
  value.startsWith("/") ||
  value.startsWith("http") ||
  value.startsWith("mailto:");

function collectHyphenated(node: unknown, path: string, hits: string[]): void {
  if (typeof node === "string") {
    if (!isNonCopy(node) && HYPHEN.test(node)) hits.push(`${path}: ${node}`);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectHyphenated(item, `${path}[${index}]`, hits));
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (SKIP_KEYS.has(key)) continue;
      collectHyphenated(value, `${path}.${key}`, hits);
    }
  }
}

describe("marketing copy hyphen ban", () => {
  it("keeps every wedge copy string hyphen-free", () => {
    const hits: string[] = [];
    collectHyphenated(WEDGES, "WEDGES", hits);
    expect(hits).toEqual([]);
  });

  it("keeps wedge meta fields free of every dash form", () => {
    for (const [slug, wedge] of Object.entries(WEDGES)) {
      expect(wedge.metaTitle, `${slug}.metaTitle`).not.toMatch(ANY_DASH);
      expect(wedge.metaDescription, `${slug}.metaDescription`).not.toMatch(ANY_DASH);
    }
  });

  it("keeps every prerendered route's title and description free of every dash form", () => {
    for (const route of PRERENDERED_MARKETING_ROUTES) {
      const meta = resolveRouteMeta(route);
      expect(meta, route).not.toBeNull();
      expect(meta!.title, `${route} title`).not.toMatch(ANY_DASH);
      expect(meta!.description, `${route} description`).not.toMatch(ANY_DASH);
    }
    expect(HOME_TITLE).not.toMatch(ANY_DASH);
    expect(HOME_DESCRIPTION).not.toMatch(ANY_DASH);
  });

  it("keeps the installable manifest identity hyphen-free", () => {
    const manifest = JSON.parse(read("public/site.webmanifest")) as {
      name: string;
      description: string;
    };
    expect(manifest.name).not.toMatch(ANY_DASH);
    expect(manifest.description).not.toMatch(ANY_DASH);
  });

  it("keeps retired hyphenated phrasing out of the commercial funnel pages", () => {
    const sources = [
      "src/pages/Pricing.tsx",
      "src/pages/Features.tsx",
      "src/pages/Compare.tsx",
      "src/pages/SolutionsPage.tsx",
      "src/components/marketing/WireAgentLanding.tsx",
    ].map((path) => [path, read(path)] as const);

    const retired = [
      "follow-up",
      "Follow-up",
      "Follow-Up",
      "after-hours",
      "After-hours",
      "owner-ready",
      "per-agent",
      "per-call",
      "voice-infrastructure",
      "month-to-month",
      "Month-to-month",
      "long-term",
      "lock-in",
      "Lowest-cost",
      "Multi-agent",
      "purpose-built",
      "hard-cap",
      "mid-call",
      "mid-conversation",
      "committed-usage",
      "lowest-risk",
      "phone-number cost",
      "Pay-as-you-go",
      "add-on",
      "feature-for-feature",
      "live-voice",
      "double-booking",
      "timezone-aware",
      "customer-count",
      "service-backed",
      "Flat-rate",
      "Post-call",
      "Calendar-aware",
      "speed-to-lead",
    ];

    for (const [path, source] of sources) {
      for (const phrase of retired) {
        expect(source, `${path} must not contain "${phrase}"`).not.toContain(phrase);
      }
    }
  });
});
