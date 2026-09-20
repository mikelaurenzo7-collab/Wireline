import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function mockWorkspace(page: Page) {
  // Isolated UI fixtures: no live account, database, billing, or provider calls.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json =
      path === "/api/auth/session"
        ? { user: { id: "design-owner", email: "owner@example.test" } }
        : path === "/api/agents"
          ? {
              agents: [
                {
                  id: "design-bot",
                  name: "Front Desk",
                  role: "receptionist",
                  mark_key: "spark-rose",
                },
              ],
            }
          : path === "/api/agent-config/design-bot"
            ? { personality: "Clear", directives: [], mark_key: "spark-rose" }
            : { accounts: [], data: [], numbers: [], integrations: [], messages: [], threads: [] };
    await route.fulfill({ json });
  });
}

async function capture(page: Page, info: TestInfo, name: string) {
  if (!process.env.BOTBOUND_DESIGN_PROOF_DIR) return;
  await mkdir(process.env.BOTBOUND_DESIGN_PROOF_DIR, { recursive: true });
  const path = join(process.env.BOTBOUND_DESIGN_PROOF_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

for (const width of [320, 390, 1440]) {
  test(`Bot creation stays compact and preserves custom intent at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await mockWorkspace(page);
    await page.goto("/studio?create=1");
    const dialog = page.getByRole("dialog", { name: "What should your Bot do?" });
    await expect(dialog.getByRole("heading", { name: "What should your Bot do?" })).toBeFocused();
    const role = dialog.getByRole("combobox", { name: "Bot role starters" });
    const brief = dialog.getByRole("textbox", { name: "Describe the Job" });
    await role.selectOption("front-desk");
    await expect(brief).not.toHaveValue("");
    const supplied = "Book repairs only after checking the customer's ZIP code.";
    await brief.fill(supplied);
    await role.selectOption("appointment-setter");
    await expect(brief).toHaveValue(supplied);
    await expect(dialog.getByRole("textbox", { name: /Bot Name/ })).toBeHidden();
    await expect(dialog.getByRole("button", { name: "Create Bot", exact: true })).toBeInViewport();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await capture(page, info, `create-${width}`);
    const identity = dialog.getByRole("button", { name: /Name & appearance/ });
    await identity.click();
    await dialog.getByRole("textbox", { name: /Bot Name/ }).fill("Repair Desk");
    await identity.click();
    await expect(identity).toContainText("Repair Desk");
    await expect(brief).toHaveValue(supplied);
    await identity.press("Escape");
    await expect(dialog).toBeHidden();
  });
}

test("Studio setup edits survive Review and closing the inspector without saving", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockWorkspace(page);
  await page.goto("/studio?agent=design-bot&section=setup");
  await page.getByLabel("Opening greeting").fill("Welcome to the repair desk.");
  await page.getByLabel(/Knowledge and rules/).fill("Ask for the appliance model before booking.");
  await page.getByRole("button", { name: "Warm", exact: true }).click();
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page.getByRole("tab", { name: "Setup", exact: true }).click();
  await expect(page.getByLabel("Opening greeting")).toHaveValue("Welcome to the repair desk.");
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Bot settings", exact: true }).click();
  await page.getByRole("button", { name: "Bot settings", exact: true }).click();
  await expect(page.getByLabel("Opening greeting")).toHaveValue("Welcome to the repair desk.");
  await capture(page, info, "studio-draft-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel(/Knowledge and rules/)).toHaveValue(
    "Ask for the appliance model before booking.",
  );
  await capture(page, info, "studio-draft-mobile");
});

for (const width of [320, 390, 1440]) {
  test(`public navigation reaches pricing and signup at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthenticated" } }),
    );
    await page.goto("/features");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const header = page.locator("header.wl-public-header");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await capture(page, info, `features-${width}`);
    if (width < 768) {
      await header.getByRole("button", { name: "Open navigation" }).click();
      await page.getByRole("menuitem", { name: "Pricing", exact: true }).click();
    } else await header.getByRole("link", { name: "Pricing", exact: true }).click();
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await header.getByRole("link", { name: "Start Free", exact: true }).click();
    await expect(page).toHaveURL(/\/signup\?plan=free/);
  });
}

for (const code of ["NAME_CONFLICT", "name_conflict", "BOT_MARK_CONFLICT", "bot_mark_conflict"]) {
  test(`creation conflict ${code} reveals and focuses the relevant control`, async ({ page }) => {
    await mockWorkspace(page);
    await page.route("**/api/agents", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 409, json: { code } });
      } else await route.fallback();
    });
    await page.goto("/studio?create=1");
    const dialog = page.getByRole("dialog", { name: "What should your Bot do?" });
    const brief = dialog.getByRole("textbox", { name: "Describe the Job" });
    await brief.fill("Book repair appointments.");
    await dialog.getByRole("button", { name: "Create Bot", exact: true }).click();
    await expect(dialog.getByRole("button", { name: /Name & appearance/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    if (code.toLowerCase() === "bot_mark_conflict") {
      await expect(
        dialog
          .getByRole("radiogroup", { name: "Bot identity symbol" })
          .getByRole("radio", { checked: true }),
      ).toBeFocused();
      await expect(dialog.getByRole("textbox", { name: /Bot Name/ })).not.toBeFocused();
      await expect(dialog.getByText(/Choose another mark or color/)).toBeVisible();
    } else await expect(dialog.getByRole("textbox", { name: /Bot Name/ })).toBeFocused();
    await expect(brief).toHaveValue("Book repair appointments.");
  });
}

test("password reset names and focuses the invalid field and permits reviewing both entries", async ({
  page,
}) => {
  let submissions = 0;
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/auth/reset-password") submissions += 1;
    await route.fulfill({ status: 401, json: { error: "Unauthenticated" } });
  });
  await page.goto("/reset-password#token=local-ui-test-only");
  // getByLabel includes the visual required marker; the accessible name omits it.
  const password = page.getByLabel(/^New password/);
  const confirm = page.getByLabel(/^Confirm new password/);
  await expect(password).toHaveAccessibleName("New password");
  await expect(confirm).toHaveAccessibleName("Confirm new password");
  await password.fill("onlylowercase");
  await confirm.fill("onlylowercase");
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(password).toBeFocused();
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAccessibleDescription(/uppercase/i);
  await password.fill("LocalTest123");
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(confirm).toBeFocused();
  await expect(confirm).toHaveAccessibleDescription("Passwords don't match.");
  await page.getByRole("button", { name: "Show passwords" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(confirm).toHaveAttribute("type", "text");
  expect(submissions).toBe(0);
  await expect(page).toHaveURL(/\/reset-password$/);
});
