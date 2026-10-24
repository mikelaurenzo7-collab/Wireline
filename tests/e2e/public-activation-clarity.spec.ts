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

test("homepage gives Email interests a paid plan and setup-review path", async ({ page }) => {
  await mockPublicAccount(page, {
    ...paidPlans,
    plans: paidPlans.plans.map((plan) =>
      plan.id.includes("email")
        ? { ...plan, configured: false, annual_configured: false, contact_sales: true }
        : plan,
    ),
  });
  await page.goto("/");
  const email = page.getByRole("article", { name: "Email plan", exact: true });
  const combined = page.getByRole("article", { name: "Calls + Email plan", exact: true });
  const calls = page.getByRole("article", { name: "Calls plan", exact: true });
  await expect(email).toContainText("$9");
  await expect(combined).toContainText("$25");
  await expect(email.getByRole("link", { name: "Choose Email" })).toHaveAttribute(
    "href",
    "/signup?plan=email",
  );
  await expect(combined.getByRole("link", { name: "Choose Calls + Email" })).toHaveAttribute(
    "href",
    "/signup?plan=voice-email",
  );
  await expect(email.getByRole("link", { name: "setup review" })).toHaveAttribute(
    "href",
    "/contact?topic=email",
  );
  await expect(calls.getByRole("link", { name: "Choose Calls" })).toHaveAttribute(
    "href",
    "/signup?plan=voice",
  );
});

test("paused activation stays explicit from the homepage through paid signup", async ({ page }) => {
  await mockPublicAccount(page, { ...paidPlans, checkout_available: false });
  await page.goto("/");
  await expect(page.locator(".landing-prestige__activation")).toHaveText(
    "Checkout is unavailable right now. Try again shortly.",
  );
  const access = page.getByRole("region", { name: "Account access" });
  await page.getByRole("link", { name: "Set Up Calls", exact: true }).click();
  await expect(page).toHaveURL(/\/signup\?plan=voice/);
  await expect(access.getByRole("status")).toHaveText(
    "Checkout is unavailable right now. Try again shortly.",
  );
  await expect(access).toContainText("$19/month");
  await page.getByRole("link", { name: "Pricing", exact: true }).click();
  await expect(
    page.getByText("Checkout is unavailable right now. Try again shortly."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Set Up These Channels", exact: true }),
  ).toBeVisible();
});

for (const failure of ["http", "malformed"] as const) {
  test(`a ${failure} availability failure does not advertise immediate paid activation`, async ({
    page,
  }) => {
    await mockPublicAccount(
      page,
      failure === "http" ? {} : { plans: null },
      failure === "http" ? 503 : 200,
    );
    await page.goto("/");
    await expect(page.locator(".landing-prestige__activation")).toHaveText(
      "Plan availability could not be checked. Refresh and try again.",
    );
    await expect(page.getByRole("link", { name: "Set Up Calls", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Choose Calls", exact: true })).toHaveCount(0);
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
