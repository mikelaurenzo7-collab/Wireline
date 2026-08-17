import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRERENDERED_ROUTE_SHELLS, resolveRouteMeta } from "../src/lib/marketing-route-meta";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// A URL submitted in sitemap.xml but not prerendered falls through to
// dist/index.html, whose canonical is the homepage. Google then sees a
// submitted URL that self-canonicalizes away and drops it as a duplicate, and
// every social share of it unfurls as the generic homepage card. Four vertical
// trust packs — the pages regulated buyers are sent to — were in exactly that
// state.
describe("every submitted URL carries its own meta", () => {
  const sitemapPaths = Array.from(
    read("public/sitemap.xml").matchAll(/<loc>https:\/\/trywireline\.com([^<]*)<\/loc>/g),
    (m) => m[1].replace(/\/+$/, "") || "/",
  );

  it("submits a non-trivial set of URLs", () => {
    expect(sitemapPaths.length).toBeGreaterThanOrEqual(20);
  });

  it("resolves distinct per-route meta for every sitemap URL", () => {
    const missing: string[] = [];
    for (const path of sitemapPaths) {
      // The homepage legitimately uses the static defaults in index.html.
      if (path === "/") continue;
      const meta = resolveRouteMeta(path);
      if (!meta || !meta.title || !meta.description) missing.push(path);
    }
    expect(missing).toEqual([]);
  });

  it("prerenders every sitemap URL so non-rendering crawlers see it", () => {
    const notPrerendered = sitemapPaths.filter(
      (p) => p !== "/" && !PRERENDERED_ROUTE_SHELLS.includes(p),
    );
    expect(notPrerendered).toEqual([]);
  });

  it("keeps the trust-pack meta in sync with the packs that exist", () => {
    // The meta lives in marketing-route-meta.ts (build-time, no React) while
    // the content lives in the component, so drift is possible in both
    // directions: a new pack with no meta self-canonicalizes to the homepage,
    // and meta for a removed pack prerenders a page that 404s in the SPA.
    const packSlugs = Array.from(
      read("src/components/TrustPackPage.tsx")
        .slice(
          read("src/components/TrustPackPage.tsx").indexOf("const PACKS"),
          read("src/components/TrustPackPage.tsx").indexOf("export default function"),
        )
        .matchAll(/^ {2}([a-z]+): \{$/gm),
      (m) => m[1],
    );
    expect(packSlugs.length).toBeGreaterThanOrEqual(4);

    const metaTrustSlugs = PRERENDERED_ROUTE_SHELLS.filter((r) => r.startsWith("/trust/")).map(
      (r) => r.slice("/trust/".length),
    );

    expect([...metaTrustSlugs].sort()).toEqual([...packSlugs].sort());
  });
});
