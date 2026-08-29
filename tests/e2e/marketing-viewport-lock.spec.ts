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
    const prestigeMain = document.querySelector<HTMLElement>(".landing-prestige__main");
    const prestigeEntrance = document.querySelector<HTMLElement>(".landing-prestige__entrance");
    const prestigeHero = document.querySelector<HTMLElement>(".landing-prestige__hero");
    const prestigeAuth = document.querySelector<HTMLElement>(".landing-prestige__auth");
    const prestigeDemo = document.querySelector<HTMLElement>(".landing-demo-inline");
    const prestigeMobileLinks = document.querySelector<HTMLElement>(
      ".landing-prestige__mobile-links",
    );
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
    const prestigeMainRect = rect(prestigeMain);
    const prestigeEntranceRect = rect(prestigeEntrance);
    const prestigeHeroRect = rect(prestigeHero);
    const prestigeAuthRect = rect(prestigeAuth);
    const prestigeDemoRect = rect(prestigeDemo);

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
      prestigeMainLeft: prestigeMainRect?.left ?? 0,
      prestigeMainRight: prestigeMainRect?.right ?? 0,
      prestigeEntranceLeft: prestigeEntranceRect?.left ?? 0,
      prestigeEntranceRight: prestigeEntranceRect?.right ?? 0,
      prestigeHeroWidth: prestigeHeroRect?.width ?? 0,
      prestigeHeroHeight: prestigeHeroRect?.height ?? 0,
      prestigeAuthWidth: prestigeAuthRect?.width ?? 0,
      prestigeAuthHeight: prestigeAuthRect?.height ?? 0,
      prestigeDemoWidth: prestigeDemoRect?.width ?? 0,
      prestigeDemoHeight: prestigeDemoRect?.height ?? 0,
      prestigeEntranceDisplay: prestigeEntrance ? getComputedStyle(prestigeEntrance).display : "",
      prestigeHeroDisplay: prestigeHero ? getComputedStyle(prestigeHero).display : "",
      prestigeMobileLinksDisplay: prestigeMobileLinks
        ? getComputedStyle(prestigeMobileLinks).display
        : "",
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

function expectDocumentInsideViewport(
  metrics: Awaited<ReturnType<typeof publicMetrics>>,
  name: string,
) {
  expect(metrics.rootHorizontalOverflow, `${name} root horizontal overflow`).toBeLessThanOrEqual(2);
  expect(metrics.bodyHorizontalOverflow, `${name} body horizontal overflow`).toBeLessThanOrEqual(2);
}

function expectNoHorizontalEscape(
  metrics: Awaited<ReturnType<typeof publicMetrics>>,
  name: string,
) {
  expectDocumentInsideViewport(metrics, name);
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
    if (path === "/") {
      expectDocumentInsideViewport(metrics, name);
      expect(metrics.prestigeEntranceDisplay).toBe("grid");
      expect(metrics.prestigeMainLeft).toBeGreaterThanOrEqual(-2);
      expect(metrics.prestigeMainRight).toBeLessThanOrEqual(metrics.viewportWidth + 2);
      expect(metrics.prestigeEntranceLeft).toBeGreaterThanOrEqual(-2);
      expect(metrics.prestigeEntranceRight).toBeLessThanOrEqual(metrics.viewportWidth + 2);
      expect(metrics.prestigeHeroWidth).toBeGreaterThan(540);
      expect(metrics.prestigeAuthWidth).toBeGreaterThan(540);
    } else {
      expect(metrics.flowOverflowY).toBe("visible");
      expect(metrics.surfaceOverflow).toBe("visible");
      expect(metrics.headerPosition).toBe("fixed");
      expectNoHorizontalEscape(metrics, name);
    }
  });
}

test("supporting public headers keep both account actions inside a phone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of ["/showcase", "/solutions/support"] as const) {
    await openPublicRoute(page, path);
    const bounds = await page.evaluate(() => {
      const links = Array.from(
        document.querySelectorAll<HTMLElement>('.wl-public-header nav[aria-label="Account"] a'),
      ).map((link) => {
        const rect = link.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });
      return { links, width: window.innerWidth };
    });
    expect(bounds.links).toHaveLength(2);
    for (const link of bounds.links) {
      expect(link.left, `${path} account link left`).toBeGreaterThanOrEqual(-1);
      expect(link.right, `${path} account link right`).toBeLessThanOrEqual(bounds.width + 1);
    }
  }
});

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

  await expect(page.locator(".landing-prestige__entrance")).toBeVisible();
  await expect(page.getByRole("heading", { name: "PUT YOUR BOT ON THE LINE" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk to Jordan" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Account access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create account", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "PICK THE WORK. PUT A BOT ON IT." }),
  ).toBeAttached();

  const metrics = await publicMetrics(page);
  expectDocumentInsideViewport(metrics, "desktop home");
  expect(metrics.prestigeHeroWidth).toBeGreaterThan(540);
  expect(metrics.prestigeHeroHeight).toBeGreaterThanOrEqual(900);
  expect(metrics.prestigeAuthWidth).toBeGreaterThan(540);
  expect(metrics.prestigeAuthHeight).toBeGreaterThanOrEqual(900);
  expect(metrics.prestigeDemoHeight).toBeGreaterThanOrEqual(44);
});

test("home remains usable on a short laptop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPublicRoute(page, "/");
  const metrics = await publicMetrics(page);

  expectDocumentInsideViewport(metrics, "short-laptop home");
  expect(metrics.prestigeHeroWidth).toBeGreaterThan(500);
  expect(metrics.prestigeHeroHeight).toBeGreaterThanOrEqual(800);
  expect(metrics.prestigeAuthWidth).toBeGreaterThan(500);
  expect(metrics.prestigeDemoHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.prestigeDemoWidth).toBeGreaterThan(240);
});

test("home keeps the BotBound promise and account path in one mobile flow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openPublicRoute(page, "/");

  await expect(page.locator(".landing-prestige__hero")).toBeVisible();
  await expect(page.locator(".landing-prestige__desktop-only").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Account access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create account", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Public information" })).toBeVisible();

  const metrics = await publicMetrics(page);
  expectDocumentInsideViewport(metrics, "phone home");
  expect(metrics.prestigeEntranceDisplay).toBe("flex");
  expect(metrics.prestigeHeroDisplay).toBe("grid");
  expect(metrics.prestigeHeroWidth).toBeGreaterThan(320);
  expect(metrics.prestigeAuthWidth).toBeGreaterThan(320);
  expect(metrics.prestigeAuthWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.prestigeMobileLinksDisplay).toBe("flex");
});

test("home demo reflows deliberately at the narrowest supported width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openPublicRoute(page, "/");

  const geometry = await page.evaluate(() => {
    const card = document
      .querySelector<HTMLElement>(".landing-demo-inline")
      ?.getBoundingClientRect();
    const identity = document
      .querySelector<HTMLElement>(".landing-demo-inline__identity")
      ?.getBoundingClientRect();
    const button = document
      .querySelector<HTMLElement>(".landing-demo-inline__button")
      ?.getBoundingClientRect();
    return { card, identity, button, width: window.innerWidth };
  });

  expect(geometry.card).toBeTruthy();
  expect(geometry.identity).toBeTruthy();
  expect(geometry.button).toBeTruthy();
  expect(geometry.card!.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.card!.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.button!.top).toBeGreaterThanOrEqual(geometry.identity!.bottom);
  expect(geometry.button!.width).toBeGreaterThanOrEqual(geometry.card!.width - 30);
});

test("home remains composed on a short wide desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await openPublicRoute(page, "/");
  const metrics = await publicMetrics(page);

  expectDocumentInsideViewport(metrics, "short-wide home");
  expect(metrics.prestigeHeroWidth).toBeGreaterThan(580);
  expect(metrics.prestigeHeroHeight).toBeGreaterThanOrEqual(720);
  expect(metrics.prestigeAuthWidth).toBeGreaterThan(580);
  expect(metrics.prestigeDemoHeight).toBeGreaterThanOrEqual(44);
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

test("showcase demo lines stay inside a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openPublicRoute(page, "/showcase");
  await expect(page.locator("#demo-lines")).toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    cardsInsideViewport: Array.from(document.querySelectorAll<HTMLElement>("#demo-lines a")).every(
      (card) => {
        const rect = card.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= document.documentElement.clientWidth + 0.5;
      },
    ),
  }));

  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.cardsInsideViewport).toBe(true);
});
