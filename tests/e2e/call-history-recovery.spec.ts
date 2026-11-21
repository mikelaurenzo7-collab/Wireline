import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const recipient = "+13125550160";
const call = {
  id: "1",
  agent_id: "inspection-bot",
  agent_name: "Property Inspections",
  direction: "outbound",
  customer_number: recipient,
  duration_seconds: 0,
  summary: "Call was not answered (busy).",
  outcome_tag: "unreachable",
  ended_reason: "carrier-busy",
  created_at: "2026-11-21T19:58:00Z",
};

async function mockWorkspace(page: Page) {
  const callRequests: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    switch (path) {
      case "/api/auth/session":
        return route.fulfill({ json: { user: { id: "owner", email: "owner@example.test" } } });
      case "/api/billing/status":
        return route.fulfill({
          json: { email_verified: true, channel_entitlements: { channels: ["voice"] } },
        });
      case "/api/agents":
        return route.fulfill({
          json: {
            agents: [
              { id: "other-bot", name: "Front Desk", phone_number: "+13125550151" },
              { id: call.agent_id, name: call.agent_name, phone_number: "+13125550152" },
            ],
          },
        });
      case "/api/calls":
        return route.fulfill({ json: { calls: [call], total: 1, hasMore: false } });
      case "/api/outbound/dial":
        callRequests.push(request.postDataJSON());
        return route.fulfill({ status: 400, json: { error: "Unexpected call request" } });
      default:
        return route.fulfill({ json: { data: [], accounts: [], numbers: [], agents: [] } });
    }
  });
  return callRequests;
}

for (const width of [320, 1280]) {
  test(`a busy call opens a retry review for its recipient and Bot at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const callRequests = await mockWorkspace(page);
    await page.goto("/phone");
    if (width < 1024) await page.getByRole("button", { name: /555-0160/ }).click();

    const review = page.getByRole("button", { name: "Review Retry", exact: true });
    await expect(review).toBeVisible();
    const proofDir = process.env.BOTBOUND_WORKSPACE_PROOF_DIR;
    if (proofDir) await page.screenshot({ path: join(proofDir, `busy-report-${width}.png`) });
    await review.click();

    const dialog = page.getByRole("dialog", { name: "Review call", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Review call", exact: true })).toBeFocused();
    if (proofDir) await page.screenshot({ path: join(proofDir, `busy-review-${width}.png`) });
    const number = dialog.getByRole("textbox", { name: "Phone number" });
    await expect(number).toHaveValue(recipient);
    await expect(dialog.getByRole("combobox", { name: "Bot", exact: true })).toHaveValue(
      call.agent_id,
    );
    await expect(dialog.getByRole("button", { name: "Requested callback" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(dialog.getByRole("button", { name: "Place call", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(review).toBeFocused();

    await page.getByRole("button", { name: "New Call", exact: true }).click();
    const newCall = page.getByRole("dialog", { name: "New Call", exact: true });
    await expect(newCall.getByRole("textbox", { name: "Phone number" })).toHaveValue("");
    expect(callRequests).toEqual([]);
  });
}

test("changing the recipient clears saved and manually confirmed permission", async ({ page }) => {
  const callRequests = await mockWorkspace(page);
  let respondToSecondRecipient!: () => void;
  const secondRecipientLookup = new Promise<void>((resolve) => {
    respondToSecondRecipient = resolve;
  });
  await page.route("**/api/outbound/contact-context?*", async (route) => {
    const phone = new URL(route.request().url()).searchParams.get("phone");
    if (phone === "+13125550161") await secondRecipientLookup;
    const saved = phone === recipient;
    await route.fulfill({
      json: {
        permissionConfirmed: saved,
        nonsalesConfirmed: saved,
        customerSince: saved ? "2026-10-01" : null,
        suggestedPurpose: saved ? "existing_customer" : "appointment_service",
      },
    });
  });

  await page.goto("/phone?tab=outbound");
  await page.getByRole("button", { name: "New Call", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New Call", exact: true });
  const number = dialog.getByRole("textbox", { name: "Phone number" });
  const place = dialog.getByRole("button", { name: "Place call", exact: true });
  const permission = dialog.getByRole("checkbox", { name: /I have this person's permission/ });
  const nonsales = dialog.getByRole("checkbox", { name: /This isn't selling anything/ });
  await number.fill(recipient);
  await expect(place).toBeEnabled();
  await number.fill("(312) 555-0160");
  await expect(place).toBeEnabled();

  try {
    await number.fill("+13125550161");
    await expect(place).toBeDisabled({ timeout: 1500 });
    await expect(permission).not.toBeChecked();
    await expect(nonsales).not.toBeChecked();
    await expect(dialog.getByLabel("Approximate last purchase or service")).toHaveCount(0);
  } finally {
    respondToSecondRecipient();
  }
  await permission.check();
  await nonsales.check();
  await expect(place).toBeEnabled();
  await number.fill("+13125550162");
  await expect(place).toBeDisabled();
  await expect(permission).not.toBeChecked();
  await expect(nonsales).not.toBeChecked();
  expect(callRequests).toEqual([]);
});

for (const scale of [100, 200]) {
  test(`email status and its actions fit 320px with ${scale}% text`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await mockWorkspace(page);
    await page.route("**/api/billing/status", (route) =>
      route.fulfill({ status: 503, json: { error: "Billing temporarily unavailable" } }),
    );
    await page.goto("/phone");
    if (scale !== 100) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = `${size}%`;
      }, scale);
    }
    const message = page.getByText("Couldn't check your email status. Try checking again.");
    await expect(message).toBeVisible();
    await expect(page.getByRole("button", { name: "Check Status", exact: true })).toBeVisible();
    await expect
      .poll(() =>
        message.evaluate((element) => {
          const banner = element.closest('[role="status"]')!;
          const bounds = banner.getBoundingClientRect();
          return [element, ...banner.querySelectorAll("button")].every((control) => {
            const box = control.getBoundingClientRect();
            return (
              box.top >= bounds.top &&
              box.bottom <= bounds.bottom &&
              box.left >= bounds.left &&
              box.right <= bounds.right
            );
          });
        }),
      )
      .toBe(true);
    const proofDir = process.env.BOTBOUND_WORKSPACE_PROOF_DIR;
    if (proofDir) await page.screenshot({ path: join(proofDir, `email-status-320-${scale}.png`) });
  });
}
