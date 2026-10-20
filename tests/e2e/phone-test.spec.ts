import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page, lostResponse = false, rejectStart = false) {
  const starts: Record<string, unknown>[] = [];
  const ends: string[] = [];
  let status = "ringing";
  let id = "";
  const receipt = () => ({
    test: {
      id,
      agent_id: "bot-front-desk",
      status,
      expires_at: new Date(Date.now() + 120_000).toISOString(),
      ...(["ringing", "verifying"].includes(status) ? { verification_code: "123456" } : {}),
      phone_last4: "0123",
    },
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/agents/bot-front-desk/phone-test")) {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        starts.push(body);
        id = body.request_key;
        if (rejectStart) {
          await route.fulfill({ status: 400, json: { error: "Choose a supported US number." } });
          return;
        }
        if (lostResponse) {
          await route.abort("failed");
          return;
        }
      }
      if (route.request().method() === "DELETE") {
        ends.push(path);
        status = "ending";
      }
      await route.fulfill({ json: receipt() });
      return;
    }
    await route.fulfill({
      json:
        path === "/api/auth/session"
          ? {
              user: {
                id: "phone-qa",
                email: "owner@example.test",
                email_verified_at: "2026-10-01T00:00:00Z",
              },
            }
          : path === "/api/agents"
            ? {
                agents: [
                  {
                    id: "bot-front-desk",
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
                  },
                }
              : path.startsWith("/api/agent-config/")
                ? {
                    personality: "Clear",
                    voice: { voiceId: "marin", provider: "openai" },
                    directives: [],
                  }
                : { messages: [], accounts: [], numbers: [], integrations: [], data: [] },
    });
  });
  await page.goto("/studio?agent=bot-front-desk&workroom=test");
  await page.getByRole("button", { name: "Call my phone", exact: true }).click();
  return {
    starts,
    ends,
    finish: () => {
      status = "cancelled";
    },
  };
}

for (const width of [320, 1440]) {
  test(`self phone test shows a code and preserves one operation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await setup(page);
    if (width === 320)
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
    const dialog = page.getByRole("dialog", { name: "Phone Test", exact: true });
    await page
      .getByRole("textbox", { name: "Your phone number", exact: true })
      .fill("312.555.0123");
    await page
      .getByRole("checkbox", {
        name: "I’m requesting an AI test call to my own phone.",
        exact: true,
      })
      .check();
    await dialog.getByRole("button", { name: "Call my phone", exact: true }).click();
    await expect(page.getByText("Calling your phone", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Phone verification code", { exact: true })).toHaveText("123456");
    expect(state.starts).toHaveLength(1);
    expect(state.starts[0]).toMatchObject({ phone: "+13125550123", consent: true });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Call my phone", exact: true }).click();
    await expect(page.getByLabel("Phone verification code", { exact: true })).toBeVisible();
    expect(state.starts).toHaveLength(1);
    const rects = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return [...element.querySelectorAll("button,input,output,[data-slot='dialog-title']")].map(
        (node) => {
          const rect = node.getBoundingClientRect();
          return { outside: rect.left < box.left - 1 || rect.right > box.right + 1 };
        },
      );
    });
    expect(rects.filter((value) => value.outside)).toEqual([]);
    const endBox = await dialog
      .getByRole("button", { name: "End call", exact: true })
      .boundingBox();
    expect(endBox!.y + endBox!.height).toBeLessThanOrEqual(900);
    await page.screenshot({ path: `output/proofs/phone-test-${width}px.png` });
    await dialog.getByRole("button", { name: "End call", exact: true }).click();
    await expect(page.getByText("Ending your call", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "New test", exact: true })).toHaveCount(0);
    state.finish();
    await dialog.getByRole("button", { name: "Check call", exact: true }).click();
    await expect(page.getByText("Call ended", { exact: true })).toBeVisible();
    expect(state.ends).toHaveLength(1);
    await expect(dialog.getByRole("button", { name: "New test", exact: true })).toBeVisible();
  });
}

test("a lost POST response survives close and reload without a second call", async ({ page }) => {
  const state = await setup(page, true);
  const dialog = page.getByRole("dialog", { name: "Phone Test", exact: true });
  await page.getByRole("textbox", { name: "Your phone number", exact: true }).fill("3125550123");
  await page
    .getByRole("checkbox", { name: "I’m requesting an AI test call to my own phone.", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Call my phone", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Check call", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Call my phone", exact: true }).click();
  await expect(page.getByLabel("Phone verification code", { exact: true })).toHaveText("123456");
  expect(state.starts).toHaveLength(1);
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain("123456");
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain(
    "3125550123",
  );
});

test("a definite pre-call refusal keeps the entered phone editable", async ({ page }) => {
  const state = await setup(page, false, true);
  const dialog = page.getByRole("dialog", { name: "Phone Test", exact: true });
  await page.getByRole("textbox", { name: "Your phone number", exact: true }).fill("3125550123");
  await page
    .getByRole("checkbox", { name: "I’m requesting an AI test call to my own phone.", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Call my phone", exact: true }).click();
  await expect(page.getByText("Choose a supported US number.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your phone number", exact: true })).toHaveValue(
    "3125550123",
  );
  expect(state.starts).toHaveLength(1);
});
