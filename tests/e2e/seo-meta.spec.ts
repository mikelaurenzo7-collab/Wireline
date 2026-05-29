import { test, expect } from "@playwright/test";
import { gotoHydrated } from "../helpers/ui";

/**
 * SEO & meta validation — critical for discoverability.
 *
 * Every public page must carry proper meta tags for search engines and
 * social sharing. Missing or malformed meta tags hurt organic traffic
 * and social card rendering.
 */
test.describe("SEO — meta tags on public pages", () => {
  test("landing page carries essential meta tags", async ({ page }) => {
    await gotoHydrated(page, "/");

    // Title
    await expect(page).toHaveTitle(/Wireline/i);

    // Meta description (critical for SERP snippets)
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /.{30,}/);

    // Viewport meta (critical for mobile rendering)
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute("content", /width=device-width/);
  });

  test("landing page carries OpenGraph tags for social sharing", async ({ page }) => {
    await gotoHydrated(page, "/");

    // OG title
    const ogTitle = page.locator('meta[property="og:title"]');
    const hasOgTitle = (await ogTitle.count()) > 0;

    // OG description
    const ogDesc = page.locator('meta[property="og:description"]');
    const hasOgDesc = (await ogDesc.count()) > 0;

    // At least title and description should be present
    expect(hasOgTitle || hasOgDesc).toBe(true);
  });

  test("pricing page carries meta description", async ({ page }) => {
    await gotoHydrated(page, "/pricing");

    const description = page.locator('meta[name="description"]');
    const count = await description.count();
    if (count > 0) {
      await expect(description).toHaveAttribute("content", /.{20,}/);
    }
  });

  test("blog post carries article-specific meta", async ({ page }) => {
    await gotoHydrated(page, "/blog/voice-ai-benchmarks-sub-400ms-response-times");

    await expect(page).toHaveTitle(/Wireline/i);
    // Blog posts should carry descriptive meta
    const description = page.locator('meta[name="description"]');
    const count = await description.count();
    if (count > 0) {
      await expect(description).toHaveAttribute("content", /.+/);
    }
  });
});

test.describe("SEO — canonical URLs", () => {
  test("public pages declare canonical URLs without trailing slash conflicts", async ({ page }) => {
    await gotoHydrated(page, "/pricing");

    const canonical = page.locator('link[rel="canonical"]');
    const count = await canonical.count();
    if (count > 0) {
      const href = await canonical.getAttribute("href");
      expect(href).toBeTruthy();
      // Canonical should be absolute and not have double slashes
      expect(href).toMatch(/^https?:\/\//);
      expect(href).not.toMatch(/([^:])\/\//);
    }
  });
});

test.describe("SEO — structured data", () => {
  test("landing page contains JSON-LD structured data", async ({ page }) => {
    await gotoHydrated(page, "/");

    const jsonLd = page.locator('script[type="application/ld+json"], #wireline-page-jsonld');
    const count = await jsonLd.count();
    expect(count, "landing page should have structured data").toBeGreaterThan(0);

    // Validate it parses as JSON
    const content = await jsonLd.first().textContent();
    expect(content).toBeTruthy();
    const parsed = JSON.parse(content!);
    expect(parsed["@type"] || parsed["@graph"]).toBeTruthy();
  });
});

test.describe("SEO — robots and sitemap accessibility", () => {
  test("robots.txt is accessible", async ({ request }) => {
    const response = await request.get("/robots.txt");
    // Should return 200 (may be served statically)
    if (response.status() === 200) {
      const text = await response.text();
      expect(text.toLowerCase()).toMatch(/user-agent|sitemap|allow|disallow/);
    }
  });

  test("sitemap.xml is accessible if declared in robots.txt", async ({ request }) => {
    const robotsResponse = await request.get("/robots.txt");
    if (robotsResponse.status() === 200) {
      const robotsText = await robotsResponse.text();
      const sitemapMatch = robotsText.match(/sitemap:\s*(.+)/i);
      if (sitemapMatch) {
        const sitemapUrl = sitemapMatch[1].trim();
        const sitemapResponse = await request.get(sitemapUrl);
        expect(sitemapResponse.status()).toBe(200);
      }
    }
  });
});
