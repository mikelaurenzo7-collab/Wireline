import { expect, test, type Page } from "@playwright/test";

const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const token = `${id}.${"a".repeat(43)}`;
const permission = {
  id,
  agent_id: "owned-bot",
  bot_name: "Front Desk",
  recipient_phone_masked: "••• ••• 0100",
  purpose: "callback",
  status: "pending",
  request_expires_at: "2026-10-18T15:00:00Z",
  expires_at: "2026-10-18T15:00:00Z",
  created_at: "2026-10-17T15:00:00Z",
  identity_assurance: "bearer_link_and_typed_signature",
};
const view = {
  permission,
  seller_name: "Example LLC",
  disclosure_hash: "a".repeat(64),
  disclosure:
    "I authorize Example LLC to call my number ending 0100 for one non-marketing callback using an artificial or AI-generated voice. This permission is not a condition of buying anything. My typed name is my electronic signature.",
  jurisdiction: { recipient_state: "IL", time_zone: "America/Chicago" },
};

async function setup(
  page: Page,
  handler: (path: string, body: Record<string, unknown>) => { status?: number; json: unknown },
) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/voice-permissions/recipient/")) {
      const result = handler(path, route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill(result);
    } else
      await route.fulfill({ json: path === "/api/auth/session" ? { user: null } : { data: [] } });
  });
}

async function expectPendingFormToFit(page: Page) {
  // Measure the pending form, not only the shorter success receipt that
  // replaces it. Document overflow alone misses clipped inner flex children.
  const pendingFit = await page.evaluate(() => {
    const form = document.querySelector("form")!;
    const heading = document.querySelector("h1")!;
    const content = [heading, ...form.querySelectorAll("p, label, span, button")];
    const controls = Array.from(form.querySelectorAll("input, button"));
    const describe = (element: Element) => `${element.tagName}.${element.className}`;
    const outside = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < -1 || rect.right > window.innerWidth + 1;
    };
    const clippedText = content.filter((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const bounds = element.getBoundingClientRect();
      return Array.from(range.getClientRects()).some(
        (rect) => rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1),
      );
    });
    return {
      documentOverflow: document.documentElement.scrollWidth > window.innerWidth,
      innerOverflow: content
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map(describe),
      outsideViewport: [...content, ...controls].filter(outside).map(describe),
      clippedText: clippedText.map(describe),
    };
  });
  expect(pendingFit).toEqual({
    documentOverflow: false,
    innerOverflow: [],
    outsideViewport: [],
    clippedText: [],
  });
}

test("a recipient can sign while session hydration hangs, without loading third-party marketing analytics", async ({
  page,
}) => {
  const thirdPartyRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/plausible|facebook|connect\.facebook|googletagmanager|google-analytics/i.test(url))
      thirdPartyRequests.push(url);
  });
  await setup(page, (path) => ({
    json: path.endsWith("/preview")
      ? view
      : { ...view, permission: { ...permission, status: "granted" } },
  }));
  await page.route("**/api/auth/session", () => new Promise<void>(() => {}));
  await page.goto(`/voice-permission#token=${token}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Call permission", exact: true })).toBeVisible();
  await page.getByLabel("Your phone number", { exact: true }).fill("3125550100");
  await page.getByLabel("Your full name", { exact: true }).fill("Taylor Example");
  await expectPendingFormToFit(page);
  await page.screenshot({
    path: "output/launch-completion-2026-10-17/permission-recipient-desktop.png",
    fullPage: true,
  });
  await page.getByRole("checkbox", { name: /I agree to the permission/ }).check();
  await page.getByRole("checkbox", { name: /These calls will reach me in Illinois/ }).check();
  await page.getByRole("button", { name: "Sign permission", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Permission saved");
  expect(thirdPartyRequests).toEqual([]);
  await expect(page).toHaveURL(/\/voice-permission$/);
});

test("recipient confirmation preserves its exact unknown-result draft at 320px and enlarged text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const confirmations: Array<Record<string, unknown>> = [];
  const calls: string[] = [];
  await setup(page, (path, body) => {
    calls.push(path);
    if (path.endsWith("/preview")) return { json: view };
    confirmations.push(body);
    return confirmations.length === 1
      ? { status: 503, json: { error: "Confirmation outcome is unknown. Retry the same request." } }
      : { json: { ...view, permission: { ...permission, status: "granted" } } };
  });
  await page.goto(`/voice-permission#token=${token}`);
  await expect(page.getByRole("heading", { name: "Call permission", exact: true })).toBeVisible();
  await expect(page.getByText("Example LLC", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/voice-permission$/);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page.getByLabel("Your phone number", { exact: true }).fill("3125550100");
  await page.getByLabel("Your full name", { exact: true }).fill("Taylor Example");
  await expectPendingFormToFit(page);
  await page.screenshot({
    path: "output/launch-completion-2026-10-17/permission-recipient-320-zoom.png",
    fullPage: true,
  });
  await page.getByRole("checkbox", { name: /I agree to the permission/ }).check();
  await page.getByRole("checkbox", { name: /These calls will reach me in Illinois/ }).check();
  await page.getByRole("button", { name: "Sign permission", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("outcome is unknown");
  await expect(page.getByLabel("Your full name", { exact: true })).toHaveValue("Taylor Example");
  await expect(page.getByLabel("Your full name", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Your phone number", { exact: true })).toBeDisabled();
  const retry = page.getByRole("button", { name: "Retry confirmation", exact: true });
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main").getByRole("status")).toContainText("Permission saved");
  expect(confirmations).toHaveLength(2);
  expect(confirmations[1]).toEqual(confirmations[0]);
  expect(confirmations[0]).toEqual({
    token,
    signer_name: "Taylor Example",
    phone: "3125550100",
    accepted: true,
    disclosure_hash: view.disclosure_hash,
    recipient_state: "IL",
    recipient_time_zone: "America/Chicago",
  });
  expect(calls.every((path) => path.endsWith("/preview") || path.endsWith("/confirm"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(
    await page.evaluate(() =>
      document.querySelector('meta[name="referrer"]')?.getAttribute("content"),
    ),
  ).toBe("no-referrer");
});

test("a malformed confirmation does not claim success and a retry accepts its actual used receipt", async ({
  page,
}) => {
  let confirmations = 0;
  await setup(page, (path) => {
    if (path.endsWith("/preview")) return { json: view };
    confirmations++;
    return {
      json: {
        ...view,
        permission: { ...permission, status: confirmations === 1 ? "pending" : "used" },
      },
    };
  });
  await page.goto(`/voice-permission#token=${token}`);
  await page.getByLabel("Your phone number", { exact: true }).fill("3125550100");
  await page.getByLabel("Your full name", { exact: true }).fill("Taylor Example");
  await page.getByRole("checkbox", { name: /I agree to the permission/ }).check();
  await page.getByRole("checkbox", { name: /These calls will reach me in Illinois/ }).check();
  await page.getByRole("button", { name: "Sign permission", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not be confirmed");
  await expect(page.getByText("Permission saved", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry confirmation", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "already authorized its one callback",
  );
  await expect(
    page.getByRole("button", { name: "Withdraw permission", exact: true }),
  ).toBeEnabled();
});

test("withdrawal waits for the actual receipt and remains retryable after failure", async ({
  page,
}) => {
  let revocations = 0;
  await setup(page, (path) => {
    if (path.endsWith("/preview"))
      return { json: { ...view, permission: { ...permission, status: "granted" } } };
    revocations++;
    return revocations === 1
      ? { status: 503, json: { error: "Withdrawal could not be saved." } }
      : { json: { permission: { ...permission, status: "revoked" } } };
  });
  await page.goto(`/voice-permission#token=${token}`);
  await page.getByRole("button", { name: "Withdraw permission", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not be saved");
  await expect(page.getByRole("main").getByRole("status")).toContainText("Permission saved");
  await page.getByRole("button", { name: "Withdraw permission", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Permission withdrawn");
  await expect(page.getByRole("button", { name: "Withdraw permission", exact: true })).toHaveCount(
    0,
  );
  expect(revocations).toBe(2);
});
