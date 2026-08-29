import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

declare global {
  interface Window {
    __wirelineMicRequests?: number;
  }
}

async function openPublicPage(page: Page, path = "/showcase") {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(path, { waitUntil: "commit", timeout: 60_000 });
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
  await openPublicPage(page);

  const preview = page.getByText("LIVE PHONE PREVIEW", { exact: true }).locator("..");
  await preview.getByRole("button", { name: "Talk to Jordan", exact: true }).click();

  await expect(preview.getByRole("alert")).toContainText(
    "The protected live demo is temporarily unavailable",
  );
  await expect(
    preview.getByText("Standard carrier rates may apply.", { exact: true }),
  ).toBeVisible();
  await expect(
    preview.getByRole("link", { name: "CALL A DEMO LINE", exact: true }),
  ).toHaveAttribute("href", "#demo-lines");
  await expect(page.locator("#demo-lines").getByRole("link").first()).toHaveAttribute(
    "href",
    /^tel:/,
  );
  await expect(preview.getByRole("button", { name: "Talk to Jordan", exact: true })).toBeEnabled();

  expect(await page.evaluate(() => window.__wirelineMicRequests ?? 0)).toBe(0);
});

test("the homepage demo outage keeps retry and demo-line recovery available", async ({ page }) => {
  await page.addInitScript(() => {
    window.__wirelineMicRequests = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          window.__wirelineMicRequests = (window.__wirelineMicRequests ?? 0) + 1;
          return { getTracks: () => [] } as unknown as MediaStream;
        },
      },
    });
  });
  await page.route("**/api/public/demo-session", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "The protected live demo is temporarily unavailable." }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await openPublicPage(page, "/");

  const preview = page.locator(".landing-demo-inline");
  const retry = preview.getByRole("button", { name: "Talk to Jordan", exact: true });
  await retry.click();

  await expect(preview.getByRole("alert")).toContainText(
    "The protected live demo is temporarily unavailable",
  );
  await expect(retry).toBeEnabled();
  await expect(
    preview.getByRole("link", { name: "Call a demo line", exact: true }),
  ).toHaveAttribute("href", "/showcase#demo-lines");
  expect(await page.evaluate(() => window.__wirelineMicRequests ?? 0)).toBe(0);
});
