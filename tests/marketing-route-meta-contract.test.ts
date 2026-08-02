import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HOME_TITLE,
  HOME_DESCRIPTION,
  PRERENDERED_MARKETING_ROUTES,
  injectMarketingMeta,
  resolveRouteMeta,
} from "../src/lib/marketing-route-meta";
import { WEDGES } from "../src/data/vertical-wedges";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const indexHtml = read("index.html");

describe("marketing route meta prerendering", () => {
  it("keeps the homepage-default constants in sync with the static HTML shell", () => {
    // If these drift, injection silently no-ops — this guard (and the build
    // script's own check) makes it loud instead.
    expect(indexHtml).toContain(`<title>${HOME_TITLE}</title>`);
    expect(indexHtml.split(HOME_TITLE).length - 1).toBe(3); // title, og:title, twitter:title
    expect(indexHtml.split(HOME_DESCRIPTION).length - 1).toBe(3); // desc, og:desc, twitter:desc
    expect(indexHtml).toContain('<link rel="canonical" href="https://trywireline.com/" />');
    expect(indexHtml).toContain('<meta property="og:url" content="https://trywireline.com/" />');
  });

  it("prerenders every /for/* wedge plus the inline commercial pages", () => {
    for (const slug of Object.keys(WEDGES)) {
      expect(PRERENDERED_MARKETING_ROUTES).toContain(`/for/${slug}`);
    }
    for (const route of [
      "/pricing",
      "/features",
      "/compare",
      "/solutions/sales",
      "/solutions/support",
    ]) {
      expect(PRERENDERED_MARKETING_ROUTES).toContain(route);
    }
    // Every listed route must resolve — the build script exits non-zero otherwise.
    for (const route of PRERENDERED_MARKETING_ROUTES) {
      expect(resolveRouteMeta(route), route).not.toBeNull();
    }
  });

  it("serves the homepage and app routes unchanged (null meta)", () => {
    expect(resolveRouteMeta("/")).toBeNull();
    expect(resolveRouteMeta("")).toBeNull();
    expect(resolveRouteMeta("/overview")).toBeNull();
    expect(resolveRouteMeta("/studio")).toBeNull();
    expect(resolveRouteMeta("/for/not-a-real-vertical")).toBeNull();
  });

  it("derives every /for/:slug page's meta from WEDGES (one source of truth)", () => {
    for (const [slug, wedge] of Object.entries(WEDGES)) {
      const meta = resolveRouteMeta(`/for/${slug}`);
      expect(meta, slug).not.toBeNull();
      expect(meta!.title).toBe(wedge.metaTitle); // metaTitle already carries "Wireline"
      expect(meta!.description).toBe(wedge.metaDescription);
      expect(meta!.canonical).toBe(`https://trywireline.com/for/${slug}`);
    }
  });

  it("keeps the inline-page values verbatim in sync with each page's PageMeta call", () => {
    const pricing = read("src/pages/Pricing.tsx");
    const features = read("src/pages/Features.tsx");
    const compare = read("src/pages/Compare.tsx");
    const solutions = read("src/pages/SolutionsPage.tsx");

    expect(pricing).toContain(`title="${resolveRouteMeta("/pricing")!.title}"`);
    expect(features).toContain(`title="${resolveRouteMeta("/features")!.title}"`);
    expect(compare).toContain(`title="${resolveRouteMeta("/compare")!.title}"`);
    for (const route of ["/pricing", "/features", "/compare"] as const) {
      const source = { "/pricing": pricing, "/features": features, "/compare": compare }[route];
      expect(source).toContain(resolveRouteMeta(route)!.description);
    }
    // SolutionsPage titles are `${page.title} | Wireline`; assert both halves.
    for (const route of ["/solutions/sales", "/solutions/support"] as const) {
      const meta = resolveRouteMeta(route)!;
      expect(meta.title.endsWith(" | Wireline")).toBe(true);
      expect(solutions).toContain(`"${meta.title.replace(" | Wireline", "")}"`);
      expect(solutions).toContain(meta.description);
    }
    // The wider sitemap set: every prerendered route's title and description
    // must appear verbatim in the page component that owns its PageMeta call.
    const routeSources: Record<string, string> = {
      "/about": "src/pages/About.tsx",
      "/showcase": "src/pages/Showcase.tsx",
      "/blog": "src/pages/Blog.tsx",
      "/support": "src/components/SupportPage.tsx",
      "/contact": "src/components/ContactPage.tsx",
      "/status": "src/components/Status.tsx",
      "/security": "src/components/Security.tsx",
      "/trust": "src/components/Security.tsx",
      "/developers": "src/pages/Developers.tsx",
      "/changelog": "src/components/PublicChangelog.tsx",
      "/privacy": "src/components/PrivacyPolicyPage.tsx",
      "/terms": "src/components/LegalPage.tsx",
    };
    for (const [route, path] of Object.entries(routeSources)) {
      const meta = resolveRouteMeta(route)!;
      const source = read(path);
      // Titles may carry the PageMeta brand suffix client-side; assert the
      // pre-suffix half the page actually declares.
      expect(source, `${route} title`).toContain(meta.title.replace(" | Wireline", ""));
      expect(source, `${route} description`).toContain(meta.description);
    }
  });

  it("normalizes trailing slashes and strips query/hash", () => {
    expect(resolveRouteMeta("/for/medical/")).toEqual(resolveRouteMeta("/for/medical"));
    expect(resolveRouteMeta("/pricing?utm_source=x")).toEqual(resolveRouteMeta("/pricing"));
    expect(resolveRouteMeta("/features#top")).toEqual(resolveRouteMeta("/features"));
  });

  it("rewrites the static head for a marketing route without touching unrelated markup", () => {
    const meta = resolveRouteMeta("/for/medical")!;
    const out = injectMarketingMeta(indexHtml, meta);

    expect(out).toContain(`<title>${meta.title}</title>`);
    expect(out).toContain(`<meta property="og:title" content="${meta.title}" />`);
    expect(out).toContain(`<meta name="twitter:title" content="${meta.title}" />`);
    expect(out).toContain(`content="${meta.description}"`);
    expect(out).toContain(`<link rel="canonical" href="${meta.canonical}" />`);
    expect(out).toContain(`<meta property="og:url" content="${meta.canonical}" />`);

    // Homepage defaults are gone…
    expect(out).not.toContain(`<title>${HOME_TITLE}</title>`);
    expect(out).not.toContain('<link rel="canonical" href="https://trywireline.com/" />');
    // …but unrelated head content and the asset shell are preserved.
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(out).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(out).toContain('"@type": "WebSite"');
    // The shared OG image is intentionally left as the site default.
    expect(out).toContain(
      '<meta property="og:image" content="https://trywireline.com/og-image.png" />',
    );
  });

  it("is wired into the build pipeline that both local and Vercel builds run", () => {
    const pkg = read("package.json");
    const buildScript = (JSON.parse(pkg) as { scripts: Record<string, string> }).scripts.build;
    // Prerender must run after vite build (needs dist/index.html) and before
    // anything consumes dist.
    expect(buildScript).toContain("vite build && tsx scripts/prerender-marketing-meta.mts");

    const script = read("scripts/prerender-marketing-meta.mts");
    expect(script).toContain("PRERENDERED_MARKETING_ROUTES");
    expect(script).toContain('path.join(dist, ...route.split("/").filter(Boolean))');
    expect(script).toContain("process.exit(1)"); // drift fails the build loudly
  });
});
