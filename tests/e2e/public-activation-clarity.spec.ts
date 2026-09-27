import { expect, test, type Page } from "@playwright/test";

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
  plans: ["voice", "email", "voice-email", "voice-regular", "voice-email-regular"].map((id) => ({
    id,
    contact_sales: false,
    configured: true,
    annual_configured: true,
  })),
};

test("paused activation stays explicit from the homepage through paid signup", async ({ page }) => {
  await mockPublicAccount(page, { ...paidPlans, checkout_available: false });
  await page.goto("/");
  const access = page.getByRole("region", { name: "Account access" });
  await expect(access.getByRole("status")).toHaveText(
    "Build free. Paid activation is currently unavailable.",
  );
  await page.getByRole("link", { name: "Set up Calls", exact: true }).click();
  await expect(page).toHaveURL(/\/signup\?plan=voice/);
  await expect(access.getByRole("status")).toHaveText(
    "Build free. Paid activation is currently unavailable.",
  );
  await expect(access).toContainText("$59/month");
  await page.getByRole("link", { name: "Pricing", exact: true }).click();
  await expect(
    page.getByText("Build free. Paid activation is currently unavailable."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Build with these channels", exact: true }),
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
    await expect(
      page.getByRole("region", { name: "Account access" }).getByRole("status"),
    ).toHaveText("Activation status unavailable. Build free and check back.");
    await expect(page.getByRole("link", { name: "Set up Calls", exact: true })).toBeVisible();
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
  await expect(access).toContainText("$150/year");
  await expect(access.getByRole("status")).toHaveText(
    "Build free. Paid activation is currently unavailable.",
  );
  await page.getByRole("link", { name: "BotBound home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(access).toContainText("$150/year");
  await expect(access.getByRole("status")).toHaveText(
    "Build free. Paid activation is currently unavailable.",
  );
  await page.goto("/signup?plan=voice&interval=month");
  await expect(access.getByRole("status")).toHaveText("Build free. Activate when ready.");
});

test("the mobile homepage keeps activation status inside the visible account flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockPublicAccount(page, { ...paidPlans, checkout_available: false });
  await page.goto("/");
  const access = page.getByRole("region", { name: "Account access" });
  const notice = access.getByRole("status");
  await expect(notice).toHaveText("Build free. Paid activation is currently unavailable.");
  await expect(notice).toBeVisible();
  await expect(
    access.getByRole("button", { name: "Create Account", exact: true }).last(),
  ).toBeVisible();
  expect(await notice.evaluate((element) => element.scrollWidth <= element.clientWidth + 2)).toBe(
    true,
  );
});
