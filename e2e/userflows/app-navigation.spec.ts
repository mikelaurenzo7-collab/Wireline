import { test, expect } from "@playwright/test";
import { dismissCookieNotice } from "../helpers/auth";
import { expectNoViewCrash } from "../helpers/shell";

/**
 * Deep navigation + hub tabs + admin strip. Runs in `chromium-authed` only
 * (saved session from `e2e/auth.setup.ts`).
 */
test.describe.serial("Full app navigation @auth-desktop", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await dismissCookieNotice(page);
  });

  const primaryRoutes = [
    ["/command", /command|signal|fleet|WIRELINE/i],
    ["/", /command|signal|fleet|WIRELINE/i],
    ["/dashboard", /dashboard|fleet|signal|brief|WIRELINE/i],
    ["/live", /live|call|monitor|WIRELINE/i],
    ["/triage", /triage|inbox|queue|WIRELINE/i],
    ["/insights", /Insight|funnel|WIRELINE/i],
    ["/logs", /log|call|history|WIRELINE/i],
    ["/outbound", /outbound|campaign|dial|WIRELINE/i],
    ["/inbox", /inbox|email|thread|WIRELINE/i],
    ["/appointments", /appointment|calendar|WIRELINE/i],
    ["/train", /train|lesson|WIRELINE/i],
    ["/knowledge", /knowledge|fact|WIRELINE/i],
    ["/agents", /agent|fleet|template|WIRELINE/i],
    ["/integrations", /integration|connect|WIRELINE/i],
    ["/admin", /settings|admin|WIRELINE/i],
    ["/dnc", /DNC List|Blocked|WIRELINE/i],
    ["/audit", /audit|log|WIRELINE/i],
    ["/contact/15551234567", /Contact not found|Back to Atlas|Contact Profile|WIRELINE/i],
  ] as const;

  test("primary routes load without error boundary", async ({ page }) => {
    for (const [path, contentPattern] of primaryRoutes) {
      await test.step(`visit ${path}`, async () => {
        await page.goto(path);
        await page.waitForLoadState("domcontentloaded");
        await expectNoViewCrash(page);
        await expect(page.getByText(contentPattern).first()).toBeVisible({ timeout: 30_000 });
      });
    }
  });

  test("Channels hub tabs navigate", async ({ page }) => {
    await page.goto("/logs");
    await expectNoViewCrash(page);
    for (const label of ["Outbound", "Email", "Appointments"] as const) {
      await page
        .getByRole("navigation", { name: /channels sub-navigation/i })
        .getByRole("link", { name: label })
        .click();
      await page.waitForLoadState("domcontentloaded");
      await expectNoViewCrash(page);
    }
  });

  test("Training hub tabs navigate", async ({ page }) => {
    await page.goto("/train");
    await expectNoViewCrash(page);
    await page
      .getByRole("navigation", { name: /training sub-navigation/i })
      .getByRole("link", { name: "Knowledge" })
      .click();
    await page.waitForLoadState("domcontentloaded");
    await expectNoViewCrash(page);
    await page
      .getByRole("navigation", { name: /training sub-navigation/i })
      .getByRole("link", { name: "Lessons" })
      .click();
    await expectNoViewCrash(page);
  });

  test("System hub tabs navigate", async ({ page }) => {
    await page.goto("/admin");
    await expectNoViewCrash(page);
    for (const label of ["DNC List", "Audit Log", "Settings"] as const) {
      await page
        .getByRole("navigation", { name: /system sub-navigation/i })
        .getByRole("link", { name: label })
        .click();
      await page.waitForLoadState("domcontentloaded");
      await expectNoViewCrash(page);
    }
  });

  test("Admin settings tab strip (all tabs)", async ({ page }) => {
    await page.goto("/admin");
    await expectNoViewCrash(page);
    const tabs = [
      "Branding",
      "Carrier",
      "Billing",
      "Team",
      "Growth",
      "System",
      "Quality",
      "Activity",
    ] as const;
    for (const name of tabs) {
      await page.getByRole("tab", { name }).click();
      await page.waitForTimeout(200);
      await expectNoViewCrash(page);
    }
  });

  test("Floating rail: every primary nav link", async ({ page }) => {
    const labels = [
      "Go to Command Center",
      "Go to Dashboard",
      "Go to Triage",
      "Go to Insights",
      "Go to Agents",
      "Go to Training",
      "Go to Channels",
      "Go to Integrations",
      "Go to Settings",
    ] as const;

    for (const aria of labels) {
      await page.getByRole("link", { name: aria }).click();
      await page.waitForLoadState("domcontentloaded");
      await expectNoViewCrash(page);
    }
  });

  test("Command palette opens and navigates to Fleet", async ({ page }) => {
    await page.goto("/dashboard");
    await expectNoViewCrash(page);
    await page.keyboard.press("Control+KeyK");
    await expect(page.getByPlaceholder(/search commands/i)).toBeVisible({ timeout: 5000 });
    await page.getByText("Fleet Management").click();
    await page.waitForURL(/\/agents/, { timeout: 15_000 });
    await expectNoViewCrash(page);
  });

  test("NotFound view for unknown path", async ({ page }) => {
    await page.goto("/__e2e_unknown_route__/missing");
    await expectNoViewCrash(page);
    await expect(page.getByText(/Page not found|404/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Public legal routes", () => {
  test("/privacy renders", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/privacy/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("/terms renders", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByText(/terms/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
