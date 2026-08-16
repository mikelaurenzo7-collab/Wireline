import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

declare global {
  interface Window {
    __wirelineMicRequests?: number;
  }
}

async function openHomepage(page: Page) {
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

test("a protected-demo outage fails before microphone permission and exposes the phone path", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__wirelineMicRequests = 0;
    const mediaDevices = {
      getUserMedia: async () => {
        window.__wirelineMicRequests = (window.__wirelineMicRequests ?? 0) + 1;
        return {
          getTracks: () => [],
        } as unknown as MediaStream;
      },
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: mediaDevices,
    });
  });

  await page.route("**/api/public/demo-session", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "The protected live demo is temporarily unavailable.",
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await openHomepage(page);

  const console = page.locator(".landing-console");
  await console.getByRole("button", { name: "Hear It Live", exact: true }).click();

  await expect(console.getByRole("alert")).toContainText(
    "The protected live demo is temporarily unavailable",
  );
  await expect(console.getByText("Public demo line available", { exact: true })).toBeVisible();
  await expect(console.getByText("Standard carrier rates may apply.", { exact: true })).toBeVisible();
  await expect(console.getByRole("link", { name: "Hear It Live", exact: true })).toHaveAttribute(
    "href",
    /^tel:/,
  );

  expect(await page.evaluate(() => window.__wirelineMicRequests ?? 0)).toBe(0);
});
