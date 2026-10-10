import { expect, test } from "@playwright/test";

for (const width of [320, 1280]) {
  test(`outbound explains missing consent capability before a futile dial at ${width}px`, async ({
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
            : path === "/api/agent-config/outbound-bot"
              ? { personality: "Clear", directives: [] }
              : { data: [], numbers: [], keys: [], campaigns: [], messages: [], integrations: [] };
      await route.fulfill({ json });
    });

    await page.goto("/phone?tab=outbound");
    const opener = page.getByRole("button", { name: "Dial now", exact: true });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "New Outbound Call", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "Live outbound calling is gated until server-verifiable recipient consent records and Federal Do Not Call screening are in place.",
    );
    await expect(dialog.locator("input, textarea, select")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Place call", exact: true })).toHaveCount(0);
    const studio = dialog.getByRole("link", { name: "Rehearse in Studio", exact: true });
    await expect(studio).toHaveAttribute("href", "/studio?workroom=test");
    await expect(
      dialog.getByRole("link", { name: "Review Compliance", exact: true }),
    ).toHaveAttribute("href", "/settings/compliance");
    for (const control of [
      studio,
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
