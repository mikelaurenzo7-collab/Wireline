import { expect, test } from "@playwright/test";

test("personal MCP proposal stays immutable, places once after review, and reconciles on reopen", async ({
  page,
}) => {
  const requestKey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const permissionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const prepared = {
    request_key: requestKey,
    agent_id: "personal-bot",
    phone: "+13125550123",
    instruction: "Confirm the time of my requested appointment.",
    call_purpose: "service_or_requested",
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/outbound/dial" && route.request().method() === "POST") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true, callId: `CA${"1".repeat(32)}` } });
    }
    const json =
      path === "/api/auth/session"
        ? { user: { id: "personal-owner", email: "owner@example.test" } }
        : path.startsWith("/api/outbound/contact-context")
          ? {
              // The recipient permission is already on record, so the dialog
              // only asks for the one-time non-sales confirmation.
              permissionConfirmed: true,
              nonsalesConfirmed: false,
            }
          : path === "/api/agents"
            ? {
                agents: [
                  {
                    id: "personal-bot",
                    name: "Personal Assistant",
                    role: "personal_assistant",
                    isBusinessAgent: false,
                    channel: "voice",
                  },
                ],
              }
            : path === "/api/phone-numbers"
              ? { numbers: [{ agent_id: "personal-bot", phone_number: "+13125550124" }] }
              : path === "/api/billing/status"
                ? {
                    channel_entitlements: {
                      plan_id: "voice",
                      subscription_status: "active",
                      channels: ["voice"],
                      is_owner: false,
                    },
                  }
                : path === `/api/outbound/prepared/${requestKey}`
                  ? {
                      prepared,
                      status: {
                        request_key: requestKey,
                        status: writes.length ? "accepted" : "awaiting_review",
                      },
                    }
                  : path === "/api/voice-permissions"
                    ? {
                        calling: { general: false, nonMarketing: true },
                        permissions: [
                          {
                            id: permissionId,
                            agent_id: "personal-bot",
                            bot_name: "Personal Assistant",
                            recipient_phone_masked: "••• ••• 0123",
                            purpose: "service_or_requested",
                            status: "granted",
                            request_expires_at: prepared.expires_at,
                            expires_at: prepared.expires_at,
                            created_at: new Date().toISOString(),
                            identity_assurance: "bearer_link_and_typed_signature",
                          },
                        ],
                      }
                    : { accounts: [], agents: [], numbers: [], data: [] };
    return route.fulfill({ json });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  const url = `/phone?tab=outbound&callRequest=${requestKey}`;
  await page.goto(url);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Review call" })).toBeVisible();
  await expect(dialog.getByLabel("Phone number", { exact: true })).toHaveValue(prepared.phone);
  await expect(dialog.getByLabel("Phone number", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Instruction (optional)")).toBeDisabled();
  await expect(dialog.getByRole("combobox", { name: "Call type" })).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Recipient permission" })).toHaveCount(0);
  expect(writes).toHaveLength(0);
  // Non-sales calls need the owner's one-time "this isn't selling" confirmation
  // before the review dialog can place the call.
  await expect(dialog.getByRole("button", { name: "Place call", exact: true })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /This isn't selling anything\./ }).check();
  await expect(dialog.getByRole("button", { name: "Place call", exact: true })).toBeEnabled();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  await dialog.getByRole("button", { name: "Place call", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    requestKey,
    preparedRequestId: requestKey,
    agentId: prepared.agent_id,
    customerNumber: prepared.phone,
    context: prepared.instruction,
    // The prepared request's own purpose is preserved through review.
    callPurpose: "service_or_requested",
  });
  expect(writes[0].consentArtifactId).toBeUndefined();
  await page.goto(url);
  await expect(
    page.getByText("This call has already been submitted. Check History for its progress."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Place call", exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(1);
});
