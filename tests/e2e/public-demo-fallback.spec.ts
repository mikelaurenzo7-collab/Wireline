import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

declare global {
  interface Window {
    __botboundMicRequests?: number;
  }
}

async function installMicrophoneProbe(page: Page) {
  await page.addInitScript(() => {
    window.__botboundMicRequests = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          window.__botboundMicRequests = (window.__botboundMicRequests ?? 0) + 1;
          return { getTracks: () => [] } as unknown as MediaStream;
        },
      },
    });
  });
}

async function openPage(page: Page, path: string) {
  await page.goto(path, { waitUntil: "commit", timeout: 60_000 });
  await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
}

test("showcase redirects to account creation without selecting a plan or requesting a microphone", async ({
  page,
}) => {
  await installMicrophoneProbe(page);
  const publicVoiceRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/public/demo-")) publicVoiceRequests.push(request.url());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, "/showcase");

  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Create Account", exact: true })).toBeVisible();
  await expect(page.locator("#showcase-preview")).toHaveCount(0);
  expect(publicVoiceRequests).toEqual([]);
  expect(await page.evaluate(() => window.__botboundMicRequests ?? 0)).toBe(0);
});

test("home offers neutral signup without selecting a plan or exposing a public audio control", async ({
  page,
}) => {
  await installMicrophoneProbe(page);
  const publicVoiceRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/public/demo-")) publicVoiceRequests.push(request.url());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, "/");

  const hero = page.locator(".landing-prestige__hero");
  await expect(hero.getByRole("link", { name: "Get Started", exact: true })).toHaveAttribute(
    "href",
    "/signup",
  );
  await page.getByRole("tab", { name: "Calls", exact: true }).click();
  await expect(page.getByRole("link", { name: "Explore Calls", exact: true })).toHaveAttribute(
    "href",
    "/features#calls",
  );
  await expect(page.getByRole("button", { name: /talk to/i })).toHaveCount(0);
  await expect(page.locator("audio, video")).toHaveCount(0);
  expect(publicVoiceRequests).toEqual([]);
  expect(await page.evaluate(() => window.__botboundMicRequests ?? 0)).toBe(0);
});

test("legacy public voice endpoints return deterministic provider-free retirement responses", async ({
  request,
}) => {
  for (const [method, path] of [
    ["get", "/api/public/assistant/Jake"],
    ["post", "/api/public/demo-session"],
    ["post", "/api/public/demo-call"],
  ] as const) {
    const response = await request[method](path);
    expect(response.status(), path).toBe(410);
    expect(await response.json()).toMatchObject({
      error: "Public voice previews have moved behind BotBound account access.",
      code: "public_voice_preview_retired",
      signupPath: "/signup?plan=free",
    });
  }
});
