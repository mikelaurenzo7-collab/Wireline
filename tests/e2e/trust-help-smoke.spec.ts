import { test, expect } from "@playwright/test";
import { authenticatePage } from "../helpers/wireline-auth";
import { gotoHydrated } from "../helpers/ui";

/**
 * Focused smoke for public trust (/status) and in-app help (/help).
 */
test.describe("Trust & help smoke", () => {
  test("/status shows live status chrome without false operational flash", async ({ page }) => {
    await gotoHydrated(page, "/status");

    const overall = page.getByTestId("status-overall");
    await expect(overall).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const h1 = page.getByRole("heading", { level: 1 });
    const initial = await h1.textContent();
    expect(initial?.toLowerCase()).toMatch(/checking|operational|degraded|outage|unavailable/);

    await expect(page.getByTestId("status-component-voice_runtime")).toBeVisible();
    await expect(page.getByTestId("status-component-reasoning")).toBeVisible();
  });

  test("/help renders Help Center for authenticated users", async ({ page, baseURL }) => {
    await authenticatePage(page, baseURL!);
    await page.goto("/help", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: /help/i })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(/quick paths/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /director/i })).toBeVisible();
  });
});
