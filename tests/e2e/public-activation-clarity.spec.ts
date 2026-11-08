import { expect, test, type Page } from "@playwright/test";
import { SIGNUP_INTENT_STORAGE_KEY } from "../../src/lib/signup-intent";

const SYNTHETIC_SIGNUP_ERROR = "Synthetic signup stopped before account creation.";

async function mockPublicAccount(page: Page, plans: unknown, status = 200) {
  const signups: Array<Record<string, unknown>> = [];
  const checkouts: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/signup") {
      signups.push(route.request().postDataJSON());
      await route.fulfill({ status: 503, json: { error: SYNTHETIC_SIGNUP_ERROR } });
      return;
    }
    if (path === "/api/billing/checkout") checkouts.push(path);
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
  return { signups, checkouts };
}

const paidPlans = {
  stripe_configured: true,
  checkout_available: true,
  plans: ["personal", "voice", "email", "voice-email", "voice-regular", "voice-email-regular"].map(
    (id) => ({ id, contact_sales: false, configured: true, annual_configured: true }),
  ),
};

async function attemptSignup(page: Page) {
  const access = page.getByRole("region", { name: "Account access" });
  await access.getByLabel("Email", { exact: true }).fill("signup-ui@example.test");
  await access.getByLabel("Password", { exact: true }).fill("SyntheticPassword123!");
  await access.getByRole("checkbox", { name: /I agree to the Terms and Privacy Policy/ }).check();
  await access.getByRole("button", { name: "Create Account", exact: true }).last().click();
  await expect(access.getByText(SYNTHETIC_SIGNUP_ERROR, { exact: true })).toBeVisible();
}

test("homepage keeps account entry separate from plan activation and shows its email example", async ({
  page,
}) => {
  const { signups, checkouts } = await mockPublicAccount(page, paidPlans);
  await page.goto("/");
  const email = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Email Address", exact: true }),
  });
  await expect(email).toContainText("Subject: Saturday lock change");
  await expect(email).toContainText("Bot Reply Sent");
  await page
    .locator(".landing-prestige__hero")
    .getByRole("link", { name: "Get Started", exact: true })
    .click();
  await expect(page).toHaveURL(/\/signup$/);
  expect(signups).toEqual([]);
  expect(checkouts).toEqual([]);
});

for (const failure of ["paused", "http", "malformed"] as const) {
  test(`a ${failure} availability response preserves account signup and its selected plan intent`, async ({
    page,
  }) => {
    const { signups, checkouts } = await mockPublicAccount(
      page,
      failure === "paused"
        ? { ...paidPlans, checkout_available: false }
        : failure === "http"
          ? {}
          : { plans: null },
      failure === "http" ? 503 : 200,
    );
    await page.goto("/signup?plan=voice");
    await attemptSignup(page);
    expect(signups).toHaveLength(1);
    expect(signups[0]).toMatchObject({ preferredPlanId: "voice", termsAccepted: true });
    expect(checkouts).toEqual([]);
  });
}

test("annual signup intent survives Home and Back and an explicit interval change replaces it", async ({
  page,
}) => {
  const { signups, checkouts } = await mockPublicAccount(page, {
    ...paidPlans,
    plans: paidPlans.plans.map((plan) => ({ ...plan, annual_configured: plan.id !== "voice" })),
  });
  await page.goto("/signup?plan=voice&interval=year");
  await page.getByRole("link", { name: "BotBound home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/signup\?plan=voice&interval=year/);
  await attemptSignup(page);
  expect(signups[0]).toMatchObject({
    preferredPlanId: "voice",
    preferredBillingInterval: "year",
    termsAccepted: true,
  });
  await page.goto("/signup?plan=voice&interval=month");
  await attemptSignup(page);
  expect(signups).toHaveLength(2);
  expect(signups[1]).toMatchObject({
    preferredPlanId: "voice",
    preferredBillingInterval: "month",
    termsAccepted: true,
  });
  expect(checkouts).toEqual([]);
});

test("mobile signup retains an explicit legacy plan choice and clearing it returns to shared work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const { signups, checkouts } = await mockPublicAccount(page, {
    ...paidPlans,
    checkout_available: false,
  });
  await page.goto("/signup?plan=free");
  await attemptSignup(page);
  expect(signups[0]).toMatchObject({ preferredPlanId: "personal", termsAccepted: true });
  await page.goto("/signup");
  await attemptSignup(page);
  expect(signups[1]).toMatchObject({ preferredPlanId: "personal", termsAccepted: true });
  await page.evaluate((key) => localStorage.removeItem(key), SIGNUP_INTENT_STORAGE_KEY);
  await page.reload();
  await attemptSignup(page);
  expect(signups).toHaveLength(3);
  expect(signups[2]).toMatchObject({
    preferredPlanId: "usage",
    preferredBillingInterval: "month",
    termsAccepted: true,
  });
  expect(checkouts).toEqual([]);
});
