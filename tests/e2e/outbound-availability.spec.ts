import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

for (const width of [320, 1280]) {
  test(`personal calls open review without bypassing permission at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    const outboundWrites: string[] = [];
    const campaignDrafts: Array<Record<string, unknown>> = [];
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
      if (
        request.method() === "POST" &&
        /^\/api\/(?:outbound|campaigns|cadences|callbacks)(?:\/|$)/.test(path)
      )
        outboundWrites.push(path);
      if (request.method() === "POST" && path === "/api/campaigns") {
        campaignDrafts.push(request.postDataJSON());
        await route.fulfill({ json: { campaign: { id: "review-draft", status: "draft" } } });
        return;
      }
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
                    id: "business-bot",
                    name: "Business Front Desk",
                    role: "receptionist",
                    isBusinessAgent: true,
                    phone_number: "+13125551235",
                  },
                  {
                    id: "outbound-bot",
                    name: "Personal Assistant",
                    role: "personal_assistant",
                    isBusinessAgent: false,
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
    await expect(page.getByRole("combobox", { name: "Outbound section" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Lead Hunt|Sequences|Callbacks/ })).toHaveCount(0);
    const opener = page.getByRole("button", { name: "New Call", exact: true }).first();
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "New Call", exact: true });
    await expect(dialog).toBeVisible();
    if (width === 320) {
      // Raw controls in the portalled dialog need the same mobile type floor
      // as shared inputs, without starting a call or changing consent gates.
      for (const field of [
        dialog.getByRole("textbox", { name: "Phone number", exact: true }),
        dialog.getByRole("textbox", { name: "Instruction (optional)", exact: true }),
        dialog.getByRole("combobox", { name: "Bot", exact: true }),
      ]) {
        await expect
          .poll(() => field.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)))
          .toBeGreaterThanOrEqual(16);
      }
    }
    if (process.env.BOTBOUND_WORKSPACE_PROOF_DIR) {
      await mkdir(process.env.BOTBOUND_WORKSPACE_PROOF_DIR, { recursive: true });
      await page.screenshot({
        path: join(process.env.BOTBOUND_WORKSPACE_PROOF_DIR, `synthetic-call-dialog-${width}.png`),
      });
    }
    await expect(dialog.getByRole("combobox", { name: "Bot", exact: true })).toHaveValue(
      "business-bot",
    );
    await expect(
      dialog.getByRole("combobox", { name: "Bot", exact: true }).getByRole("option"),
    ).toHaveText(["Business Front Desk", "Personal Assistant"]);
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
    expect(outboundWrites).toEqual([]);
    await page.goto("/phone?tab=outbound&view=campaigns&agent=business-bot");
    await expect(page.getByRole("button", { name: "Campaigns", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "New Call", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Create Campaign", exact: true }).click();
    await page.getByRole("textbox", { name: "Campaign name" }).fill("Requested Follow-up");
    await page.getByRole("combobox", { name: "Assign Bot" }).click();
    await expect(page.getByRole("option", { name: "Business Front Desk" })).toBeVisible();
    await expect(
      page.getByRole("option", { name: /Personal Assistant|No Bot Assigned/ }),
    ).toHaveCount(0);
    await page.getByRole("option", { name: "Business Front Desk" }).click();
    await page.getByRole("button", { name: "Create Draft", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Campaign name" })).toHaveCount(0);
    expect(campaignDrafts).toEqual([
      expect.objectContaining({ name: "Requested Follow-up", agent_id: "business-bot" }),
    ]);
    expect(outboundWrites).toEqual(["/api/campaigns"]);
  });
}
