import { expect, test, type Page } from "@playwright/test";
import { SIGNUP_INTENT_STORAGE_KEY } from "../../src/lib/signup-intent";

async function mockPublicAccount(page: Page, plans: unknown, status = 200) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      status: path === "/api/billing/plans" ? status : 200,
      json:
        path === "/api/billing/plans"
          ? plans
          : path === "/api/auth/session"
            ? { user: null }
            : path === "/api/auth/providers"
              ? { providers: { google: true } }
              : {},
    });
  });
}

const paidPlans = {
  stripe_configured: true,
  checkout_available: true,
  plans: ["personal", "voice", "email", "voice-email", "voice-regular", "voice-email-regular"].map(
    (id) => ({
      id,
      contact_sales: false,
      configured: true,
      annual_configured: true,
    }),
  ),
};

test("minimal homepage keeps signup plan-neutral and channel links useful", async ({ page }) => {
  await mockPublicAccount(page, paidPlans);
  await page.goto("/");
  await page.getByRole("tab", { name: "Email", exact: true }).click();
  await expect(page.getByRole("link", { name: "Explore Email", exact: true })).toHaveAttribute(
    "href",
    "/features#email",
  );
  await page.locator("main").getByRole("link", { name: "GET STARTED", exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
});

for (const failure of ["paused", "http", "malformed"] as const) {
  test(`a ${failure} availability response still prevents selected-plan activation`, async ({
    page,
  }) => {
    await mockPublicAccount(
      page,
      failure === "paused"
        ? { ...paidPlans, checkout_available: false }
        : failure === "http"
          ? {}
          : { plans: null },
      failure === "http" ? 503 : 200,
    );
    await page.goto("/signup?plan=voice");
    const access = page.getByRole("region", { name: "Account access" });
    await expect(access.getByRole("status")).toContainText(
      failure === "paused" ? "Checkout is unavailable" : "Plan availability could not be checked",
    );
  });
}

test("signup checks the selected annual plan even when other paid plans are available", async ({
  page,
}) => {
  await mockPublicAccount(page, {
    ...paidPlans,
    plans: paidPlans.plans.map((plan) => ({ ...plan, annual_configured: plan.id !== "voice" })),
  });
  await page.goto("/signup?plan=voice&interval=year");
  const access = page.getByRole("region", { name: "Account access" });
  await expect(access).toContainText("$199/year");
  await expect(access.getByRole("status")).toHaveText(
    "Checkout is unavailable right now. Try again shortly.",
  );
  await page.getByRole("link", { name: "BotBound home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/signup\?plan=voice&interval=year/);
  await expect(access).toContainText("$199/year");
  await expect(access.getByRole("status")).toHaveText(
    "Checkout is unavailable right now. Try again shortly.",
  );
  await page.goto("/signup?plan=voice&interval=month");
  await expect(access.getByRole("status")).toHaveText(
    "Choose a plan and check out. Cancel anytime.",
  );
});

test("mobile paid signup includes Personal status and keeps generic signup neutral", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockPublicAccount(page, { ...paidPlans, checkout_available: false });
  await page.goto("/signup?plan=voice");
  const access = page.getByRole("region", { name: "Account access" });
  const notice = access.getByRole("status");
  await expect(notice).toHaveText("Checkout is unavailable right now. Try again shortly.");
  await expect(notice).toBeVisible();
  await expect(
    access.getByRole("button", { name: "Create Account", exact: true }).last(),
  ).toBeVisible();
  expect(await notice.evaluate((element) => element.scrollWidth <= element.clientWidth + 2)).toBe(
    true,
  );
  await page.goto("/signup?plan=free");
  await expect(access.getByRole("status")).toHaveText(
    "Checkout is unavailable right now. Try again shortly.",
  );
  await expect(access.getByText("Personal · $12/month")).toBeVisible();
  await page.goto("/signup");
  await expect(access.getByText("Personal · $12/month")).toBeVisible();
  await expect(access.getByRole("status")).toHaveText(
    "Checkout is unavailable right now. Try again shortly.",
  );
  // A prior explicit choice resumes; a fresh generic entry has no selected plan.
  await page.evaluate((key) => localStorage.removeItem(key), SIGNUP_INTENT_STORAGE_KEY);
  await page.reload();
  await expect(access.getByRole("status")).toHaveCount(0);
  await expect(
    access.getByRole("button", { name: "Create Account", exact: true }).last(),
  ).toBeVisible();
});

