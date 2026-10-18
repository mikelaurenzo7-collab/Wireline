import { expect, test, type Page } from "@playwright/test";

const permission = {
  id: "e2c86757-a3c0-42eb-a6bc-2405ffb0c09c",
  agent_id: "permission-bot",
  bot_name: "Front Desk",
  recipient_phone_masked: "•••0123",
  purpose: "callback",
  status: "pending",
  request_expires_at: "2099-10-20T00:00:00Z",
  expires_at: "2099-10-20T00:00:00Z",
  created_at: "2026-10-17T00:00:00Z",
  identity_assurance: "bearer_link_and_typed_signature",
};

async function setup(page: Page, recovery = false, malformedLink = false) {
  const creates: Record<string, unknown>[] = [];
  const externalActions: string[] = [];
  let rows = recovery ? [{ ...permission, status: "granted" }] : [];
  let reads = 0;
  let revokes = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/voice-permissions") {
      if (request.method() === "GET") {
        reads++;
        if (recovery && reads === 2) {
          await route.fulfill({
            json: { permissions: [{ ...permission, status: "unconfirmed" }] },
          });
        } else await route.fulfill({ json: { permissions: rows } });
      } else {
        creates.push(request.postDataJSON());
        rows = [permission];
        if (creates.length === 1 && !malformedLink) await route.abort("failed");
        else
          await route.fulfill({
            status: 201,
            json: {
              permission,
              capture_url:
                malformedLink && creates.length === 1
                  ? "https://unrelated.example/voice-permission#token=untrusted"
                  : `${new URL(request.url()).origin}/voice-permission#token=${"a".repeat(64)}`,
            },
          });
      }
      return;
    }
    if (path.endsWith("/revoke") && path.startsWith("/api/voice-permissions/")) {
      revokes++;
      if (revokes === 1)
        await route.fulfill({
          status: 409,
          json: { error: "Permission changed. Refresh before trying again." },
        });
      else {
        rows = [{ ...permission, status: "revoked" }];
        await route.fulfill({ json: { permission: rows[0] } });
      }
      return;
    }
    if (/outbound\/dial|\/send|phone-test/.test(path)) externalActions.push(path);
    await route.fulfill({
      json:
        path === "/api/auth/session"
          ? {
              user: {
                id: "permission-owner",
                email: "owner@example.test",
                email_verified_at: "2026-10-01T00:00:00Z",
              },
            }
          : path === "/api/agents"
            ? {
                agents: [
                  {
                    id: "permission-bot",
                    name: "Front Desk",
                    role: "receptionist",
                    phone_number: "+13125550123",
                  },
                ],
              }
            : path === "/api/billing/status"
              ? {
                  channel_entitlements: {
                    plan_id: "voice-light",
                    subscription_status: "active",
                    channels: ["voice"],
                    is_owner: false,
                  },
                }
              : { data: [], numbers: [], keys: [], campaigns: [], messages: [], integrations: [] },
    });
  });
  await page.goto("/phone?tab=outbound");
  await page.locator("summary").filter({ hasText: "Recipient permissions" }).click();
  const panel = page.getByRole("region", { name: "Recipient permissions", exact: true });
  await expect(panel).toBeVisible();
  return { panel, creates, externalActions };
}

test("a malformed capture link retains the original request and form", async ({ page }) => {
  const { panel, creates } = await setup(page, false, true);
  await panel.getByRole("button", { name: "New permission", exact: true }).click();
  await panel.getByRole("combobox", { name: "Bot", exact: true }).selectOption("permission-bot");
  await panel.getByRole("textbox", { name: "Recipient phone", exact: true }).fill("+13125550123");
  await panel.getByRole("combobox", { name: "Recipient location", exact: true }).selectOption("IL");
  await panel.getByRole("button", { name: "Create link", exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Recipient phone", exact: true })).toHaveValue(
    "+13125550123",
  );
  await expect(panel.getByRole("textbox", { name: "Permission link", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Create link", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Permission link", exact: true })).toBeVisible();
  expect(creates).toHaveLength(2);
  expect(creates[0].request_key).toBe(creates[1].request_key);
});

for (const width of [320, 1280]) {
  test(`permission creation preserves the request after a lost response at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const { panel, creates, externalActions } = await setup(page);
    await panel.getByRole("button", { name: "New permission", exact: true }).click();
    await panel.getByRole("combobox", { name: "Bot", exact: true }).selectOption("permission-bot");
    await panel.getByRole("textbox", { name: "Recipient phone", exact: true }).fill("+13125550123");
    await panel.getByRole("combobox", { name: "Recipient location", exact: true }).selectOption("IL");
    await panel.getByRole("button", { name: "Create link", exact: true }).click();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(panel.getByRole("textbox", { name: "Recipient phone", exact: true })).toHaveValue(
      "+13125550123",
    );
    await panel.getByRole("button", { name: "Create link", exact: true }).click();
    await expect(panel.getByRole("textbox", { name: "Permission link", exact: true })).toHaveValue(
      /\/voice-permission#token=/,
    );
    expect(creates).toHaveLength(2);
    expect(creates[0].request_key).toBe(creates[1].request_key);
    expect(creates[0]).not.toHaveProperty("hasExpressWrittenConsent");
    await expect(panel).toContainText("Awaiting recipient");
    await expect(panel).not.toContainText("Verified");
    await page.screenshot({
      path: `output/launch-completion-2026-10-17/permission-owner-${width}.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    expect(externalActions).toEqual([]);
  });
}

test("failed refresh and revoke retain confirmed permission state", async ({ page }) => {
  const { panel, externalActions } = await setup(page, true);
  await expect(panel).toContainText("Granted");
  await panel.getByRole("button", { name: "Refresh permissions", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Could not confirm");
  await expect(panel).toContainText("Granted");
  await panel.getByRole("button", { name: "Revoke", exact: true }).click();
  await panel.getByRole("button", { name: "Confirm revoke", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Permission changed");
  await expect(panel).toContainText("Granted");
  await panel.getByRole("button", { name: "Confirm revoke", exact: true }).click();
  await expect(panel).toContainText("Revoked");
  await expect(panel.getByRole("button", { name: "Revoke", exact: true })).toHaveCount(0);
  expect(externalActions).toEqual([]);
});
