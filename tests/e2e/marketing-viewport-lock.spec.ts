import { expect, test, type Page } from "@playwright/test";

test.setTimeout(150_000);

const CANVASES = [
  { path: "/", name: "home" },
  { path: "/features", name: "features" },
  { path: "/pricing", name: "pricing" },
  { path: "/showcase", name: "demos" },
  { path: "/signin", name: "sign in" },
] as const;

async function openCanvas(page: Page, path: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(path, { waitUntil: "commit", timeout: 60_000 });
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });
    try {
      await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole("heading", { name: "Loading", exact: true })).toHaveCount(0, {
        timeout: 60_000,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function viewportMetrics(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const flow = document.querySelector(".marketing-flow");
    const consoleElement = document.querySelector(".landing-console");
    const title = document.querySelector(".landing-stage__title");
    const header = document.querySelector(".marketing-surface > header");
    const call = document.querySelector(".landing-demo__button");
    const footer = document.querySelector(".landing-stage__footer");
    const rail = document.querySelector(".landing-stage__rail");
    const activity = document.querySelector(".landing-console__activity");
    const consoleRect = consoleElement?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    const callRect = call?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const railRect = rail?.getBoundingClientRect();
    const activityRect = activity?.getBoundingClientRect();

    return {
      docOverflow: root.scrollHeight - root.clientHeight,
      bodyOverflow: body.scrollHeight - body.clientHeight,
      flowOverflow: flow ? flow.scrollHeight - flow.clientHeight : 0,
      headerCount: header ? 1 : 0,
      consoleWidth: consoleRect?.width ?? 0,
      consoleHeight: consoleRect?.height ?? 0,
      consoleLeft: consoleRect?.left ?? 0,
      consoleRight: consoleRect?.right ?? 0,
      consoleBottom: consoleRect?.bottom ?? 0,
      titleLeft: titleRect?.left ?? 0,
      titleRight: titleRect?.right ?? 0,
      callWidth: callRect?.width ?? 0,
      callHeight: callRect?.height ?? 0,
      footerBottom: footerRect?.bottom ?? 0,
      railWidth: railRect?.width ?? 0,
      activityWidth: activityRect?.width ?? 0,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
}

for (const { path, name } of CANVASES) {
  test(`${name} keeps the window as the frame at 1365x900`, async ({ page }) => {
    await page.setViewportSize({ width: 1365, height: 900 });
    await openCanvas(page, path);
    const metrics = await viewportMetrics(page);
    expect(metrics.docOverflow, `${name} document scrollbar`).toBeLessThanOrEqual(2);
    expect(metrics.bodyOverflow, `${name} body scrollbar`).toBeLessThanOrEqual(2);
  });
}

test("home presents a professional desktop buying frame", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await openCanvas(page, "/");

  await expect(page.locator(".landing-console")).toBeVisible();
  await expect(page.locator(".landing-stage__title")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Agent work lane" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Site" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Build Your Voice Agent" }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Hear It Live/i }).or(
      page.getByRole("link", { name: /Hear It Live/i }),
    ),
  ).toBeVisible();

  const metrics = await viewportMetrics(page);
  expect(metrics.flowOverflow, "desktop home should fit its bounded frame").toBeLessThanOrEqual(16);
  expect(metrics.headerCount, "home uses the shared public header").toBe(1);
  expect(metrics.railWidth).toBeGreaterThan(1100);
  expect(metrics.consoleWidth).toBeGreaterThan(520);
  expect(metrics.consoleHeight).toBeGreaterThan(430);
  expect(metrics.activityWidth).toBeGreaterThan(240);
  expect(metrics.titleRight, "headline stays in the narrative column").toBeLessThan(
    metrics.consoleLeft + 56,
  );
  expect(metrics.footerBottom).toBeLessThanOrEqual(metrics.viewportHeight + 2);
});

test("home stays composed on a short laptop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openCanvas(page, "/");
  const metrics = await viewportMetrics(page);
  expect(metrics.docOverflow).toBeLessThanOrEqual(2);
  expect(metrics.bodyOverflow).toBeLessThanOrEqual(2);
  expect(metrics.flowOverflow).toBeLessThanOrEqual(24);
  expect(metrics.headerCount).toBe(1);
  expect(metrics.consoleHeight).toBeGreaterThan(400);
  expect(metrics.callHeight, "live-demo control keeps a comfortable target").toBeGreaterThanOrEqual(
    44,
  );
  expect(metrics.callWidth).toBeGreaterThan(120);
  expect(metrics.consoleBottom).toBeLessThanOrEqual(metrics.viewportHeight + 2);
});

test("home uses normal navigation and a bounded inner scroll on phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCanvas(page, "/");

  await expect(page.locator(".landing-console")).toBeVisible();
  await expect(page.locator(".landing-phone")).toHaveCount(0);
  await expect(page.locator(".landing-os__tray")).toHaveCount(0);
  await expect(page.locator(".marketing-surface > header")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();

  const metrics = await viewportMetrics(page);
  expect(metrics.docOverflow, "phone document scrollbar").toBeLessThanOrEqual(2);
  expect(metrics.bodyOverflow, "phone body scrollbar").toBeLessThanOrEqual(2);
  expect(metrics.flowOverflow, "mobile story scrolls only inside the frame").toBeGreaterThan(0);
  expect(metrics.headerCount).toBe(1);
  expect(metrics.consoleWidth).toBeGreaterThan(330);

  await page.getByRole("button", { name: "Open navigation" }).click();
  const sheet = page.locator("#wireline-mobile-navigation");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Features" })).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(sheet).toHaveCount(0);
});

test("home remains composed on a short wide desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await openCanvas(page, "/");
  const metrics = await viewportMetrics(page);
  expect(metrics.docOverflow).toBeLessThanOrEqual(2);
  expect(metrics.bodyOverflow).toBeLessThanOrEqual(2);
  expect(metrics.flowOverflow).toBeLessThanOrEqual(24);
  expect(metrics.headerCount).toBe(1);
  expect(metrics.consoleWidth).toBeGreaterThan(540);
  expect(metrics.consoleHeight).toBeGreaterThan(420);
  expect(metrics.callHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.footerBottom).toBeLessThanOrEqual(metrics.viewportHeight + 2);
});

test("features canvas stays inside 1365x900", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await openCanvas(page, "/features");
  const metrics = await viewportMetrics(page);
  expect(metrics.docOverflow).toBeLessThanOrEqual(2);
  expect(metrics.flowOverflow).toBeLessThanOrEqual(24);
});

test("pricing opens as one plan canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await openCanvas(page, "/pricing");
  await expect(page.getByRole("heading", { name: "Starter", exact: true })).toBeVisible();
  await expect(page.getByText("Channel rules and launch questions")).toBeVisible();
  const metrics = await viewportMetrics(page);
  expect(metrics.docOverflow).toBeLessThanOrEqual(2);
  expect(metrics.flowOverflow, "collapsed pricing must fit the canvas").toBeLessThanOrEqual(32);
});
