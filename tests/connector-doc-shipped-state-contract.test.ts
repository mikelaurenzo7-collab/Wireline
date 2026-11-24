import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/**
 * `docs/CONNECTORS.md` is mostly a dated research document, and its historical
 * sections are allowed to describe code that no longer exists because they say
 * so. Its "Shipped as of" section is the opposite: it is the one part a reader
 * trusts as a description of main, so it has to stay true as providers come and
 * go.
 *
 * This contract reads the doc against the filesystem rather than pinning its
 * prose, so the doc can be rewritten freely as long as it keeps telling the
 * truth about which OAuth providers exist.
 */
const SHIPPED_HEADING = "## Shipped as of";

const RETIRED_PROVIDERS = [
  "salesforce",
  "hubspot",
  "apollo",
  "shopify",
  "square",
  "meta-webhook",
  "x",
  "zoom",
  "yahoo",
] as const;

/**
 * A provider can also go stale the other way round: the route is deleted but the
 * doc still lists it as live. Word-boundary patterns, because "x" and "meta"
 * appear inside ordinary words.
 */
const RETIRED_IN_PROSE: readonly (readonly [string, RegExp])[] = [
  ["Salesforce", /\bSalesforce\b/i],
  ["HubSpot", /\bHubSpot\b/i],
  ["Apollo", /\bApollo\b/i],
  ["Shopify", /\bShopify\b/i],
  ["Square", /\bSquare\b/i],
  ["X", /\bX\b/],
  ["Zoom", /\bZoom\b/i],
  ["Yahoo", /\bYahoo\b/i],
];

const OAUTH_SENTENCE_MARKER = "**What `src/routes/oauth/` still holds.**";

function shippedSection(doc: string): string {
  const start = doc.indexOf(SHIPPED_HEADING);
  expect(start, `${SHIPPED_HEADING} must exist in docs/CONNECTORS.md`).toBeGreaterThan(-1);
  const next = doc.indexOf("\n## ", start + SHIPPED_HEADING.length);
  return next < 0 ? doc.slice(start) : doc.slice(start, next);
}

describe("connector doc shipped-state", () => {
  const doc = read("docs/CONNECTORS.md");
  const section = shippedSection(doc);
  const oauthFiles = readdirSync(resolve(root, "src/routes/oauth"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => name.replace(/\.ts$/, ""))
    .filter((name) => name !== "index" && name !== "status");

  it("names every OAuth provider that still exists", () => {
    for (const provider of oauthFiles) {
      // "google-sheets" is written as "Google Sheets" in prose.
      const prose = provider.replace(/-/g, " ");
      expect(section.toLowerCase(), `${provider} must appear in the shipped section`).toContain(
        prose,
      );
    }
  });

  it("does not present a deleted provider as a live OAuth route", () => {
    for (const provider of RETIRED_PROVIDERS) {
      expect(oauthFiles, `src/routes/oauth/${provider}.ts must stay deleted`).not.toContain(
        provider,
      );
    }
  });

  it("does not list a deleted provider among the live OAuth routes", () => {
    const start = section.indexOf(OAUTH_SENTENCE_MARKER);
    expect(start, `${OAUTH_SENTENCE_MARKER} must exist in the shipped section`).toBeGreaterThan(-1);
    const rest = section.slice(start + OAUTH_SENTENCE_MARKER.length);
    const end = rest.indexOf("\n\n");
    const sentence = end < 0 ? rest : rest.slice(0, end);

    for (const [label, pattern] of RETIRED_IN_PROSE) {
      expect(sentence, `${label} is deleted and must not read as a live route`).not.toMatch(
        pattern,
      );
    }
  });

  it("dates the shipped claim so a reader knows how stale it may be", () => {
    expect(section).toMatch(/## Shipped as of \w+ \d{1,2}, \d{4}/);
  });

  it("keeps the surviving public-research tool where the doc says it lives", () => {
    expect(section).toContain("src/lib/bot-tools/research.ts");
    expect(read("src/lib/bot-tools/research.ts")).toContain("gemini_ground");
  });

  it("stays classified in the documentation index", () => {
    expect(read("docs/README.md")).toContain("](./CONNECTORS.md)");
  });
});
