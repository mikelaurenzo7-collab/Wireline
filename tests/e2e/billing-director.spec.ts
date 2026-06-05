import { test, expect } from "@playwright/test";
import { authenticatePage } from "../helpers/wireline-auth";
import { assertNoHorizontalOverflow } from "../helpers/ui";

/**
 * Authenticated smoke for revenue-critical Director chat and billing admin.
 * Structural only — does not require live Stripe or Director LLM responses.
 */
test.describe("Director workspace", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("/chat renders Director composer and capability surface", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /chat/i })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByTestId("director-workspace")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("director-composer")).toBeVisible({ timeout: 15_000 });
    await assertNoHorizontalOverflow(page);
  });
});

test.describe("Billing admin", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await authenticatePage(page, baseURL!);
  });

  test("/admin subscription tab shows billing card", async ({ page }) => {
    await page.goto("/admin?tab=subscription", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /settings|admin/i })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByTestId("admin-tab-subscription")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByText(/plan|subscription|usage|start free trial|manage billing/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await assertNoHorizontalOverflow(page);
  });
});
