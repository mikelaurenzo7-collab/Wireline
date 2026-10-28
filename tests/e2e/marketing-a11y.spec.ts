import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.setTimeout(150_000);

async function gotoHomepageWithMain(page: Page) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/", { waitUntil: "commit", timeout: 60_000 });
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });

    try {
      await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

test("homepage mobile product and access path has clear branding and no serious axe violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await gotoHomepageWithMain(page);

  await expect(page.locator(".landing-prestige__hero")).toBeVisible();
  await expect(page.getByRole("link", { name: "BotBound home" })).toBeVisible();
  const actions = page.locator(".landing-prestige__hero .landing-prestige__actions");
  await expect(actions.getByRole("link", { name: "GET STARTED" })).toBeVisible();
  await expect(actions.getByRole("link", { name: "See Pricing", exact: true })).toBeVisible();

  const results = await new AxeBuilder({ page }).include("main").analyze();
  const blockingViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );

  expect(blockingViolations).toEqual([]);
});

test("homepage has no axe violations or horizontal overflow at review widths", async ({
  page,
}, info) => {
  const demos = [
    {
      title: "Phone Number",
      text: ["Inbound and outbound", "Could I book for Thursday?", "SMS"],
    },
    { title: "Email Address", text: ["Customer question", "Happy to help."] },
    { title: "A Computer", text: ["This week", "Find an open time"] },
  ];

  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1280, 900],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await gotoHomepageWithMain(page);
    await page.evaluate(() => document.fonts.ready);

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations,
      `axe violations at ${width}px: ${JSON.stringify(results.violations, null, 2)}`,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath(`homepage-${width}.png`), fullPage: true });

    const cards = page.locator(".landing-prestige__card");
    await expect(cards).toHaveCount(3);
    await expect(page.getByRole("tab")).toHaveCount(0);
    for (let index = 0; index < demos.length; index += 1) {
      const card = cards.nth(index);
      await expect(card.getByRole("heading", { name: demos[index]!.title })).toBeVisible();
      for (const text of demos[index]!.text) await expect(card).toContainText(text);
    }
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(dimensions.documentWidth, `${width}px document overflow`).toBeLessThanOrEqual(
      dimensions.clientWidth,
    );
    expect(dimensions.bodyWidth, `${width}px body overflow`).toBeLessThanOrEqual(
      dimensions.clientWidth,
    );
  }
});

test("first-visit privacy choices stay compact on mobile pricing", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() => {
    localStorage.removeItem("wireline_cookie_consent");
    localStorage.removeItem("wireline_marketing_measurement_consent");
  });
  await page.goto("/pricing", { waitUntil: "domcontentloaded" });

  const privacy = page.getByRole("region", { name: "Privacy Choices" });
  await expect(privacy).toBeVisible({ timeout: 10_000 });
  await expect(privacy.getByRole("button", { name: "Essential Only", exact: true })).toBeVisible();
  await expect(privacy.getByRole("button", { name: "Allow Optional", exact: true })).toBeVisible();
  await expect(privacy.getByRole("link", { name: "Privacy", exact: true })).toBeVisible();

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const size = await privacy.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    }));
    expect(
      size.height / size.viewportHeight,
      `privacy notice height at ${width}px`,
    ).toBeLessThanOrEqual(0.13);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(
      dimensions.documentWidth,
      `privacy notice document overflow at ${width}px`,
    ).toBeLessThanOrEqual(dimensions.clientWidth);
    expect(dimensions.bodyWidth, `privacy notice body overflow at ${width}px`).toBeLessThanOrEqual(
      dimensions.clientWidth,
    );
  }

  const results = await new AxeBuilder({ page }).include(".wl-privacy-choices").analyze();
  expect(results.violations).toEqual([]);
});

test("homepage promise and access path stay centered inside the desktop viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await gotoHomepageWithMain(page);

  const headline = page.getByRole("heading", {
    name: "Your next hire is a bot.",
    exact: true,
  });
  await expect(headline).toBeVisible();
  await expect(page.locator(".landing-prestige__hero")).toBeVisible();
  await expect(page.locator(".landing-prestige__showcase-title")).toHaveText("The Bot Gets:");
  await expect(page.locator(".landing-prestige__description")).toHaveCount(0);
  await expect(page.locator(".landing-prestige__directions")).toHaveCount(0);

  const bounds = await page.evaluate(() => {
    const headline = document.querySelector(".landing-prestige__hero h1")?.getBoundingClientRect();
    const actions = document
      .querySelector(".landing-prestige__hero .landing-prestige__actions")
      ?.getBoundingClientRect();
    return {
      headlineLeft: headline?.left ?? -1,
      headlineRight: headline?.right ?? Number.POSITIVE_INFINITY,
      actionsLeft: actions?.left ?? -1,
      actionsRight: actions?.right ?? Number.POSITIVE_INFINITY,
      actionsBottom: actions?.bottom ?? Number.POSITIVE_INFINITY,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(bounds.headlineLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.headlineRight).toBeLessThanOrEqual(bounds.viewportWidth);
  const actionsCenter = (bounds.actionsLeft + bounds.actionsRight) / 2;
  expect(Math.abs(actionsCenter - bounds.viewportWidth / 2)).toBeLessThan(24);
  expect(bounds.actionsBottom).toBeLessThanOrEqual(bounds.viewportHeight);
});

test("homepage static examples stay visible and signup remains one action away", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await gotoHomepageWithMain(page);

  const pricing = page.getByRole("link", { name: "See Pricing", exact: true });
  await pricing.focus();
  await expect(pricing).toBeFocused();
  const focusStyle = await pricing.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2);

  await expect(page.locator(".marketing-chrome-bar")).toHaveCount(0);
  await expect(page.locator(".landing-prestige__card")).toHaveCount(3);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.locator(".landing-prestige__card").nth(0)).toContainText("SMS");

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHomepageWithMain(page);
  await expect(page.locator(".landing-prestige__card")).toHaveCount(3);
  await page.locator(".landing-prestige__card").first().scrollIntoViewIfNeeded();
  await expect(page.locator(".landing-prestige__card").first()).toBeInViewport();
  const start = page
    .locator(".landing-prestige__hero .landing-prestige__actions")
    .getByRole("link", { name: "GET STARTED" });
  await start.click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toBeVisible();
});

test("homepage channels stay clear and readable without decorative labels at 320px", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await gotoHomepageWithMain(page);
  await page.evaluate(() => document.fonts.ready);

  const hero = page.locator(".landing-prestige__hero");
  await expect(hero.locator("p")).toHaveCount(0);
  await expect(page.locator(".landing-prestige__showcase-title")).toHaveText("The Bot Gets:");
  await expect(hero.getByText("Choose calls, email, or both.", { exact: true })).toHaveCount(0);
  await expect(hero.getByText("For life. For work.", { exact: true })).toHaveCount(0);
  await expect(page.locator("main").getByText("Life + work", { exact: true })).toHaveCount(0);
  await expect(
    page
      .locator(".landing-prestige__role-card")
      .getByText(/^(For You|For Your Business|Your Choice)$/),
  ).toHaveCount(0);
  await expect(hero.getByRole("link", { name: "GET STARTED" })).toHaveAttribute("href", "/signup");
  const cards = page.locator(".landing-prestige__card");
  await expect(cards).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("landing-channel-cards-320.png"), fullPage: true });

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page.locator(".landing-prestige__showcase-title").scrollIntoViewIfNeeded();
  const enlargedWidth = await page.evaluate(() => innerWidth);
  const enlargedControls = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        ".landing-prestige__title-line, .landing-prestige__card",
      ),
    ].map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        text: element.textContent,
        left: bounds.left,
        right: bounds.right,
        client: element.clientWidth,
        scroll: element.scrollWidth,
      };
    }),
  );
  for (const control of enlargedControls) {
    expect(control.left, control.text ?? "").toBeGreaterThanOrEqual(0);
    expect(control.right, control.text ?? "").toBeLessThanOrEqual(enlargedWidth);
    expect(control.scroll, control.text ?? "").toBeLessThanOrEqual(control.client + 1);
  }
  await expect(hero.getByRole("link", { name: "GET STARTED" })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("landing-channel-cards-320-enlarged.png"),
    fullPage: true,
  });
});

test("public titles retain authored title case and heading semantics", async ({ page }) => {
  await page.goto("/trust");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("text-transform", "none");
  await expect(
    page.getByRole("heading", { name: "Tenant Isolation", level: 2, exact: true }),
  ).toHaveCSS("text-transform", "none");
  await page.locator("summary").filter({ hasText: "Technical Details" }).click();
  const extension = page.getByRole("heading", {
    name: "BotBound Command (Browser Extension)",
    level: 2,
    exact: true,
  });
  await expect(extension).toBeVisible();
  await expect(extension).toHaveText("BotBound Command (Browser Extension)");
  await expect(extension).toHaveCSS("text-transform", "none");

  await page.goto("/changelog");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("text-transform", "none");
  await page.getByRole("button", { name: "Earlier Updates", exact: true }).click();
  const monitoring = page.getByRole("heading", {
    name: "BotBound Runtime Monitoring",
    level: 2,
    exact: true,
  });
  await expect(monitoring).toHaveText("BotBound Runtime Monitoring");
  await expect(monitoring).toHaveCSS("text-transform", "none");
});
