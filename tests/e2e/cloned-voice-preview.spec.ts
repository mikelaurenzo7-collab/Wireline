import { expect, test, type Page } from "@playwright/test";

async function mockPreview(page: Page) {
  const renders: string[] = [];
  let revoked = false;
  // UI lifecycle proof only: audio and providers are mocked, never a voice-quality benchmark.
  await page.addInitScript(() => {
    Object.assign(window, {
      Audio: class {
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        async play() {}
        pause() {}
      },
    });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/preview")) {
      renders.push(url.searchParams.get("variant") ?? "clone");
      return route.fulfill({
        contentType: "audio/mpeg",
        body: Buffer.from("ID3mock-private-audio"),
      });
    }
    const json =
      path === "/api/auth/session"
        ? { user: { id: "preview-owner", email: "owner@example.test" } }
        : path === "/api/agents"
          ? { agents: [{ id: "preview-bot", name: "Front Desk", role: "receptionist" }] }
          : path === "/api/billing/status"
            ? {
                email_verified: true,
                channel_entitlements: {
                  plan_id: "omnichannel",
                  subscription_status: "active",
                  channels: ["voice", "email", "sms"],
                },
              }
            : path === "/api/voice/live-voices"
              ? {
                  available: true,
                  callsAvailable: false,
                  consentVersion: "test-consent",
                  biometricReleaseVersion: "test-release",
                  minSeconds: 10,
                  recommendedSeconds: 90,
                  maxSeconds: 120,
                  maxBytes: 6_000_000,
                  maxVoices: 2,
                  voices: revoked
                    ? []
                    : [
                        {
                          id: "private-voice",
                          name: "My Voice",
                          speaksOnCalls: false,
                          previewAvailable: true,
                          qualityScore: 85,
                          inUseByAgentIds: [],
                        },
                      ],
                }
              : path.startsWith("/api/agent-config/")
                ? {
                    voice: { provider: "openai", voiceId: "marin" },
                    personality: "Clear",
                    directives: [],
                  }
                : {
                    messages: [],
                    accounts: [],
                    numbers: [],
                    integrations: [],
                    data: [],
                    threads: [],
                  };
    return route.fulfill({ json });
  });
  return {
    renders,
    revoke: () => {
      revoked = true;
    },
  };
}

for (const width of [375, 1440]) {
  test(`private cloned preview is clear, replayable and revocable at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 950 });
    const fixture = await mockPreview(page);
    await page.goto("/studio?agent=preview-bot&section=setup&chat=setup");
    const studio = page.locator("#voice-clone");
    await expect(studio.getByText("Private preview only", { exact: false })).toBeVisible();
    await expect(studio.getByRole("button", { name: "Use Voice", exact: true })).toHaveCount(0);
    await expect(studio.getByText("Test Call", { exact: true })).toHaveCount(0);
    await expect(studio.getByText(/Phone calls keep their current voice/)).toBeVisible();

    const own = studio.getByRole("button", { name: "Your Voice", exact: true });
    const stock = studio.getByRole("button", { name: "Stock Fallback", exact: true });
    await own.click();
    await expect(own).toHaveAttribute("aria-pressed", "true");
    await expect(studio.getByText(/Preparing your preview/)).toHaveCount(0);
    await own.click();
    await own.click();
    await expect(own).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => fixture.renders).toEqual(["clone"]);
    await stock.click();
    await expect(stock).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => fixture.renders).toEqual(["clone", "stock"]);

    await studio.scrollIntoViewIfNeeded();
    await info.attach(`private-preview-${width}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    fixture.revoke();
    await own.click();
    await expect(studio.getByText("This voice preview is no longer available.")).toBeVisible();
    await expect(own).toHaveCount(0);
    expect(fixture.renders).toEqual(["clone", "stock"]);
  });
}

test("cloning names the processor and requires signed self-speaker permission", async ({
  page,
}) => {
  await mockPreview(page);
  await page.goto("/studio?agent=preview-bot&section=setup&chat=setup");
  const studio = page.locator("#voice-clone");
  await studio.getByRole("button", { name: "Clone Another Voice", exact: true }).click();
  await expect(studio.getByText(/ElevenLabs will process your recording/)).toBeVisible();
  await studio.getByRole("combobox", { name: /^Where do you live/ }).selectOption("US-IL");
  await expect(studio.getByText(/I am at least 18 years old/)).toBeVisible();
  await expect(studio.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
});
