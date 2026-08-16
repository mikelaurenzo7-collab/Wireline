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
    const phone = document.querySelector(".landing-phone");
    const phoneRect = phone?.getBoundingClientRect();
    return {
      docOverflow: root.scrollHeight - root.clientHeight,
      bodyOverflow: body.scrollHeight - body.clientHeight,
      flowOverflow: flow ? flow.scrollHeight - flow.clientHeight : 0,
      phoneHeight: phoneRect?.height ?? 0,
      viewportHeight: window.innerHeight,
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

test("home phone stage fills the canvas without inner scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await openCanvas(page, "/");

  await expect(page.locator(".landing-stage__dock")).toBeVisible();
  await expect(page.locator(".landing-phone")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Agent work lane" })).toBeVisible();

  const metrics = await viewportMetrics(page);
  expect(metrics.flowOverflow, "home marketing-flow must not scroll").toBeLessThanOrEqual(8);
  expect(metrics.phoneHeight).toBeGreaterThan(metrics.viewportHeight * 0.42);
});

test("home phone stage still fits a short laptop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openCanvas(page, "/");
  await expect(page.locator(".landing-phone")).toBeVisible();
  const metrics = await viewportMetrics(page);
  expect(metrics.docOverflow).toBeLessThanOrEqual(2);
  expect(metrics.flowOverflow).toBeLessThanOrEqual(12);
  expect(metrics.phoneHeight).toBeGreaterThan(280);
});

test("home hides the chrome bar and does not scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCanvas(page, "/");
  await expect(page.locator(".landing-phone")).toBeVisible();
  await expect(page.locator(".marketing-chrome-bar")).toHaveCount(0);
  await expect(page.locator(".landing-stage__loop")).toBeHidden();
  await expect(page.locator(".landing-stage__loop")).toContainText("Launch");
  await expect(page.locator(".landing-stage__loop")).not.toContainText("Improve");
  await expect(page.locator(".landing-phone__role")).toBeHidden();
  const metrics = await viewportMetrics(page);
  expect(metrics.docOverflow, "home document scrollbar on phone").toBeLessThanOrEqual(2);
  expect(metrics.bodyOverflow, "home body scrollbar on phone").toBeLessThanOrEqual(2);
  expect(metrics.flowOverflow, "home marketing-flow must not scroll on phone").toBeLessThanOrEqual(
    8,
  );
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
