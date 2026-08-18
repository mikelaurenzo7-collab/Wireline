import { expect, test, type Page } from "@playwright/test";

test.setTimeout(150_000);

const PUBLIC_ROUTES = [
  { path: "/", name: "home" },
  { path: "/features", name: "features" },
  { path: "/pricing", name: "pricing" },
  { path: "/showcase", name: "demos" },
] as const;

async function openPublicRoute(page: Page, path: string) {
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

async function publicMetrics(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const flow = document.querySelector<HTMLElement>(".marketing-flow");
    const surface = document.querySelector<HTMLElement>(".marketing-surface");
    const header = document.querySelector<HTMLElement>(".marketing-surface > header");
    const consoleElement = document.querySelector<HTMLElement>(".landing-console");
    const title = document.querySelector<HTMLElement>(".landing-stage__title");
    const call = document.querySelector<HTMLElement>(".landing-demo__button");
    const accountNav = document.querySelector<HTMLElement>('nav[aria-label="Account"]');
    const startFree = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
      (link) => link.textContent?.trim() === "Start Free",
    );
    const rect = (element: Element | null | undefined) => element?.getBoundingClientRect();
    const rootRect = rect(root);
    const bodyRect = rect(body);
    const surfaceRect = rect(surface);
    const headerRect = rect(header);
    const consoleRect = rect(consoleElement);
    const titleRect = rect(title);
    const callRect = rect(call);
    const accountRect = rect(accountNav);
    const startRect = rect(startFree);

    return {
      rootHorizontalOverflow: root.scrollWidth - root.clientWidth,
      bodyHorizontalOverflow: body.scrollWidth - body.clientWidth,
      documentVerticalOverflow: Math.max(root.scrollHeight, body.scrollHeight) - window.innerHeight,
      viewportMode: root.dataset.wirelineViewport || body.dataset.wirelineViewport || "",
      flowOverflowY: flow ? getComputedStyle(flow).overflowY : "",
      surfaceOverflow: surface ? getComputedStyle(surface).overflow : "",
      headerPosition: header ? getComputedStyle(header).position : "",
      rootLeft: rootRect?.left ?? 0,
      bodyLeft: bodyRect?.left ?? 0,
      surfaceLeft: surfaceRect?.left ?? 0,
      surfaceRight: surfaceRect?.right ?? 0,
      headerLeft: headerRect?.left ?? 0,
      headerRight: headerRect?.right ?? 0,
      accountLeft: accountRect?.left ?? 0,
      accountRight: accountRect?.right ?? 0,
      startLeft: startRect?.left ?? 0,
      startRight: startRect?.right ?? 0,
      consoleWidth: consoleRect?.width ?? 0,
      consoleHeight: consoleRect?.height ?? 0,
      consoleLeft: consoleRect?.left ?? 0,
      consoleRight: consoleRect?.right ?? 0,
      titleLeft: titleRect?.left ?? 0,
      titleRight: titleRect?.right ?? 0,
      callWidth: callRect?.width ?? 0,
      callHeight: callRect?.height ?? 0,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
}

function expectNoHorizontalEscape(
  metrics: Awaited<ReturnType<typeof publicMetrics>>,
  name: string,
) {
  expect(metrics.rootHorizontalOverflow, `${name} root horizontal overflow`).toBeLessThanOrEqual(2);
  expect(metrics.bodyHorizontalOverflow, `${name} body horizontal overflow`).toBeLessThanOrEqual(2);
  expect(metrics.surfaceLeft, `${name} surface left edge`).toBeGreaterThanOrEqual(-2);
  expect(metrics.surfaceRight, `${name} surface right edge`).toBeLessThanOrEqual(
    metrics.viewportWidth + 2,
  );
  expect(metrics.headerLeft, `${name} header left edge`).toBeGreaterThanOrEqual(-2);
  expect(metrics.headerRight, `${name} header right edge`).toBeLessThanOrEqual(
    metrics.viewportWidth + 2,
  );
}

for (const { path, name } of PUBLIC_ROUTES) {
  test(`${name} uses document flow without horizontal escape at 1365x900`, async ({ page }) => {
    await page.setViewportSize({ width: 1365, height: 900 });
    await openPublicRoute(page, path);
    const metrics = await publicMetrics(page);

    expect(metrics.viewportMode).toBe("document");
    expect(metrics.flowOverflowY).toBe("visible");
    expect(metrics.surfaceOverflow).toBe("visible");
    expect(metrics.headerPosition).toBe("fixed");
    expectNoHorizontalEscape(metrics, name);
  });
}

test("sign in uses the document auth shell without horizontal escape", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await openPublicRoute(page, "/signin");
  await expect(page.locator(".wl-stitch-auth-shell")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const shell = document.querySelector<HTMLElement>(".wl-stitch-auth-shell");
    const shellRect = shell?.getBoundingClientRect();
    return {
      viewportMode: root.dataset.wirelineViewport || body.dataset.wirelineViewport || "",
      rootHorizontalOverflow: root.scrollWidth - root.clientWidth,
      bodyHorizontalOverflow: body.scrollWidth - body.clientWidth,
      shellLeft: shellRect?.left ?? Number.NEGATIVE_INFINITY,
      shellRight: shellRect?.right ?? Number.POSITIVE_INFINITY,
      rootOverflowY: getComputedStyle(root).overflowY,
      bodyOverflowY: getComputedStyle(body).overflowY,
      viewportWidth: window.innerWidth,
    };
  });

  expect(metrics.viewportMode).toBe("document");
  expect(metrics.rootHorizontalOverflow).toBeLessThanOrEqual(2);
  expect(metrics.bodyHorizontalOverflow).toBeLessThanOrEqual(2);
  expect(metrics.shellLeft).toBeGreaterThanOrEqual(-2);
  expect(metrics.shellRight).toBeLessThanOrEqual(metrics.viewportWidth + 2);
  expect(metrics.rootOverflowY).toMatch(/auto|visible/);
  expect(metrics.bodyOverflowY).toMatch(/auto|visible/);
});

test("home presents a professional desktop buying frame", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await openPublicRoute(page, "/");

  await expect(page.locator(".landing-console")).toBeVisible();
  await expect(page.locator(".landing-stage__title")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Agent work lane" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Build Your Voice Agent" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Hear It Live", exact: true })).toBeVisible();
  await expect(
    page.locator(".landing-demo").getByRole("button", { name: "Hear It Live", exact: true }),
  ).toBeVisible();

  const metrics = await publicMetrics(page);
  expectNoHorizontalEscape(metrics, "desktop home");
  expect(metrics.consoleWidth).toBeGreaterThan(520);
  expect(metrics.consoleHeight).toBeGreaterThan(430);
  expect(metrics.titleLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.titleRight).toBeLessThan(metrics.consoleRight);
});

test("home remains usable on a short laptop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPublicRoute(page, "/");
  const metrics = await publicMetrics(page);

  expectNoHorizontalEscape(metrics, "short-laptop home");
  expect(metrics.consoleHeight).toBeGreaterThan(400);
  expect(metrics.callHeight, "live-demo control keeps a comfortable target").toBeGreaterThanOrEqual(
    44,
  );
  expect(metrics.callWidth).toBeGreaterThan(120);
});

test("home keeps account actions and normal document scrolling on phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openPublicRoute(page, "/");

  await expect(page.locator(".landing-console")).toBeVisible();
  await expect(page.locator(".landing-phone")).toHaveCount(0);
  await expect(page.locator(".landing-os__tray")).toHaveCount(0);
  await expect(page.locator(".marketing-surface > header")).toBeVisible();
  const account = page.getByRole("navigation", { name: "Account" });
  await expect(account.getByRole("link", { name: "Sign In", exact: true })).toBeVisible();
  await expect(account.getByRole("link", { name: "Start Free", exact: true })).toBeVisible();

  const metrics = await publicMetrics(page);
  expectNoHorizontalEscape(metrics, "phone home");
  expect(metrics.documentVerticalOverflow).toBeGreaterThan(0);
  expect(metrics.accountLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.accountRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.startLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.startRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.consoleWidth).toBeGreaterThan(320);

  const scrollPosition = await page.evaluate(() => {
    window.scrollTo(0, 180);
    return window.scrollY;
  });
  expect(scrollPosition, "public document must be mechanically scrollable").toBeGreaterThan(0);
});

test("home remains composed on a short wide desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await openPublicRoute(page, "/");
  const metrics = await publicMetrics(page);

  expectNoHorizontalEscape(metrics, "short-wide home");
  expect(metrics.consoleWidth).toBeGreaterThan(540);
  expect(metrics.consoleHeight).toBeGreaterThan(420);
  expect(metrics.callHeight).toBeGreaterThanOrEqual(44);
});

test("features and pricing remain scrollable without horizontal clipping", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 720 });

  for (const path of ["/features", "/pricing"] as const) {
    await openPublicRoute(page, path);
    const metrics = await publicMetrics(page);
    expectNoHorizontalEscape(metrics, path);
    expect(metrics.documentVerticalOverflow).toBeGreaterThanOrEqual(0);
  }
});
