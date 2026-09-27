import { expect, test, type Page } from "@playwright/test";

test.setTimeout(150_000);

const PUBLIC_ROUTES = [
  { path: "/", name: "home" },
  { path: "/features", name: "features" },
  { path: "/pricing", name: "pricing" },
] as const;

for (const width of [1365, 320]) {
  test(`nested privacy anchors clear the public header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openPublicRoute(page, "/privacy#ccpa");
    const target = page.locator("#ccpa");
    await expect(target).toBeFocused();
    await expect
      .poll(async () => {
        const targetBounds = await target.boundingBox();
        const headerBounds = await page.locator(".wl-public-header").boundingBox();
        return targetBounds!.y - (headerBounds!.y + headerBounds!.height);
      })
      .toBeGreaterThanOrEqual(12);
    await expect(page.getByRole("heading", { name: /California Privacy Rights/ })).toBeInViewport();
  });
}

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
    const accountNav = document.querySelector<HTMLElement>('nav[aria-label="Account"]');
    const prestigeMain = document.querySelector<HTMLElement>(".landing-prestige__main");
    const prestigeEntrance = document.querySelector<HTMLElement>(".landing-prestige__entrance");
    const prestigeHero = document.querySelector<HTMLElement>(".landing-prestige__hero");
    const prestigeAuth = document.querySelector<HTMLElement>(".landing-prestige__auth");
    const prestigeDirections = document.querySelector<HTMLElement>(".landing-prestige__directions");
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
    const accountRect = rect(accountNav);
    const startRect = rect(startFree);
    const prestigeMainRect = rect(prestigeMain);
    const prestigeEntranceRect = rect(prestigeEntrance);
    const prestigeHeroRect = rect(prestigeHero);
    const prestigeAuthRect = rect(prestigeAuth);
    const prestigeDirectionsRect = rect(prestigeDirections);

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
      prestigeDirectionsWidth: prestigeDirectionsRect?.width ?? 0,
      prestigeDirectionsHeight: prestigeDirectionsRect?.height ?? 0,
      prestigeEntranceDisplay: prestigeEntrance ? getComputedStyle(prestigeEntrance).display : "",
      prestigeHeroDisplay: prestigeHero ? getComputedStyle(prestigeHero).display : "",
      prestigeMobileLinksDisplay: prestigeMobileLinks
        ? getComputedStyle(prestigeMobileLinks).display
        : "",
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

test("supporting public headers keep signup and sign-in navigation reachable on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/features", "/solutions/support"] as const) {
    await openPublicRoute(page, path);
    const header = page.locator(".wl-public-header");
    const signup = header.getByRole("link", { name: "Start Free", exact: true });
    const menu = header.getByRole("button", { name: "Open navigation" });
    for (const target of [signup, menu]) {
      await expect(target).toBeVisible();
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await menu.click();
    const signin = page.getByRole("menuitem", { name: "Sign In", exact: true });
    await expect(signin).toBeInViewport();
    await expect(signin).toHaveAttribute("href", "/signin");
    await signin.press("Escape");
    await expect(menu).toBeFocused();
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
  await expect(
    page.locator(".landing-prestige__getting-started, .landing-prestige__steps"),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your Next Hire Is a Bot" })).toBeVisible();
  const directions = page.getByRole("navigation", { name: "Choose Bot direction" });
  await expect(directions.getByText("Find. Call. Book.", { exact: true })).toBeVisible();
  await expect(directions.getByText("Answer. Qualify. Route.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Account access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pick the Work. Put a Bot on It" }),
  ).toBeAttached();

  const metrics = await publicMetrics(page);
  expectDocumentInsideViewport(metrics, "desktop home");
  expect(metrics.prestigeHeroWidth).toBeGreaterThan(540);
  expect(metrics.prestigeHeroHeight).toBeGreaterThanOrEqual(900);
  expect(metrics.prestigeAuthWidth).toBeGreaterThan(540);
  expect(metrics.prestigeAuthHeight).toBeGreaterThanOrEqual(900);
  expect(metrics.prestigeDirectionsHeight).toBeGreaterThanOrEqual(44);
});

test("home remains usable on a short laptop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPublicRoute(page, "/");
  const metrics = await publicMetrics(page);

  expectDocumentInsideViewport(metrics, "short-laptop home");
  expect(metrics.prestigeHeroWidth).toBeGreaterThan(500);
  expect(metrics.prestigeHeroHeight).toBeGreaterThanOrEqual(800);
  expect(metrics.prestigeAuthWidth).toBeGreaterThan(500);
  expect(metrics.prestigeDirectionsHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.prestigeDirectionsWidth).toBeGreaterThan(240);
});

test("home keeps the BotBound promise and account path in one mobile flow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openPublicRoute(page, "/");

  await expect(page.locator(".landing-prestige__hero")).toBeVisible();
  await expect(
    page.locator(".landing-prestige__getting-started, .landing-prestige__steps"),
  ).toHaveCount(0);
  await expect(page.locator(".landing-prestige__desktop-only").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Account access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "Account access mode" })
      .getByRole("button", { name: "Create Account", exact: true }),
  ).toBeVisible();
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

test("home direction choices fit the narrowest supported width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openPublicRoute(page, "/");

  const geometry = await page.evaluate(() => {
    const choices = Array.from(
      document.querySelectorAll<HTMLElement>(".landing-prestige__direction"),
    ).map((element) => element.getBoundingClientRect());
    const group = document
      .querySelector<HTMLElement>(".landing-prestige__directions")
      ?.getBoundingClientRect();
    return { group, choices, width: window.innerWidth };
  });

  expect(geometry.group).toBeTruthy();
  expect(geometry.choices).toHaveLength(2);
  expect(geometry.group!.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.group!.right).toBeLessThanOrEqual(geometry.width + 1);
  for (const choice of geometry.choices) {
    expect(choice.left).toBeGreaterThanOrEqual(geometry.group!.left - 1);
    expect(choice.right).toBeLessThanOrEqual(geometry.group!.right + 1);
    expect(choice.width).toBeGreaterThan(100);
  }
});

test("home remains composed on a short wide desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await openPublicRoute(page, "/");
  const metrics = await publicMetrics(page);

  expectDocumentInsideViewport(metrics, "short-wide home");
  expect(metrics.prestigeHeroWidth).toBeGreaterThan(580);
  expect(metrics.prestigeHeroHeight).toBeGreaterThanOrEqual(720);
  expect(metrics.prestigeAuthWidth).toBeGreaterThan(580);
  expect(metrics.prestigeDirectionsHeight).toBeGreaterThanOrEqual(44);
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

test("showcase redirects into free account creation without horizontal escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openPublicRoute(page, "/showcase");
  await expect(page).toHaveURL(/\/signup\?plan=free$/);
  await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toBeVisible();
  await expect(page.locator("#showcase-preview")).toHaveCount(0);
  const metrics = await publicMetrics(page);
  expectDocumentInsideViewport(metrics, "showcase redirect");
});
