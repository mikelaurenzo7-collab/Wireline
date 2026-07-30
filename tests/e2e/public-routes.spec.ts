import { expect, test } from "@playwright/test";

/**
 * Launch-route smoke — every public surface must serve, render its heading,
 * and stay free of page errors. Runs against the built server (see
 * playwright.config.ts webServer) and needs no database: marketing pages,
 * auth portal, and the health probe are DB-independent.
 */

const PUBLIC_ROUTES = [
  "/",
  "/features",
  "/pricing",
  "/showcase",
  "/compare",
  "/about",
  "/blog",
  "/changelog",
  "/security",
  "/trust",
  "/status",
  "/support",
  "/contact",
  "/privacy",
  "/terms",
  "/developers",
  "/signin",
  "/signup",
  "/reset-password?token=e2e-smoke",
  "/trust/medical",
  "/trust/legal",
  "/trust/insurance",
  "/trust/enterprise",
  "/for/personal",
  "/for/home-services",
  "/for/medical",
  "/for/legal",
  "/for/real-estate",
  "/for/insurance",
  "/for/restaurants",
  "/for/sales",
  "/solutions/support",
  "/solutions/sales",
  "/404",
  "/not-found",
];

for (const route of PUBLIC_ROUTES) {
  test(`renders ${route}`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    const response = await page.goto(route, { waitUntil: "load" });
    expect(response, `no response for ${route}`).toBeTruthy();
    expect(response!.status(), `status for ${route}`).toBeLessThan(400);

    await expect(
      page.locator("main#main-content h1, main#main-content h2, main h1, main h2, h1, h2").first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(pageErrors, `page errors on ${route}`).toEqual([]);
  });
}

/**
 * The marketing prerender writes per-route directories under dist/
 * (dist/pricing/index.html, dist/for/<slug>/index.html). express.static answers
 * a directory hit that lacks a trailing slash with a 301 to the slash form, so
 * without `redirect: false` every prerendered route began redirecting — to a URL
 * that disagreed with the canonical tag the same build writes into that page.
 * Assert the served response directly: no redirect, and the route's own head.
 */
const PRERENDERED_HEAD = [
  { route: "/pricing", title: "Pricing | Wireline AI Voice Agents from $19/month" },
  { route: "/features", title: "Features | Wireline AI Voice Agents" },
  { route: "/for/legal", title: "Wireline for Law Firms | AI Intake and Consult Routing" },
];

for (const { route, title } of PRERENDERED_HEAD) {
  test(`serves ${route} without a redirect and with its own head`, async ({ request }) => {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status(), `status for ${route}`).toBe(200);

    const html = await response.text();
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain(`<link rel="canonical" href="https://trywireline.com${route}" />`);
  });
}

test("health probe reports status honestly", async ({ request }) => {
  const response = await request.get("/api/health");
  const body = await response.json();
  expect(typeof body.ok).toBe("boolean");
  // 200 when healthy, 503 when degraded — the status must match the body.
  expect(response.status()).toBe(body.ok ? 200 : 503);
});

test("security headers are present", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
});

test("unknown anonymous path renders the public 404 instead of sign-in", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist", {
    waitUntil: "domcontentloaded",
  });
  expect(response!.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/this-route-does-not-exist$/);
  await expect(page.getByRole("heading", { name: /Welcome back/i })).toHaveCount(0);
});
