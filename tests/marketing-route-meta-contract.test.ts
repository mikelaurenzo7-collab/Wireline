import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HOME_TITLE,
  HOME_DESCRIPTION,
  PRERENDERED_ROUTE_SHELLS,
  SITE_URL,
  injectMarketingMeta,
  publicWedgeSlug,
  resolveRouteMeta,
  withBotBoundBrand,
} from "../src/lib/marketing-route-meta";
import { WEDGES } from "../src/data/vertical-wedges";
import { BOTBOUND_BRAND_NAME, BOTBOUND_PRODUCTION_ORIGIN } from "../src/lib/brand";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const indexHtml = read("index.html");

describe("route meta prerendering", () => {
  it("keeps the homepage-default constants in sync with the static HTML shell", () => {
    expect(indexHtml).toContain(`<title>${HOME_TITLE}</title>`);
    expect(indexHtml.split(HOME_TITLE).length - 1).toBeGreaterThanOrEqual(3);
    expect(indexHtml.split(HOME_DESCRIPTION).length - 1).toBeGreaterThanOrEqual(3);
    expect(indexHtml).toContain(`<link rel="canonical" href="${BOTBOUND_PRODUCTION_ORIGIN}/" />`);
    expect(indexHtml).toContain(
      `<meta property="og:url" content="${BOTBOUND_PRODUCTION_ORIGIN}/" />`,
    );
    expect(indexHtml).toContain(
      '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />',
    );
    expect(indexHtml).toContain(
      '<meta name="googlebot" content="index, follow, max-image-preview:large" />',
    );
    expect(indexHtml).toContain('content="BotBound"');
  });

  it("prerenders every /for/* wedge, inline commercial page, and guarded account shell", () => {
    for (const slug of Object.keys(WEDGES)) {
      expect(PRERENDERED_ROUTE_SHELLS).toContain(
        `/for/${publicWedgeSlug(slug as keyof typeof WEDGES)}`,
      );
    }
    for (const route of [
      "/pricing",
      "/features",
      "/compare",
      "/solutions/sales",
      "/solutions/support",
      "/signin",
      "/signup",
      "/reset-password",
      "/accept-invite",
      "/onboarding",
      "/auth/oauth-complete",
      "/404",
    ]) {
      expect(PRERENDERED_ROUTE_SHELLS).toContain(route);
    }
    for (const route of PRERENDERED_ROUTE_SHELLS) {
      expect(resolveRouteMeta(route), route).not.toBeNull();
    }
  });

  it("serves the homepage and unregistered app routes unchanged (null meta)", () => {
    expect(resolveRouteMeta("/")).toBeNull();
    expect(resolveRouteMeta("")).toBeNull();
    expect(resolveRouteMeta("/overview")).toBeNull();
    expect(resolveRouteMeta("/studio")).toBeNull();
    expect(resolveRouteMeta("/showcase")).toBeNull();
    expect(resolveRouteMeta("/for/not-a-real-vertical")).toBeNull();
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "does not resolve inherited object key %s as a public wedge",
    (slug) => {
      expect(resolveRouteMeta(`/for/${slug}`)).toBeNull();
    },
  );

  it("derives every /for/:slug page's meta from WEDGES (one source of truth)", () => {
    for (const [slug, wedge] of Object.entries(WEDGES)) {
      const publicSlug = publicWedgeSlug(slug as keyof typeof WEDGES);
      const meta = resolveRouteMeta(`/for/${publicSlug}`);
      expect(meta, slug).not.toBeNull();
      expect(meta!.title).toMatch(/botbound/i);
      expect(meta!.title).not.toMatch(/\bWireline\b/i);
      expect(meta!.description).toBe(withBotBoundBrand(wedge.metaDescription));
      expect(meta!.canonical).toBe(`${SITE_URL}/for/${publicSlug}`);
      expect(meta!.noIndex).not.toBe(true);
    }
  });

  it("keeps the retired audience slug as a noindex compatibility redirect shell", () => {
    const legacy = resolveRouteMeta("/for/personal");
    expect(PRERENDERED_ROUTE_SHELLS).toContain("/for/personal");
    expect(legacy).toMatchObject({
      canonical: `${SITE_URL}/for/everyday`,
      noIndex: true,
    });
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
      const source = {
        "/pricing": pricing,
        "/features": features,
        "/compare": compare,
      }[route];
      expect(source).toContain(resolveRouteMeta(route)!.description);
    }

    for (const route of ["/solutions/sales", "/solutions/support"] as const) {
      const meta = resolveRouteMeta(route)!;
      expect(meta.title.endsWith(` | ${BOTBOUND_BRAND_NAME}`)).toBe(true);
      expect(solutions).toContain(`"${meta.title.replace(` | ${BOTBOUND_BRAND_NAME}`, "")}"`);
      expect(solutions).toContain(meta.description);
    }

    const routeSources: Record<string, string> = {
      "/about": "src/pages/About.tsx",
      "/blog": "src/pages/Blog.tsx",
      "/support": "src/components/SupportPage.tsx",
      "/contact": "src/components/ContactPage.tsx",
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
      const inlineTitle = meta.title.replace(new RegExp(` \\| ${BOTBOUND_BRAND_NAME}$`), "");
      expect(source, `${route} title`).toContain(inlineTitle);
      expect(source, `${route} description`).toContain(meta.description);
      expect(meta.noIndex, route).not.toBe(true);
    }
  });

  it("keeps the trust packs' hydrated head sourced from the prerendered registry", () => {
    const page = read("src/components/TrustPackPage.tsx");

    expect(page).toContain("resolveRouteMeta");
    expect(page).toContain("resolveRouteMeta(`/trust/${vertical}`)");
    expect(page).toContain("title={prerendered?.title");
    expect(page).toContain("description={prerendered?.description");

    for (const vertical of ["medical", "legal", "insurance", "enterprise"]) {
      const meta = resolveRouteMeta(`/trust/${vertical}`);
      expect(meta, `/trust/${vertical}`).not.toBeNull();
      expect(meta!.title.endsWith(` | ${BOTBOUND_BRAND_NAME}`)).toBe(true);
      expect(meta!.canonical).toBe(`${SITE_URL}/trust/${vertical}`);
    }
  });

  it("normalizes trailing slashes and strips query/hash", () => {
    expect(resolveRouteMeta("/for/medical/")).toEqual(resolveRouteMeta("/for/medical"));
    expect(resolveRouteMeta("/pricing?utm_source=x")).toEqual(resolveRouteMeta("/pricing"));
    expect(resolveRouteMeta("/features#top")).toEqual(resolveRouteMeta("/features"));
    expect(resolveRouteMeta("/signin?next=%2Foverview")).toEqual(resolveRouteMeta("/signin"));
  });

  it("emits noindex before hydration for account, transition, and not-found routes", () => {
    const guardedRoutes = [
      "/signin",
      "/signup",
      "/get-started",
      "/auth",
      "/login",
      "/reset",
      "/reset-password",
      "/accept-invite",
      "/onboarding",
      "/auth/oauth-complete",
      "/oauth-complete",
      "/404",
      "/not-found",
    ] as const;

    for (const route of guardedRoutes) {
      const meta = resolveRouteMeta(route);
      expect(meta, route).not.toBeNull();
      expect(meta!.noIndex, route).toBe(true);
      const out = injectMarketingMeta(indexHtml, meta!);
      expect(out, `${route} robots`).toContain(
        '<meta name="robots" content="noindex, nofollow" />',
      );
      expect(out, `${route} googlebot`).toContain(
        '<meta name="googlebot" content="noindex, nofollow" />',
      );
      expect(out, `${route} canonical`).toContain(
        `<link rel="canonical" href="${meta!.canonical}" />`,
      );
      expect(out, `${route} index leakage`).not.toContain(
        '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />',
      );
    }

    expect(resolveRouteMeta("/get-started")!.canonical).toBe(`${SITE_URL}/signup`);
    expect(resolveRouteMeta("/auth")!.canonical).toBe(`${SITE_URL}/signin`);
    expect(resolveRouteMeta("/oauth-complete")!.canonical).toBe(`${SITE_URL}/auth/oauth-complete`);
    expect(resolveRouteMeta("/not-found")!.canonical).toBe(`${SITE_URL}/404`);
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
    expect(out).toContain(
      '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />',
    );

    expect(out).not.toContain(`<title>${HOME_TITLE}</title>`);
    expect(out).not.toContain(`<link rel="canonical" href="${BOTBOUND_PRODUCTION_ORIGIN}/" />`);
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(out).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(out).toMatch(/"@type"\s*:\s*"WebSite"/);
    expect(out).toContain(
      `<meta property="og:image" content="${BOTBOUND_PRODUCTION_ORIGIN}/og-image.png" />`,
    );
  });

  it("is wired into the build pipeline that both local and Vercel builds run", () => {
    const pkg = read("package.json");
    const buildScript = (JSON.parse(pkg) as { scripts: Record<string, string> }).scripts.build;
    expect(buildScript).toContain(
      "npm run assets && vite build && node scripts/quarantine-retired-public-assets.mjs && node --import tsx scripts/prerender-marketing-meta.mts",
    );
    expect(buildScript).not.toContain("validate-botbound-jingle");

    const script = read("scripts/prerender-marketing-meta.mts");
    expect(script).toContain("PRERENDERED_ROUTE_SHELLS");
    expect(script).toContain('path.join(dist, ...route.split("/").filter(Boolean))');
    expect(script).toContain("meta.noIndex");
    expect(script).toContain('content="noindex, nofollow"');
    expect(script).toContain("process.exit(1)");
  });
});
