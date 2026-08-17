import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const PUBLIC_LOOP = "Build -> Train -> Launch -> Improve";

describe("product doctrine parity", () => {
  it("keeps one public operating loop across active source-of-truth documents", () => {
    const activeDocs = [
      "README.md",
      "docs/README.md",
      "docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md",
      "docs/PRODUCT_SHOWCASE_MATRIX.md",
      "docs/CLIENT_SURFACES.md",
    ];

    for (const path of activeDocs) {
      expect(read(path), path).toContain(PUBLIC_LOOP);
    }

    const root = read("README.md");
    const showcase = read("docs/PRODUCT_SHOWCASE_MATRIX.md");
    expect(root).not.toContain("The customer-facing loop is **Create -> Train -> Run**");
    expect(showcase).not.toContain(
      "Every surface should reinforce one clear loop before it branches outward: **Create -> Train -> Wire -> Run**",
    );
  });

  it("keeps Live Video retired and companions on draft skills across code and current docs", () => {
    const root = read("README.md");
    const docsIndex = read("docs/README.md");
    const showcase = read("docs/PRODUCT_SHOWCASE_MATRIX.md");
    const clientSurfaces = read("docs/CLIENT_SURFACES.md");
    const entitlements = read("src/lib/video-presenter/live-video-entitlements.ts");
    const companions = read("docs/GROK_BOT_COMPANION_RUNTIME.md");

    expect(root).toContain("**Identity - retired live talking-head:**");
    expect(docsIndex).toContain("**Retired live talking-head.**");
    expect(showcase).toContain("| Live Video        | **Retired**");
    expect(clientSurfaces).toContain("Launch status | **Retired**");
    expect(entitlements).toContain("Live talking-head video is no longer offered");
    expect(entitlements).toContain("addonOffered: false");
    expect(companions).toContain("There is no Grok Bot HTTP API");
    expect(companions).toContain("There is no second companion to chat with");
    expect(companions).toContain(
      "do not build a Grok Bot subagent, special runtime, or Cursor-teammate clone",
    );

    for (const [path, source] of [
      ["README.md", root],
      ["docs/PRODUCT_SHOWCASE_MATRIX.md", showcase],
      ["docs/CLIENT_SURFACES.md", clientSurfaces],
    ] as const) {
      expect(source, path).not.toContain("**Live paid add-on**");
      expect(source, path).not.toContain("**Video presenters - planned/beta add-on:**");
    }
  });

  it("describes paid phone capacity as provisioned slots rather than guaranteed idle lines", () => {
    const root = read("README.md");
    const pricing = read("src/pages/Pricing.tsx");
    const catalog = read("src/lib/plan-catalog.ts");

    expect(root).toContain("Every paid agent includes a **production-number slot**");
    expect(root).toContain("provisions the number only when the role needs one");
    expect(pricing).toContain("Plans provide number slots");
    expect(catalog).toContain("production-number slots, provisioned when needed");
  });
});
