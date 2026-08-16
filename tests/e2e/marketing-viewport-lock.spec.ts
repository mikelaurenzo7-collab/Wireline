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
    const device = document.querySelector(".landing-phone__device");
    const title = document.querySelector(".landing-stage__title");
    const phoneRect = phone?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    const header = document.querySelector(".marketing-surface > header");
    const call = document.querySelector(".landing-phone__call");
    const homeBar = document.querySelector(".landing-phone__home");
    const face = document.querySelector(".landing-phone__face");
    const tray = document.querySelector(".landing-os__tray");
    const callRect = call?.getBoundingClientRect();
    const homeRect = homeBar?.getBoundingClientRect();
    const faceRect = face?.getBoundingClientRect();
    const trayRect = tray?.getBoundingClientRect();
    const deviceStyle = device ? getComputedStyle(device) : null;
    const phoneStyle = phone ? getComputedStyle(phone) : null;
    return {
      docOverflow: root.scrollHeight - root.clientHeight,
      bodyOverflow: body.scrollHeight - body.clientHeight,
      flowOverflow: flow ? flow.scrollHeight - flow.clientHeight : 0,
      phoneHeight: phoneRect?.height ?? 0,
      phoneWidth: phoneRect?.width ?? 0,
      phoneTop: phoneRect?.top ?? 0,
      phoneBottom: phoneRect?.bottom ?? 0,
      titleTop: titleRect?.top ?? 0,
      titleBottom: titleRect?.bottom ?? 0,
      headerCount: header ? 1 : 0,
      callWidth: callRect?.width ?? 0,
      callHeight: callRect?.height ?? 0,
      callLeft: callRect?.left ?? 0,
      homeBottom: homeRect?.bottom ?? 0,
      homeHeight: homeRect?.height ?? 0,
      homeTop: homeRect?.top ?? 0,
      faceLeft: faceRect?.left ?? 0,
      faceRight: faceRect?.right ?? 0,
      faceHeight: faceRect?.height ?? 0,
      trayBottom: trayRect?.bottom ?? 0,
      deviceRadius: deviceStyle ? Number.parseFloat(deviceStyle.borderTopLeftRadius) : 0,
      phonePad: phoneStyle ? Number.parseFloat(phoneStyle.paddingTop) : 0,
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

test("home phone stage fills the canvas without inner scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await openCanvas(page, "/");

  await expect(page.locator(".landing-stage__dock")).toBeVisible();
  await expect(page.locator(".landing-phone")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Agent work lane" })).toBeVisible();

  const metrics = await viewportMetrics(page);
  expect(metrics.flowOverflow, "home marketing-flow must not scroll").toBeLessThanOrEqual(8);
  expect(metrics.headerCount, "home has no site header around the glass").toBe(0);
  expect(metrics.phoneHeight).toBeGreaterThan(metrics.viewportHeight * 0.92);
  expect(metrics.phoneWidth).toBeGreaterThan(metrics.viewportWidth * 0.92);
  expect(metrics.titleTop, "headline lives inside the glass").toBeGreaterThan(metrics.phoneTop);
  expect(metrics.titleBottom).toBeLessThan(metrics.phoneBottom);
  expect(metrics.phonePad, "iPad glass is inset from the window").toBeGreaterThan(12);
  expect(metrics.deviceRadius, "iPad glass is rounded").toBeGreaterThan(16);
  expect(metrics.homeHeight, "home indicator is on the glass").toBeGreaterThan(3);
  expect(metrics.homeBottom).toBeLessThanOrEqual(metrics.viewportHeight + 2);
  expect(metrics.trayBottom, "dock stays on the glass").toBeLessThan(metrics.homeTop + 2);
  expect(metrics.faceRight, "Jordan sits in the left pane on iPad").toBeLessThan(
    metrics.callLeft + 8,
  );
});

test("home phone stage still fits a short laptop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openCanvas(page, "/");
  await expect(page.locator(".landing-phone")).toBeVisible();
  const metrics = await viewportMetrics(page);
  expect(metrics.docOverflow).toBeLessThanOrEqual(2);
  expect(metrics.flowOverflow).toBeLessThanOrEqual(12);
  expect(metrics.phoneHeight).toBeGreaterThan(metrics.viewportHeight * 0.92);
  expect(metrics.phoneWidth).toBeGreaterThan(metrics.viewportWidth * 0.92);
  expect(metrics.callHeight, "answer control must stay circular on a short laptop").toBeGreaterThan(
    52,
  );
  expect(Math.abs(metrics.callHeight - metrics.callWidth)).toBeLessThan(8);
  expect(metrics.homeBottom).toBeLessThanOrEqual(metrics.viewportHeight + 2);
  expect(metrics.homeHeight, "home indicator stays on a short laptop").toBeGreaterThan(3);
});

test("home hides the chrome bar and does not scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCanvas(page, "/");
  await expect(page.locator(".landing-phone")).toBeVisible();
  await expect(page.locator(".marketing-chrome-bar")).toHaveCount(0);
  await expect(page.locator(".marketing-surface > header")).toHaveCount(0);
  await expect(page.locator(".landing-os__tray")).toBeVisible();
  await expect(page.locator(".sr-only .landing-stage__loop")).toHaveCount(1);
  await expect(page.locator(".landing-stage__loop")).toContainText("Launch");
  await expect(page.locator(".landing-stage__loop")).not.toContainText("Improve");
  await expect(page.locator(".sr-only.landing-phone__role")).toHaveCount(1);
  const metrics = await viewportMetrics(page);
  expect(metrics.docOverflow, "home document scrollbar on phone").toBeLessThanOrEqual(2);
  expect(metrics.bodyOverflow, "home body scrollbar on phone").toBeLessThanOrEqual(2);
  expect(metrics.flowOverflow, "home marketing-flow must not scroll on phone").toBeLessThanOrEqual(
    8,
  );
  expect(metrics.phoneHeight).toBeGreaterThan(metrics.viewportHeight * 0.92);
  expect(metrics.phoneWidth).toBeGreaterThan(metrics.viewportWidth * 0.92);
  expect(metrics.titleTop, "headline lives inside the glass").toBeGreaterThan(metrics.phoneTop);
  expect(metrics.homeHeight, "home indicator is on the glass").toBeGreaterThan(3);
  expect(metrics.homeBottom).toBeLessThanOrEqual(metrics.viewportHeight + 2);
});

test("home island names Wireline and opens a closable sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCanvas(page, "/");
  await expect(page.locator(".landing-phone__wordmark")).toHaveText("Wireline");
  await page.getByRole("button", { name: "Wireline menu" }).click();
  const sheet = page.locator("#wireline-mobile-navigation");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".wl-overline")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Close" })).toBeVisible();
  const sheetBox = await sheet.boundingBox();
  expect(sheetBox, "island sheet is on screen").toBeTruthy();
  expect(sheetBox!.height, "island sheet stays a compact card").toBeLessThan(844 * 0.62);
  expect(sheetBox!.width, "island sheet is not full-bleed").toBeLessThan(380);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
});

test("home island sheet stays a compact card on the iPad canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await openCanvas(page, "/");
  await page.getByRole("button", { name: "Wireline menu" }).click();
  const sheet = page.locator("#wireline-mobile-navigation");
  await expect(sheet).toBeVisible();
  const sheetBox = await sheet.boundingBox();
  expect(sheetBox).toBeTruthy();
  expect(sheetBox!.height, "island sheet does not swallow the iPad").toBeLessThan(900 * 0.58);
  expect(sheetBox!.width, "island sheet hangs from the island").toBeLessThan(420);
  expect(
    Math.abs(sheetBox!.x + sheetBox!.width / 2 - 1365 / 2),
    "island sheet is centered under the island",
  ).toBeLessThan(48);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
});

test("home answer control stays circular on a short wide laptop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await openCanvas(page, "/");
  const metrics = await viewportMetrics(page);
  expect(metrics.docOverflow).toBeLessThanOrEqual(2);
  expect(metrics.callHeight).toBeGreaterThan(52);
  expect(Math.abs(metrics.callHeight - metrics.callWidth)).toBeLessThan(8);
  expect(metrics.homeBottom).toBeLessThanOrEqual(metrics.viewportHeight + 2);
  expect(metrics.homeHeight).toBeGreaterThan(3);
  expect(metrics.faceRight, "short iPad still keeps Jordan left of the answer").toBeLessThan(
    metrics.callLeft + 8,
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
