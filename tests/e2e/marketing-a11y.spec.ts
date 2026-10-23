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
  await expect(actions.getByRole("link", { name: "Get Started" })).toBeVisible();
  await expect(actions.getByRole("link", { name: "Sign In", exact: true })).toBeVisible();

  const results = await new AxeBuilder({ page }).include("main").analyze();
  const blockingViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );

  expect(blockingViolations).toEqual([]);
});

test("homepage promise and access path stay centered inside the desktop viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await gotoHomepageWithMain(page);

  const headline = page.getByRole("heading", {
    name: "VOICE BOTS. REAL WORK.",
    exact: true,
  });
  await expect(headline).toBeVisible();
  await expect(page.locator(".landing-prestige__hero")).toBeVisible();
  await expect(page.locator(".landing-prestige__description")).toHaveText(
    "YOUR BOT GETS THEIR OWN PHONE NUMBER, EMAIL ADDRESS, AND COMPUTER.",
  );
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

test("homepage primary paths expose focus and change state cleanly", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await gotoHomepageWithMain(page);

  const role = page.getByRole("link", { name: /Use this role\s*:\s*Front Desk/i });
  await role.focus();
  await expect(role).toBeFocused();
  const focusStyle = await role.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHomepageWithMain(page);
  const start = page
    .locator(".landing-prestige__hero .landing-prestige__actions")
    .getByRole("link", { name: "Get Started" });
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
  const description = hero.locator(".landing-prestige__description");
  await expect(description).toHaveText(
    "YOUR BOT GETS THEIR OWN PHONE NUMBER, EMAIL ADDRESS, AND COMPUTER.",
  );
  await expect(hero.getByText("Choose the channels you need.", { exact: true })).toBeVisible();
  await expect(hero.getByText("For life. For work.", { exact: true })).toHaveCount(0);
  await expect(page.locator("main").getByText("Life + work", { exact: true })).toHaveCount(0);
  await expect(
    page
      .locator(".landing-prestige__role-card")
      .getByText(/^(For You|For Your Business|Your Choice)$/),
  ).toHaveCount(0);
  await expect(hero.getByRole("link", { name: "Get Started" })).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: /Use this role\s*:\s*Front Desk/i })).toHaveAttribute(
    "href",
    "/signup?template=front-desk",
  );
  await expect(page.getByRole("article", { name: "Personal plan", exact: true })).toContainText(
    "1 number + connected inbox",
  );
  for (const heading of await page.locator(".landing-prestige__section-heading h2").all()) {
    expect(await heading.evaluate((element) => getComputedStyle(element).textTransform)).toBe(
      "uppercase",
    );
  }

  const lineMetrics = () =>
    description.evaluate((element) => {
      const node = element.firstChild!;
      const lines: { top: number; left: number; right: number; words: number }[] = [];
      for (const match of node.textContent!.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        const box = range.getBoundingClientRect();
        const line = lines.find((candidate) => Math.abs(candidate.top - box.top) < 1);
        if (line) {
          line.left = Math.min(line.left, box.left);
          line.right = Math.max(line.right, box.right);
          line.words += 1;
        } else {
          lines.push({ top: box.top, left: box.left, right: box.right, words: 1 });
        }
      }
      return { lines, bounds: element.getBoundingClientRect().toJSON(), width: innerWidth };
    });

  const normal = await lineMetrics();
  expect(normal.lines.length).toBeGreaterThan(1);
  expect(
    normal.lines.every((line) => line.words >= 2),
    "no isolated normal-size word",
  ).toBe(true);
  const widths = normal.lines.map((line) => line.right - line.left);
  expect(Math.min(...widths) / Math.max(...widths), "balanced supporting lines").toBeGreaterThan(
    0.5,
  );
  await page.screenshot({ path: info.outputPath("landing-channels-320.png"), fullPage: true });

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await description.scrollIntoViewIfNeeded();
  const enlarged = await lineMetrics();
  for (const line of enlarged.lines) {
    expect(line.left).toBeGreaterThanOrEqual(enlarged.bounds.left - 1);
    expect(line.right).toBeLessThanOrEqual(enlarged.bounds.right + 1);
    expect(line.left).toBeGreaterThanOrEqual(0);
    expect(line.right).toBeLessThanOrEqual(enlarged.width);
  }
  await expect(hero.getByRole("link", { name: "Get Started" })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("landing-channels-320-enlarged.png"),
    fullPage: true,
  });
});

test("public brand titles retain their case and heading semantics within the uppercase system", async ({
  page,
}) => {
  await page.goto("/trust");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("text-transform", "uppercase");
  await expect(
    page.getByRole("heading", { name: "Tenant Isolation", level: 2, exact: true }),
  ).toHaveCSS("text-transform", "uppercase");
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("text-transform", "uppercase");
  const monitoring = page.getByRole("heading", {
    name: "BotBound Runtime Monitoring",
    level: 2,
    exact: true,
  });
  await expect(monitoring).toHaveText("BotBound Runtime Monitoring");
  await expect(monitoring).toHaveCSS("text-transform", "none");
});
