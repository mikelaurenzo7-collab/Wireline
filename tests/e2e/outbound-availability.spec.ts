import { expect, test } from "@playwright/test";

for (const width of [320, 1280]) {
  test(`outbound opens the business call review without bypassing permission at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    const dialRequests: string[] = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/billing/status") {
        await route.fulfill({
          json: {
            channel_entitlements: {
              plan_id: "voice",
              subscription_status: "active",
              channels: ["voice"],
              is_owner: false,
            },
          },
        });
        return;
      }
      if (path === "/api/outbound/dial") dialRequests.push(request.method());
      const json =
        path === "/api/auth/session"
          ? {
              user: {
                id: "outbound-owner",
                email: "owner@example.test",
                email_verified_at: "2026-09-25T00:00:00Z",
              },
            }
          : path === "/api/agents"
            ? {
                agents: [
                  {
                    id: "outbound-bot",
                    name: "Front Desk",
                    role: "receptionist",
                    phone_number: "+13125551234",
                  },
                ],
              }
            : path === "/api/voice-permissions"
              ? { permissions: [], calling: { general: false, nonMarketing: true } }
              : path === "/api/agent-config/outbound-bot"
                ? { personality: "Clear", directives: [] }
                : {
                    data: [],
                    numbers: [],
                    keys: [],
                    campaigns: [],
                    messages: [],
                    integrations: [],
                  };
      await route.fulfill({ json });
    });

    await page.goto("/phone?tab=outbound");
    const opener = page.getByRole("button", { name: "New call", exact: true }).first();
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "New call", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Bot", { exact: true })).toHaveValue("outbound-bot");
    await expect(dialog.getByRole("textbox", { name: "Phone number", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Place call", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("option", { name: "Marketing or sales" })).toHaveCount(0);
    for (const control of [
      dialog.getByRole("textbox", { name: "Phone number", exact: true }),
      dialog.getByRole("button", { name: "Close", exact: true }).last(),
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(740);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    expect(dialRequests).toEqual([]);
  });
}
